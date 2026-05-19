//! `WS /api/session` — incremental (interactive) evaluation.
//!
//! Protocol (dictated by the playground client):
//!
//! * Client opens the socket, then sends `{"type":"init","program":...,"facts":...}`.
//! * Client sends `{"type":"command","command":"begin"}` etc.
//! * Server replies with `{"type":"output|info|error","text":...}` lines and,
//!   after each commit, `{"type":"result","results":...,"stats":...}`.
//!
//! The server compiles the program in incremental mode, spawns the generated
//! interactive shell, and bridges its stdin/stdout to the WebSocket.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::response::Response;
use futures_util::stream::{SplitStream, StreamExt};
use futures_util::SinkExt;
use regex::Regex;
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
    let workers = params.workers.unwrap_or(4).clamp(1, cfg.max_workers);

    // 1. Wait for the init message carrying the program + facts.
    let (program, facts) = match recv_init(ws_rx).await? {
        ClientMsg::Init { program, facts } => (program, facts),
        ClientMsg::Command { .. } => return Err("expected an init message".into()),
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
    let bin = flowlog::compile(cfg, &program, Mode::Incremental)
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

    // 4. Spawn the interactive engine.
    let mut child = Command::new(&bin)
        .arg("-w")
        .arg(workers.to_string())
        .current_dir(work.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("failed to start engine: {e}"))?;

    let mut stdin = child.stdin.take().expect("piped");
    let stdout = child.stdout.take().expect("piped");
    let stderr = child.stderr.take().expect("piped");

    // 5. Merge engine stdout + stderr into one line stream feeding the
    //    accumulator. FlowLog prints prompts/status on stdout and result
    //    tuples on stderr, so both streams must reach the accumulator.
    let (line_tx, mut line_rx) = mpsc::channel::<String>(1024);
    let stdout_lines = line_tx.clone();
    let stdout_reader = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if stdout_lines.send(line).await.is_err() {
                break;
            }
        }
    });
    let stderr_reader = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line_tx.send(line).await.is_err() {
                break;
            }
        }
    });
    let acc_out = out.clone();
    let accumulator_task = tokio::spawn(async move {
        let mut acc = Accumulator::default();
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
                        if let Ok(ClientMsg::Command { command }) =
                            serde_json::from_str::<ClientMsg>(t.as_str())
                        {
                            if stdin
                                .write_all(format!("{command}\n").as_bytes())
                                .await
                                .is_err()
                            {
                                break;
                            }
                            let _ = stdin.flush().await;
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
    stderr_reader.abort();
    accumulator_task.abort();
    Ok(())
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

/// Matches engine delta lines, e.g. `[tuple][reach]  t=0  data=(1,)  diff=+1`.
static TUPLE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\[tuple\]\[([^\]]+)\]\s+t=(-?\d+)\s+data=\((.*)\)\s+diff=([+-]?\d+)").unwrap()
});

/// Accumulates per-commit deltas into full relation snapshots so the client
/// can render a result table, not just a stream of `+1`/`-1` lines.
#[derive(Default)]
struct Accumulator {
    relations: HashMap<String, HashMap<Vec<String>, i64>>,
    last_t: i64,
    pending: bool,
}

impl Accumulator {
    async fn process(&mut self, line: &str, out: &mpsc::Sender<Message>) {
        // Forward every engine line verbatim to the terminal pane.
        let _ = out.send(text_msg("output", line)).await;

        if let Some(caps) = TUPLE_RE.captures(line) {
            let relation = caps[1].to_string();
            if let Ok(t) = caps[2].parse::<i64>() {
                self.last_t = self.last_t.max(t);
            }
            let row = parse_data(&caps[3]);
            let diff: i64 = caps[4].parse().unwrap_or(0);
            *self
                .relations
                .entry(relation)
                .or_default()
                .entry(row)
                .or_insert(0) += diff;
            self.pending = true;
        } else if line.contains("Committed & executed") {
            // Output tuples stream *after* this line, so defer the snapshot
            // until the engine goes idle (see `flush`).
            self.pending = true;
        }
    }

    /// Emit a result snapshot if the relations changed since the last flush.
    async fn flush(&mut self, out: &mpsc::Sender<Message>) {
        if self.pending {
            self.pending = false;
            let _ = out.send(self.snapshot()).await;
        }
    }

    fn snapshot(&self) -> Message {
        let mut results = serde_json::Map::new();
        let mut tuples = 0usize;
        for (relation, rows) in &self.relations {
            let mut lines: Vec<String> = rows
                .iter()
                .filter(|(_, &count)| count != 0)
                .map(|(row, _)| row.join(","))
                .collect();
            tuples += lines.len();
            lines.sort();
            results.insert(relation.clone(), json!(lines.join("\n")));
        }
        Message::Text(
            json!({
                "type": "result",
                "results": results,
                "stats": { "timestamp": self.last_t, "tuples": tuples },
            })
            .to_string()
            .into(),
        )
    }
}

/// Split the `data=(...)` payload into column values.
fn parse_data(s: &str) -> Vec<String> {
    s.split(',')
        .map(|p| p.trim().trim_matches('"').to_string())
        .filter(|p| !p.is_empty())
        .collect()
}
