//! `POST /api/run` — batch evaluation.
//!
//! The response is a streamed sequence of newline-delimited JSON objects
//! (`application/x-ndjson`) so the client can show live progress:
//!
//! ```text
//! {"type":"status","phase":"compiling"}
//! {"type":"status","phase":"compiled"}
//! {"type":"status","phase":"running"}
//! {"type":"status","phase":"done"}
//! {"type":"result","results":{...},"stats":{"time_ms":12,"tuples":5}}
//! ```
//!
//! When `options.profile` is set, the binary is compiled with `-P` and, after
//! the result, the FlowLog profile visualizer renders a self-contained HTML
//! report streamed as a trailing line:
//!
//! ```text
//! {"type":"status","phase":"profiling"}
//! {"type":"report","html":"<!doctype html>..."}
//! ```
//!
//! Report generation is best-effort: if it fails, a non-fatal
//! `{"type":"report_error","text":"..."}` line is sent and the results still
//! stand.
//!
//! A fatal failure (compile/run) is reported as a single
//! `{"type":"error","text":"..."}` line.

use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::{Arc, LazyLock};

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use regex::Regex;
use serde::Deserialize;
use serde_json::json;
use tokio::fs;
use tokio::io::BufReader;
use tokio::sync::{mpsc, Semaphore};
use tokio_stream::wrappers::ReceiverStream;

use crate::config::Config;
use crate::flowlog::{self, Mode};

/// Only one server-side dataset run (the Galen demo) may execute at a time:
/// they use many threads and build large intermediates, so concurrent runs
/// could exhaust the box. Non-dataset runs are unaffected.
static DATASET_RUN_SLOT: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(1));

#[derive(Deserialize)]
pub struct RunRequest {
    program: String,
    #[serde(default)]
    facts: HashMap<String, String>,
    #[serde(default)]
    options: Options,
}

#[derive(Deserialize)]
struct Options {
    #[serde(default = "default_workers")]
    workers: u32,
    /// When true, compile with `-P` and generate a self-contained profile
    /// report alongside the results.
    #[serde(default)]
    profile: bool,
    /// Name of a server-side dataset to stage into the run's inputs (its
    /// `*.csv` files are linked into the facts dir). Used by the Galen demo,
    /// whose dataset is too large to upload inline.
    #[serde(default)]
    dataset: Option<String>,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            workers: default_workers(),
            profile: false,
            dataset: None,
        }
    }
}

fn default_workers() -> u32 {
    4
}

/// Parse `.printsize` lines like `[size][p] t=() size=12345` from a program's
/// stdout into a `{ relation: count }` JSON map (empty for normal programs).
/// Max rows per output relation streamed to the browser. The true total is
/// reported separately (in `sizes`) so the UI can show "first N of M".
const MAX_RESULT_ROWS: usize = 100;

/// Capture the first `max_rows` lines of an output file for display and count
/// its total rows — via a byte-level scan, so multi-million-row relations
/// (e.g. Doop's VarPointsTo) are counted in one fast streaming pass instead of
/// allocating a String per line. Rows are assumed newline-terminated with no
/// blank lines (FlowLog's output format).
async fn read_capped(
    path: &std::path::Path,
    max_rows: usize,
) -> std::io::Result<(String, usize)> {
    use tokio::io::AsyncReadExt;
    let file = fs::File::open(path).await?;
    let mut reader = BufReader::with_capacity(256 * 1024, file);
    let mut buf = [0u8; 64 * 1024];
    let mut total = 0usize;
    let mut preview: Vec<u8> = Vec::new();
    let mut preview_lines = 0usize;
    let mut capturing = true;
    let mut last: u8 = b'\n';
    loop {
        let n = reader.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        let chunk = &buf[..n];
        last = chunk[n - 1];
        for &b in chunk {
            if b == b'\n' {
                total += 1;
            }
            if capturing {
                preview.push(b);
                if b == b'\n' {
                    preview_lines += 1;
                    if preview_lines >= max_rows {
                        capturing = false;
                    }
                }
            }
        }
    }
    // A final line with no trailing newline still counts as a row.
    if last != b'\n' && (total > 0 || !preview.is_empty()) {
        total += 1;
    }
    let preview = String::from_utf8_lossy(&preview).trim_end().to_string();
    Ok((preview, total))
}

fn parse_sizes(stdout: &str) -> serde_json::Map<String, serde_json::Value> {
    static RE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\[size\]\[([^\]]+)\][^\n]*?size=(\d+)").unwrap());
    let mut out = serde_json::Map::new();
    for caps in RE.captures_iter(stdout) {
        if let Ok(n) = caps[2].parse::<u64>() {
            out.insert(caps[1].to_string(), json!(n));
        }
    }
    out
}

/// Validate a client-supplied fact filename: a bare basename, no path
/// traversal, restricted to a safe character set.
pub fn sanitize_filename(name: &str) -> Option<String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 128 || name.starts_with('.') {
        return None;
    }
    let ok = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    ok.then(|| name.to_string())
}

pub async fn run_handler(
    State(cfg): State<Arc<Config>>,
    Json(req): Json<RunRequest>,
) -> Response {
    // Synchronous validation — rejected before any streaming starts.
    if req.program.len() > cfg.max_program_bytes {
        return (
            StatusCode::BAD_REQUEST,
            format!(
                "Program is too large ({} bytes; limit {}).",
                req.program.len(),
                cfg.max_program_bytes
            ),
        )
            .into_response();
    }
    let total_facts: usize = req.facts.values().map(|v| v.len()).sum();
    if total_facts > cfg.max_total_fact_bytes {
        return (
            StatusCode::BAD_REQUEST,
            format!(
                "Input facts are too large ({total_facts} bytes; limit {}).",
                cfg.max_total_fact_bytes
            ),
        )
            .into_response();
    }
    for name in req.facts.keys() {
        if sanitize_filename(name).is_none() {
            return (
                StatusCode::BAD_REQUEST,
                format!("Invalid fact filename: {name:?}"),
            )
                .into_response();
        }
    }
    // A requested dataset must be a known directory under `datasets_dir`
    // (`sanitize_filename` rejects `..`/absolute paths, so no traversal).
    if let Some(name) = &req.options.dataset {
        let ok = sanitize_filename(name).is_some_and(|s| cfg.datasets_dir.join(s).is_dir());
        if !ok {
            return (StatusCode::BAD_REQUEST, format!("Unknown dataset: {name:?}")).into_response();
        }
    }

    // Only dataset runs (the Galen demo) may use the higher worker cap.
    let worker_cap = if req.options.dataset.is_some() {
        cfg.max_dataset_workers
    } else {
        cfg.max_workers
    };
    let workers = req.options.workers.clamp(1, worker_cap);

    let (tx, rx) = mpsc::channel::<Result<String, Infallible>>(16);
    tokio::spawn(batch_job(cfg, req, workers, tx));

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/x-ndjson")
        .header(header::CACHE_CONTROL, "no-cache")
        .body(Body::from_stream(ReceiverStream::new(rx)))
        .unwrap()
}

fn ndjson(v: serde_json::Value) -> Result<String, Infallible> {
    Ok(format!("{v}\n"))
}

/// Background task: compile, run, and stream progress + results to `tx`.
async fn batch_job(
    cfg: Arc<Config>,
    req: RunRequest,
    workers: u32,
    tx: mpsc::Sender<Result<String, Infallible>>,
) {
    // Send a JSON line; bail out if the client has disconnected.
    macro_rules! emit {
        ($v:expr) => {{
            if tx.send(ndjson($v)).await.is_err() {
                return;
            }
        }};
    }

    // Dataset runs hold the single shared slot for the whole job (compile +
    // run + report). A second concurrent dataset run is refused rather than
    // piling load onto the box.
    let _dataset_permit = if req.options.dataset.is_some() {
        match DATASET_RUN_SLOT.try_acquire() {
            Ok(permit) => Some(permit),
            Err(_) => {
                emit!(json!({
                    "type": "error",
                    "text": "A Galen run is already in progress on the server. \
                             Please wait for it to finish and try again.",
                }));
                return;
            }
        }
    } else {
        None
    };

    emit!(json!({"type": "status", "phase": "compiling"}));
    let bin = match flowlog::compile(&cfg, &req.program, Mode::Batch, req.options.profile).await {
        Ok(b) => b,
        Err(e) => {
            emit!(json!({"type": "error", "text": e.to_string()}));
            return;
        }
    };
    emit!(json!({"type": "status", "phase": "compiled"}));

    // Fresh per-request scratch directory — isolates concurrent users and is
    // removed automatically when `work` is dropped.
    let work = match tempfile::tempdir_in(&cfg.work_dir) {
        Ok(w) => w,
        Err(e) => {
            emit!(json!({"type": "error", "text": format!("server error: {e}")}));
            return;
        }
    };
    let facts_dir = work.path().join("facts");
    let out_dir = work.path().join("out");

    let setup = async {
        fs::create_dir_all(&facts_dir).await?;
        fs::create_dir_all(&out_dir).await?;
        // Inline facts first — they're real files and take precedence.
        for (name, content) in &req.facts {
            let fname = sanitize_filename(name).expect("validated in run_handler");
            fs::write(facts_dir.join(fname), content).await?;
        }
        // Then link the dataset's CSVs (absolute target) for any name an inline
        // fact didn't already provide. Symlinking avoids copying a large
        // dataset per request; writing inline facts first ensures we never
        // write *through* a link back into the shared dataset.
        if let Some(name) = &req.options.dataset {
            let safe = sanitize_filename(name).expect("validated in run_handler");
            let ds = fs::canonicalize(cfg.datasets_dir.join(safe)).await?;
            let mut entries = fs::read_dir(&ds).await?;
            while let Some(entry) = entries.next_entry().await? {
                let src = entry.path();
                // Stage data files only. CSV (Galen) and .facts (Doop/Tomcat)
                // are linked; a stray .dl or README in the dataset dir is not.
                let ext = src.extension().and_then(|e| e.to_str());
                if ext != Some("csv") && ext != Some("facts") {
                    continue;
                }
                let dest = facts_dir.join(entry.file_name());
                if !fs::try_exists(&dest).await? {
                    fs::symlink(&src, &dest).await?;
                }
            }
        }
        Ok::<(), std::io::Error>(())
    };
    if let Err(e) = setup.await {
        emit!(json!({"type": "error", "text": format!("server error: {e}")}));
        return;
    }

    emit!(json!({"type": "status", "phase": "running"}));
    let (elapsed, stdout) = match flowlog::run_batch(&cfg, &bin, work.path(), workers).await {
        Ok(d) => d,
        Err(e) => {
            emit!(json!({"type": "error", "text": e.to_string()}));
            return;
        }
    };
    emit!(json!({"type": "status", "phase": "done"}));

    // Every `.csv` under `out/` is an output relation. A whole-program analysis
    // (e.g. Doop on Tomcat) can emit millions of tuples per relation, far too
    // many to ship to the browser, so we send only the first MAX_RESULT_ROWS of
    // each and report the true total separately (in `sizes`).
    let mut results = serde_json::Map::new();
    let mut sizes = serde_json::Map::new();
    let mut tuples = 0usize;
    match fs::read_dir(&out_dir).await {
        Ok(mut entries) => {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let path = entry.path();
                // FlowLog writes one file per `.output` relation, named after
                // the relation (lower-cased, with no extension).
                if !entry.file_type().await.map(|t| t.is_file()).unwrap_or(false) {
                    continue;
                }
                let Some(fname) = path.file_name().and_then(|s| s.to_str()) else {
                    continue;
                };
                let relation = fname.strip_suffix(".csv").unwrap_or(fname).to_string();
                if let Ok((preview, total)) = read_capped(&path, MAX_RESULT_ROWS).await {
                    tuples += total;
                    results.insert(relation.clone(), json!(preview));
                    sizes.insert(relation, json!(total));
                }
            }
        }
        Err(e) => {
            emit!(json!({"type": "error", "text": format!("server error: {e}")}));
            return;
        }
    }

    // `.printsize R` relations aren't materialized to `out/`, but the engine
    // prints their cardinalities to stdout. Merge those in (without clobbering
    // a real per-relation count) so printsize-only programs still show sizes.
    for (rel, n) in parse_sizes(&stdout) {
        sizes.entry(rel).or_insert(n);
    }

    emit!(json!({
        "type": "result",
        "results": results,
        "sizes": sizes,
        "stats": {
            "time_ms": elapsed.as_millis() as u64,
            "tuples": tuples,
            "profiled": req.options.profile,
        },
    }));

    // Profile report — best effort. The run itself already succeeded, so any
    // failure here is reported as a non-fatal `report_error` rather than
    // failing the whole request.
    if req.options.profile {
        emit!(json!({"type": "status", "phase": "profiling"}));
        match flowlog::render_report(&cfg, work.path()).await {
            Ok(html) => emit!(json!({"type": "report", "html": html})),
            Err(e) => emit!(json!({"type": "report_error", "text": e.to_string()})),
        }
    }
}
