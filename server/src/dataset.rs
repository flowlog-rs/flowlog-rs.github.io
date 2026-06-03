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
        if path.extension().and_then(|e| e.to_str()) != Some("csv") {
            continue;
        }
        let fname = entry.file_name().to_string_lossy().into_owned();
        let content = fs::read_to_string(&path).await.unwrap_or_default();
        let rows: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
        let preview = rows
            .iter()
            .take(PREVIEW_ROWS)
            .copied()
            .collect::<Vec<_>>()
            .join("\n");
        files.push((
            fname.clone(),
            json!({ "name": fname, "rows": rows.len(), "preview": preview }),
        ));
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let files: Vec<serde_json::Value> = files.into_iter().map(|(_, v)| v).collect();

    Json(json!({ "name": name, "preview_rows": PREVIEW_ROWS, "files": files })).into_response()
}
