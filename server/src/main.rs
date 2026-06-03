//! FlowLog playground server.
//!
//! Exposes the HTTP/WebSocket API consumed by the playground page at
//! `https://flowlog-rs.github.io/playground`.

mod batch;
mod config;
mod dataset;
mod flowlog;
mod session;

use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderValue, Method};
use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tower_http::trace::TraceLayer;

use config::Config;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,flowlog_playground_server=info".into()),
        )
        .init();

    let cfg = Arc::new(Config::from_env()?);
    tokio::fs::create_dir_all(&cfg.work_dir).await?;
    tracing::info!(?cfg, "configuration loaded");

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/api/run", post(batch::run_handler))
        .route("/api/dataset/{name}", get(dataset::dataset_handler))
        .route("/api/session", get(session::session_handler))
        // Body cap covering a max-size program plus its input facts.
        .layer(DefaultBodyLimit::max(4 * 1024 * 1024))
        .layer(build_cors(&cfg))
        .layer(TraceLayer::new_for_http())
        .with_state(cfg.clone());

    let listener = tokio::net::TcpListener::bind(cfg.bind_addr).await?;
    tracing::info!("listening on http://{}", cfg.bind_addr);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn build_cors(cfg: &Config) -> CorsLayer {
    let base = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE]);

    if cfg.allowed_origins.iter().any(|o| o == "*") {
        base.allow_origin(Any)
    } else {
        let origins: Vec<HeaderValue> = cfg
            .allowed_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        base.allow_origin(AllowOrigin::list(origins))
    }
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutting down");
}
