//! `GET /api/dataset/{name}` — a read-only preview of a server-side dataset.
//!
//! The dataset files (e.g. the Galen demo's CSVs) are too large to send in
//! full, so this returns each file's first few rows plus its total row count.
//! The playground shows it read-only — the data is fixed; only the program is
//! editable.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use tokio::fs;
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::batch::sanitize_filename;
use crate::config::Config;

/// Rows shown per file in the preview (the rest is elided with `…`).
const PREVIEW_ROWS: usize = 8;

pub async fn dataset_handler(
    State(cfg): State<Arc<Config>>,
    Path(name): Path<String>,
) -> Response {
    // `sanitize_filename` rejects `..`/absolute paths, so no traversal.
    let dir = match sanitize_filename(&name) {
        Some(s) => cfg.datasets_dir.join(s),
        None => return (StatusCode::BAD_REQUEST, "invalid dataset name").into_response(),
    };
    if !dir.is_dir() {
        return (StatusCode::NOT_FOUND, format!("unknown dataset {name:?}")).into_response();
    }

    let mut entries = match fs::read_dir(&dir).await {
        Ok(e) => e,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, format!("server error: {e}"))
                .into_response();
        }
    };

    let mut files: Vec<(String, serde_json::Value)> = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        // Galen ships CSVs; Doop/Tomcat ships tab-delimited .facts.
        let ext = path.extension().and_then(|e| e.to_str());
        if ext != Some("csv") && ext != Some("facts") {
            continue;
        }
        let fname = entry.file_name().to_string_lossy().into_owned();

        // Read only the first PREVIEW_ROWS lines (plus one extra to detect
        // "there's more"). Tomcat's facts are hundreds of MB total, so we must
        // never slurp whole files just to preview them. The total row count is
        // estimated from the file size and the sampled lines' average length.
        let Ok(file) = fs::File::open(&path).await else { continue };
        let total_bytes = file.metadata().await.map(|m| m.len()).unwrap_or(0);
        let mut lines = BufReader::new(file).lines();
        let mut sample: Vec<String> = Vec::with_capacity(PREVIEW_ROWS + 1);
        let mut sample_bytes: u64 = 0;
        while sample.len() <= PREVIEW_ROWS {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    if line.trim().is_empty() {
                        continue;
                    }
                    sample_bytes += line.len() as u64 + 1; // +1 for the newline
                    sample.push(line);
                }
                _ => break,
            }
        }

        let fully_read = sample.len() <= PREVIEW_ROWS;
        let rows = if fully_read {
            sample.len() as u64
        } else if sample_bytes > 0 {
            // Approximate: total size / average sampled line length.
            (total_bytes * sample.len() as u64 / sample_bytes).max(sample.len() as u64)
        } else {
            0
        };
        let preview = sample
            .iter()
            .take(PREVIEW_ROWS)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        files.push((
            fname.clone(),
            json!({ "name": fname, "rows": rows, "preview": preview }),
        ));
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let files: Vec<serde_json::Value> = files.into_iter().map(|(_, v)| v).collect();

    Json(json!({ "name": name, "preview_rows": PREVIEW_ROWS, "files": files })).into_response()
}
