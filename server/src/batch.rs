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
//! A failure is reported as a single `{"type":"error","text":"..."}` line.

use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use tokio::fs;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use crate::config::Config;
use crate::flowlog::{self, Mode};

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
    #[serde(default)]
    optimization: u32,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            workers: default_workers(),
            optimization: 0,
        }
    }
}

fn default_workers() -> u32 {
    4
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

    let workers = req.options.workers.clamp(1, cfg.max_workers);
    // Playground -O levels: 1 = SIP, 3 = SIP + planning. FlowLog exposes the
    // `--sip` flag; there is no separate planning flag yet.
    let sip = matches!(req.options.optimization, 1 | 3);

    let (tx, rx) = mpsc::channel::<Result<String, Infallible>>(16);
    tokio::spawn(batch_job(cfg, req, workers, sip, tx));

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
    sip: bool,
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

    emit!(json!({"type": "status", "phase": "compiling"}));
    let bin = match flowlog::compile(&cfg, &req.program, Mode::Batch, sip).await {
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
        for (name, content) in &req.facts {
            let fname = sanitize_filename(name).expect("validated in run_handler");
            fs::write(facts_dir.join(fname), content).await?;
        }
        Ok::<(), std::io::Error>(())
    };
    if let Err(e) = setup.await {
        emit!(json!({"type": "error", "text": format!("server error: {e}")}));
        return;
    }

    emit!(json!({"type": "status", "phase": "running"}));
    let elapsed = match flowlog::run_batch(&cfg, &bin, work.path(), workers).await {
        Ok(d) => d,
        Err(e) => {
            emit!(json!({"type": "error", "text": e.to_string()}));
            return;
        }
    };
    emit!(json!({"type": "status", "phase": "done"}));

    // Every `.csv` under `out/` is an output relation.
    let mut results = serde_json::Map::new();
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
                if let Ok(content) = fs::read_to_string(&path).await {
                    tuples += content.lines().filter(|l| !l.trim().is_empty()).count();
                    results.insert(relation, json!(content));
                }
            }
        }
        Err(e) => {
            emit!(json!({"type": "error", "text": format!("server error: {e}")}));
            return;
        }
    }

    emit!(json!({
        "type": "result",
        "results": results,
        "stats": { "time_ms": elapsed.as_millis() as u64, "tuples": tuples },
    }));
}
