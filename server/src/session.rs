//! `WS /api/session` — incremental (interactive) evaluation.
//!
//! Protocol (dictated by the playground client):
//!
//! * Client opens the socket (optionally with `?profile=true`), then sends
//!   `{"type":"init","program":...,"facts":...}`.
//! * Client sends `{"type":"command","command":"begin"}` etc.
//! * Server replies with `{"type":"output|info|error","text":...}` lines and,
//!   after each commit, `{"type":"result","results":...,"stats":...}`.
//!
//! The server compiles the program in incremental mode, spawns the generated
//! interactive shell, and bridges its stdin/stdout to the WebSocket.
//!
//! When started with `profile=true`, the binary is compiled with `-P` and each
//! commit writes a per-timestamp snapshot under `program_log/`. The client can
//! then send `{"type":"profile"}` to have the server render the snapshots so
//! far into a self-contained report, returned as `{"type":"report","html":...}`
//! (best-effort: failures come back as `{"type":"report_error","text":...}`).

use std::collections::{HashMap, HashSet};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use futures_util::stream::{SplitStream, StreamExt};
use futures_util::SinkExt;
use serde::Deserialize;
use serde_json::json;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::config::Config;
use crate::flowlog::{self, Mode};

#[derive(Deserialize)]
pub struct SessionParams {
    workers: Option<u32>,
    /// When true, compile the session binary with `-P` so each commit writes a
    /// per-timestamp profiling snapshot under `program_log/`.
    #[serde(default)]
    profile: bool,
    /// Optional server-side dataset to stage into the session's working dir so
    /// the engine auto-loads it at startup (the "preload"). Same datasets as
    /// batch (e.g. `tomcat`); too large to send inline over the socket.
    dataset: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum ClientMsg {
    Init {
        program: String,
        #[serde(default)]
        facts: HashMap<String, String>,
    },
    Command {
        command: String,
    },
    /// Render a profile report from the snapshots accumulated so far. Only
    /// meaningful when the session was started with `profile=true`.
    Profile,
}

pub async fn session_handler(
    State(cfg): State<Arc<Config>>,
    Query(params): Query<SessionParams>,
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(move |socket| handle_session(socket, cfg, params))
}

/// Build a `{"type":kind,"text":text}` text frame.
fn text_msg(kind: &str, text: &str) -> Message {
    Message::Text(json!({ "type": kind, "text": text }).to_string().into())
}

/// Build a `{"type":"report","html":...}` frame carrying a self-contained
/// profile report.
fn report_msg(html: &str) -> Message {
    Message::Text(json!({ "type": "report", "html": html }).to_string().into())
}

async fn handle_session(socket: WebSocket, cfg: Arc<Config>, params: SessionParams) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    // All outbound frames funnel through one channel so the stdout pump and
    // the command loop can both write to the socket.
    let (out_tx, mut out_rx) = mpsc::channel::<Message>(512);

    let writer = tokio::spawn(async move {
        while let Some(m) = out_rx.recv().await {
            if ws_tx.send(m).await.is_err() {
                break;
            }
        }
    });

    if let Err(e) = run_session(&cfg, params, &mut ws_rx, &out_tx).await {
        let _ = out_tx.send(text_msg("error", &e)).await;
    }
    drop(out_tx);
    let _ = writer.await;
}

async fn run_session(
    cfg: &Config,
    params: SessionParams,
    ws_rx: &mut SplitStream<WebSocket>,
    out: &mpsc::Sender<Message>,
) -> Result<(), String> {
    // Dataset-backed sessions may use the higher worker cap (like batch).
    let worker_cap = if params.dataset.is_some() {
        cfg.max_dataset_workers
    } else {
        cfg.max_workers
    };
    let workers = params.workers.unwrap_or(4).clamp(1, worker_cap);
    let profile = params.profile;

    // 1. Wait for the init message carrying the program + facts.
    let (program, facts) = match recv_init(ws_rx).await? {
        ClientMsg::Init { program, facts } => (program, facts),
        _ => return Err("expected an init message".into()),
    };
    if program.len() > cfg.max_program_bytes {
        return Err(format!(
            "Program is too large ({} bytes; limit {}).",
            program.len(),
            cfg.max_program_bytes
        ));
    }
    let total_facts: usize = facts.values().map(|v| v.len()).sum();
    if total_facts > cfg.max_total_fact_bytes {
        return Err(format!(
            "Input facts are too large ({total_facts} bytes; limit {}).",
            cfg.max_total_fact_bytes
        ));
    }

    // 2. Compile the program in incremental mode.
    let _ = out.send(text_msg("info", "Compiling program...")).await;
    let bin = flowlog::compile(cfg, &program, Mode::Incremental, profile)
        .await
        .map_err(|e| e.to_string())?;
    let _ = out
        .send(text_msg("info", "Compile finished. Starting engine..."))
        .await;

    // 3. Per-session scratch directory. Input CSV files (declared with
    //    IO="file") are written here and auto-loaded by the engine at startup.
    let work = tempfile::tempdir_in(&cfg.work_dir).map_err(|e| e.to_string())?;
    for (name, content) in &facts {
        let fname = crate::batch::sanitize_filename(name)
            .ok_or_else(|| format!("Invalid fact filename: {name:?}"))?;
        tokio::fs::write(work.path().join(&fname), content)
            .await
            .map_err(|e| e.to_string())?;
    }
    // Stage a server-side dataset (Doop/Tomcat etc.) by symlinking its data
    // files into the working dir so the engine auto-loads them at startup —
    // the incremental "preload". Inline facts written above take precedence.
    if let Some(name) = &params.dataset {
        let safe = crate::batch::sanitize_filename(name)
            .ok_or_else(|| format!("Invalid dataset name: {name:?}"))?;
        let ds_dir = cfg.datasets_dir.join(&safe);
        if !ds_dir.is_dir() {
            return Err(format!("Unknown dataset: {name:?}"));
        }
        let ds = tokio::fs::canonicalize(&ds_dir)
            .await
            .map_err(|e| e.to_string())?;
        let mut entries = tokio::fs::read_dir(&ds).await.map_err(|e| e.to_string())?;
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            let src = entry.path();
            let ext = src.extension().and_then(|e| e.to_str());
            if ext != Some("csv") && ext != Some("facts") {
                continue;
            }
            let dest = work.path().join(entry.file_name());
            if !tokio::fs::try_exists(&dest).await.unwrap_or(false) {
                tokio::fs::symlink(&src, &dest)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    // The engine writes per-timestamp output relations here (`-D out`); create
    // it before spawn so the startup snapshot has somewhere to land.
    let out_dir = work.path().join("out");
    tokio::fs::create_dir_all(&out_dir)
        .await
        .map_err(|e| e.to_string())?;

    // 4. Spawn the interactive engine. We launch it through `sh -c` with
    //    `2>&1` so the engine's stdout and stderr share a single pipe at
    //    the OS level — otherwise two concurrent reader tasks would race
    //    and lines could appear in the terminal out of their emit order.
    //    `exec` makes sh be replaced by the engine, preserving the PID so
    //    `kill_on_drop` / `child.wait()` still target the engine itself.
    let mut child = Command::new("/bin/sh")
        .arg("-c")
        .arg(r#"exec "$0" "$@" 2>&1"#)
        .arg(&bin)
        .arg("-w")
        .arg(workers.to_string())
        .current_dir(work.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("failed to start engine: {e}"))?;

    let mut stdin = child.stdin.take().expect("piped");
    let stdout = child.stdout.take().expect("piped");

    // 5. Single reader: stdout already carries both streams, so lines
    //    arrive in the order the engine emitted them.
    let (line_tx, mut line_rx) = mpsc::channel::<String>(1024);
    let stdout_reader = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line_tx.send(line).await.is_err() {
                break;
            }
        }
    });
    let acc_out = out.clone();
    let acc_out_dir = out_dir.clone();
    let accumulator_task = tokio::spawn(async move {
        let mut acc = Accumulator::new(acc_out_dir);
        loop {
            // A short read timeout detects when the engine has gone idle, so
            // the accumulated commit can be flushed as a result snapshot.
            match tokio::time::timeout(Duration::from_millis(300), line_rx.recv()).await {
                Ok(Some(line)) => acc.process(&line, &acc_out).await,
                Ok(None) => break, // both readers finished
                Err(_) => acc.flush(&acc_out).await,
            }
        }
        acc.flush(&acc_out).await;
    });

    // 6. The engine is ready; IO="file" inputs were auto-loaded at startup,
    //    which emits the initial result snapshot on its own.
    let _ = out
        .send(text_msg(
            "info",
            "Session ready. Use begin / put / file / commit / abort.",
        ))
        .await;

    // 7. Bridge client commands to the engine until close, timeout, or exit.
    let deadline = tokio::time::sleep(cfg.session_timeout);
    tokio::pin!(deadline);
    loop {
        tokio::select! {
            _ = &mut deadline => {
                let _ = out.send(text_msg("info", "Session time limit reached.")).await;
                break;
            }
            incoming = ws_rx.next() => {
                match incoming {
                    Some(Ok(Message::Text(t))) => {
                        match serde_json::from_str::<ClientMsg>(t.as_str()) {
                            Ok(ClientMsg::Command { command }) => {
                                if stdin
                                    .write_all(format!("{command}\n").as_bytes())
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                                let _ = stdin.flush().await;
                            }
                            // Render a report from the snapshots written so far.
                            // Briefly blocks command handling while the
                            // visualizer runs; engine output keeps flowing via
                            // the separate stdout pump.
                            Ok(ClientMsg::Profile) => {
                                generate_session_report(cfg, work.path(), profile, out).await;
                            }
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    Some(Ok(_)) => {}
                }
            }
            status = child.wait() => {
                let _ = status;
                let _ = out.send(text_msg("info", "Engine process exited.")).await;
                break;
            }
        }
    }

    // 8. Tear down.
    drop(stdin);
    let _ = child.kill().await;
    stdout_reader.abort();
    accumulator_task.abort();
    Ok(())
}

/// Render a profile report from the per-timestamp snapshots accumulated in
/// `work/program_log/` and send it to the client. The visualizer groups the
/// per-worker logs by their `_tN_` timestamp, so the report spans every commit
/// made so far. Best-effort: any failure comes back as a `report_error`.
async fn generate_session_report(
    cfg: &Config,
    work: &std::path::Path,
    profiling_on: bool,
    out: &mpsc::Sender<Message>,
) {
    if !profiling_on {
        let _ = out
            .send(text_msg(
                "report_error",
                "This session was not started with profiling enabled.",
            ))
            .await;
        return;
    }

    let _ = out
        .send(text_msg("info", "Generating profile report..."))
        .await;

    let msg = match flowlog::render_report(cfg, work).await {
        Ok(html) => report_msg(&html),
        Err(e) => text_msg("report_error", &e.to_string()),
    };
    let _ = out.send(msg).await;
}

/// Read frames until a valid JSON message arrives; bounded by a short timeout.
async fn recv_init(ws_rx: &mut SplitStream<WebSocket>) -> Result<ClientMsg, String> {
    let wait = async {
        while let Some(frame) = ws_rx.next().await {
            match frame {
                Ok(Message::Text(t)) => {
                    if let Ok(msg) = serde_json::from_str::<ClientMsg>(t.as_str()) {
                        return Ok(msg);
                    }
                }
                Ok(Message::Close(_)) => return Err("connection closed".to_string()),
                Ok(_) => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        Err("connection closed before init".to_string())
    };
    match tokio::time::timeout(Duration::from_secs(30), wait).await {
        Ok(result) => result,
        Err(_) => Err("timed out waiting for the init message".into()),
    }
}

/// Max rows per relation streamed to the browser per snapshot. The true count
/// is sent in `sizes` so the UI can show "first N of M" (matches batch).
const MAX_SNAPSHOT_ROWS: usize = 100;

/// Parse FlowLog's self-reported time from a log line like
/// `2.170807ms:\tCommitted & executed` -> `2.17` (ms). The engine knows its
/// real compute cost; we surface that rather than our wall-clock.
fn parse_flowlog_ms(line: &str) -> Option<f64> {
    let line = line.trim_start();
    let idx = line.find("ms:")?;
    let v: f64 = line[..idx].trim().parse().ok()?;
    Some((v * 100.0).round() / 100.0)
}

/// Strip the trailing `\t<diff>` column from an engine output line, leaving the
/// tab-separated tuple. `1\t2\t+1` -> `1\t2`.
fn row_of(line: &str) -> &str {
    line.rsplit_once('\t').map(|(row, _)| row).unwrap_or(line)
}

/// Turns the engine's per-timestamp output files (`Rel_t<N>.csv`, written via
/// `-D out`) into result snapshots. Holds only a capped display buffer and a
/// row count per relation — never the full (millions of) tuples, which stay in
/// the engine's files. `Rel_t1.csv` is the preload's full state; later
/// `Rel_t<N>.csv` are that commit's small delta (`+1` / `-1`).
struct Accumulator {
    out_dir: std::path::PathBuf,
    /// Highest timestamp already turned into a snapshot.
    processed_t: i64,
    /// Running row count per relation (for the "first N of M" label).
    counts: HashMap<String, usize>,
    /// Capped rows actually shown, per relation (newest-first after a commit).
    display: HashMap<String, Vec<String>>,
    /// FlowLog's most-recent self-reported time (ms) — used as the snapshot's
    /// Time instead of our wall-clock.
    flowlog_ms: Option<f64>,
    /// Sizes of the not-yet-processed t-files seen on the previous scan, so we
    /// snapshot only once the engine has finished writing them (stable).
    prev_scan: HashMap<std::path::PathBuf, u64>,
}

impl Accumulator {
    fn new(out_dir: std::path::PathBuf) -> Self {
        Self {
            out_dir,
            processed_t: 0,
            counts: HashMap::new(),
            display: HashMap::new(),
            flowlog_ms: None,
            prev_scan: HashMap::new(),
        }
    }

    /// Engine stdout now carries only protocol lines (prompts, "Data loaded
    /// for X", "Committed & executed", errors) — tuples go to files. Forward
    /// them to the terminal and capture FlowLog's reported timing.
    async fn process(&mut self, line: &str, out: &mpsc::Sender<Message>) {
        // Capture FlowLog's reported time from the line that bounds the work:
        // `Committed & executed` for a commit, `Dataflow assembled` for preload.
        if line.contains("Committed & executed") || line.contains("Dataflow assembled") {
            if let Some(ms) = parse_flowlog_ms(line) {
                self.flowlog_ms = Some(ms);
            }
        }
        let _ = out.send(text_msg("output", line)).await;
    }

    /// On engine idle: once the new per-timestamp files have stopped changing
    /// (the engine finished writing them), fold them into the display buffer +
    /// counts and emit a snapshot.
    async fn flush(&mut self, out: &mpsc::Sender<Message>) {
        let mut files = self.scan_files().await;
        if files.is_empty() {
            self.prev_scan.clear();
            return;
        }
        // Only act once the file set is byte-for-byte identical to the previous
        // idle scan (engine done writing) and has actual content — the engine
        // creates the files early and fills them over the next moments.
        let cur: HashMap<std::path::PathBuf, u64> =
            files.iter().map(|(_, _, p, s)| (p.clone(), *s)).collect();
        let total: u64 = cur.values().sum();
        if cur != self.prev_scan || total == 0 {
            self.prev_scan = cur;
            return;
        }
        self.prev_scan.clear();

        // Process in timestamp order so deltas apply on top of the preload.
        files.sort_by_key(|(t, _, _, _)| *t);
        let is_preload = self.processed_t == 0;
        let max_t = files.iter().map(|(t, _, _, _)| *t).max().unwrap_or(self.processed_t);

        let mut deltas = serde_json::Map::new();
        for (_t, relation, path, _size) in files {
            if is_preload {
                // Full initial state: count rows, keep first MAX for display.
                if let Ok((rows, total)) = read_initial(&path, MAX_SNAPSHOT_ROWS).await {
                    self.counts.insert(relation.clone(), total);
                    self.display.insert(relation, rows);
                }
            } else if let Ok((added, removed)) = read_delta(&path).await {
                let net = added.len() as i64 - removed.len() as i64;
                let c = self.counts.entry(relation.clone()).or_insert(0);
                *c = (*c as i64 + net).max(0) as usize;
                self.apply_delta(&relation, &added, &removed);
                if !added.is_empty() || !removed.is_empty() {
                    let cap = |v: Vec<String>| v.into_iter().take(MAX_SNAPSHOT_ROWS).collect::<Vec<_>>();
                    deltas.insert(
                        relation,
                        json!({ "added": cap(added), "removed": cap(removed) }),
                    );
                }
            }
        }
        self.processed_t = max_t;
        let phase = if is_preload { "preload" } else { "commit" };
        let _ = out.send(self.snapshot(deltas, phase)).await;
    }

    /// Find `Rel_t<N>.csv` files with N greater than the last processed
    /// timestamp. Returns `(timestamp, relation, path, size)`.
    async fn scan_files(&self) -> Vec<(i64, String, std::path::PathBuf, u64)> {
        let mut found = Vec::new();
        let Ok(mut entries) = tokio::fs::read_dir(&self.out_dir).await else {
            return found;
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if path.extension().and_then(|e| e.to_str()) != Some("csv") {
                continue;
            }
            // Split `Rel_t<N>` into relation + timestamp.
            let Some((relation, tnum)) = stem.rsplit_once("_t") else {
                continue;
            };
            let Ok(t) = tnum.parse::<i64>() else { continue };
            if t > self.processed_t {
                let size = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
                found.push((t, relation.to_string(), path, size));
            }
        }
        found
    }

    /// Splice a commit's added/removed rows into the capped display buffer,
    /// newest first, so the change is visible at the top.
    fn apply_delta(&mut self, relation: &str, added: &[String], removed: &[String]) {
        let removed_set: HashSet<&String> = removed.iter().collect();
        let added_set: HashSet<&String> = added.iter().collect();
        let buf = self.display.entry(relation.to_string()).or_default();
        let mut next: Vec<String> = added.to_vec();
        for r in buf.iter() {
            if !added_set.contains(r) && !removed_set.contains(r) {
                next.push(r.clone());
            }
        }
        next.truncate(MAX_SNAPSHOT_ROWS);
        *buf = next;
    }

    fn snapshot(
        &self,
        deltas: serde_json::Map<String, serde_json::Value>,
        phase: &str,
    ) -> Message {
        let mut results = serde_json::Map::new();
        let mut sizes = serde_json::Map::new();
        let mut tuples = 0usize;
        for (relation, &count) in &self.counts {
            if count == 0 {
                continue;
            }
            tuples += count;
            sizes.insert(relation.clone(), json!(count));
            let rows = self.display.get(relation).cloned().unwrap_or_default();
            results.insert(relation.clone(), json!(rows.join("\n")));
        }
        let mut stats = serde_json::Map::new();
        stats.insert("timestamp".into(), json!(self.processed_t));
        stats.insert("tuples".into(), json!(tuples));
        stats.insert("phase".into(), json!(phase));
        // FlowLog's own reported compute time, not our wall-clock.
        if let Some(ms) = self.flowlog_ms {
            stats.insert("time_ms".into(), json!(ms));
        }
        Message::Text(
            json!({
                "type": "result",
                "results": results,
                "sizes": sizes,
                "deltas": deltas,
                "stats": stats,
            })
            .to_string()
            .into(),
        )
    }
}

/// Read a preload file: first `max_rows` tuples (diff column stripped) for
/// display, plus the total row count.
async fn read_initial(
    path: &std::path::Path,
    max_rows: usize,
) -> std::io::Result<(Vec<String>, usize)> {
    let file = tokio::fs::File::open(path).await?;
    let mut lines = BufReader::new(file).lines();
    let mut display = Vec::new();
    let mut total = 0usize;
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        total += 1;
        if display.len() < max_rows {
            display.push(row_of(&line).to_string());
        }
    }
    Ok((display, total))
}

/// Read a commit delta file into (added rows, removed rows), diff column
/// stripped. Bounded so a pathologically large delta can't blow up memory.
async fn read_delta(path: &std::path::Path) -> std::io::Result<(Vec<String>, Vec<String>)> {
    const DELTA_CAP: usize = 100_000;
    let file = tokio::fs::File::open(path).await?;
    let mut lines = BufReader::new(file).lines();
    let mut added = Vec::new();
    let mut removed = Vec::new();
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let Some((row, diff)) = line.rsplit_once('\t') else {
            continue;
        };
        if diff.trim_start_matches('+').starts_with('-') {
            removed.push(row.to_string());
        } else {
            added.push(row.to_string());
        }
        if added.len() + removed.len() >= DELTA_CAP {
            break;
        }
    }
    Ok((added, removed))
}
