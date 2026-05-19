//! Server configuration, sourced entirely from environment variables.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

use anyhow::Context;

#[derive(Clone, Debug)]
pub struct Config {
    /// Address to bind the HTTP server to.
    pub bind_addr: SocketAddr,
    /// Path to the `flowlog-compiler` binary.
    pub compiler: PathBuf,
    /// Base directory for the compile cache and per-request scratch dirs.
    pub work_dir: PathBuf,
    /// Origins allowed by CORS. A single `*` entry allows any origin.
    pub allowed_origins: Vec<String>,
    /// Max wall-clock time for a single `flowlog-compiler` invocation.
    pub compile_timeout: Duration,
    /// Max wall-clock time for a single batch executable run.
    pub run_timeout: Duration,
    /// Max lifetime of an incremental WebSocket session.
    pub session_timeout: Duration,
    /// Upper bound on the `-w` worker count a client may request.
    pub max_workers: u32,
    /// Reject programs larger than this many bytes.
    pub max_program_bytes: usize,
    /// Reject requests whose input facts total more than this many bytes.
    pub max_total_fact_bytes: usize,
    /// When true, reuse cached compiled binaries keyed by program hash.
    pub enable_cache: bool,
}

fn env_string(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_parse<T>(key: &str, default: T) -> anyhow::Result<T>
where
    T: std::str::FromStr,
    T::Err: std::fmt::Display,
{
    match std::env::var(key) {
        Ok(v) => v
            .parse()
            .map_err(|e| anyhow::anyhow!("invalid {key}={v:?}: {e}")),
        Err(_) => Ok(default),
    }
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let bind_addr: SocketAddr = env_string("BIND_ADDR", "0.0.0.0:8080")
            .parse()
            .context("invalid BIND_ADDR")?;

        let work_dir = match std::env::var("WORK_DIR") {
            Ok(v) => PathBuf::from(v),
            Err(_) => std::env::temp_dir().join("flowlog-playground"),
        };

        let allowed_origins = env_string(
            "ALLOWED_ORIGINS",
            "https://flowlog-rs.github.io, http://localhost:3001",
        )
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

        Ok(Config {
            bind_addr,
            compiler: PathBuf::from(env_string("FLOWLOG_COMPILER", "flowlog-compiler")),
            work_dir,
            allowed_origins,
            compile_timeout: Duration::from_secs(env_parse("COMPILE_TIMEOUT_SECS", 300u64)?),
            run_timeout: Duration::from_secs(env_parse("RUN_TIMEOUT_SECS", 30u64)?),
            session_timeout: Duration::from_secs(env_parse("SESSION_TIMEOUT_SECS", 900u64)?),
            max_workers: env_parse("MAX_WORKERS", 8u32)?,
            // Demo-scale limits: a generous program budget and a 1 MiB cap on
            // total input facts. Override via env vars for heavier workloads.
            max_program_bytes: env_parse("MAX_PROGRAM_BYTES", 256_000usize)?,
            max_total_fact_bytes: env_parse("MAX_TOTAL_FACT_BYTES", 1_048_576usize)?,
            enable_cache: env_parse("ENABLE_CACHE", true)?,
        })
    }
}
