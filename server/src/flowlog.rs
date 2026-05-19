//! Wrapper around the `flowlog-compiler` CLI.
//!
//! FlowLog compiles each Datalog program into a standalone native executable.
//! Compilation is expensive, so compiled binaries are cached under
//! `work_dir/cache/<hash>/prog`, keyed by the program text + mode.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use regex::Regex;
use sha2::{Digest, Sha256};
use tokio::fs;
use tokio::process::Command;

use crate::config::Config;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Batch,
    Incremental,
}

impl Mode {
    /// Value passed to `flowlog-compiler --mode`.
    fn cli(self) -> &'static str {
        match self {
            Mode::Batch => "datalog-batch",
            Mode::Incremental => "datalog-inc",
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum FlowlogError {
    #[error("Program failed to compile:\n\n{0}")]
    Compile(String),
    #[error("Compilation timed out after {0:?}. The program may be too large or complex.")]
    CompileTimeout(Duration),
    #[error("Execution failed:\n\n{0}")]
    Run(String),
    #[error("Execution timed out after {0:?}.")]
    RunTimeout(Duration),
    #[error("server error: {0}")]
    Io(#[from] std::io::Error),
}

/// Stable cache key for a (program, mode) pair.
fn cache_key(program: &str, mode: Mode) -> String {
    let mut h = Sha256::new();
    h.update(program.as_bytes());
    h.update([mode as u8]);
    hex::encode(&h.finalize()[..16])
}

/// Compile `program` to a standalone executable and return its path.
///
/// Batch binaries read inputs from `facts/` and write outputs to `out/`,
/// both resolved relative to the executable's working directory at run time.
/// Incremental binaries take input from their interactive shell (`-D -`).
pub async fn compile(
    cfg: &Config,
    program: &str,
    mode: Mode,
) -> Result<PathBuf, FlowlogError> {
    let key = cache_key(program, mode);
    let cache_dir = cfg.work_dir.join("cache").join(&key);
    let bin = cache_dir.join("prog");

    if cfg.enable_cache && fs::try_exists(&bin).await? {
        tracing::info!(%key, "compile cache hit");
        return Ok(bin);
    }
    tracing::info!(%key, ?mode, "compiling program");

    // Compile inside a throwaway directory, then promote the binary to the
    // cache. The `.dl` source and the compiler's scratch files are discarded.
    let build = tempfile::tempdir_in(&cfg.work_dir)?;
    let dl = build.path().join("program.dl");
    fs::write(&dl, program).await?;
    fs::create_dir_all(build.path().join("facts")).await?;
    fs::create_dir_all(build.path().join("out")).await?;
    let out_bin = build.path().join("prog");

    let mut cmd = Command::new(&cfg.compiler);
    cmd.arg(&dl)
        .arg("-o")
        .arg(&out_bin)
        .arg("--mode")
        .arg(mode.cli())
        .current_dir(build.path());
    match mode {
        // Relative I/O dirs are baked in; they resolve against the run-time
        // cwd, so one cached binary can serve many requests.
        Mode::Batch => {
            cmd.args(["-F", "facts", "-D", "out"]);
        }
        // Incremental output streams to the interactive shell; IO="file"
        // inputs resolve against the run-time cwd.
        Mode::Incremental => {
            cmd.args(["-F", ".", "-D", "-"]);
        }
    }

    let output = run_capture(cmd, cfg.compile_timeout)
        .await?
        .ok_or(FlowlogError::CompileTimeout(cfg.compile_timeout))?;
    if !output.status.success() {
        // Diagnostics reference the scratch path; show a clean name instead.
        let msg = combined_output(&output).replace(&*dl.to_string_lossy(), "program.dl");
        return Err(FlowlogError::Compile(msg));
    }
    if !fs::try_exists(&out_bin).await? {
        return Err(FlowlogError::Compile(format!(
            "the compiler reported success but produced no executable.\n\n{}",
            combined_output(&output)
        )));
    }

    fs::create_dir_all(&cache_dir).await?;
    fs::copy(&out_bin, &bin).await?;
    make_executable(&bin).await?;
    Ok(bin)
}

/// Run a compiled batch executable with `cwd = work`, returning the elapsed
/// run time. Input/output CSV files live under `work/facts` and `work/out`.
pub async fn run_batch(
    cfg: &Config,
    bin: &Path,
    work: &Path,
    workers: u32,
) -> Result<Duration, FlowlogError> {
    let mut cmd = Command::new(bin);
    cmd.arg("-w").arg(workers.to_string()).current_dir(work);

    let start = Instant::now();
    let output = run_capture(cmd, cfg.run_timeout)
        .await?
        .ok_or(FlowlogError::RunTimeout(cfg.run_timeout))?;
    let elapsed = start.elapsed();

    if !output.status.success() {
        return Err(FlowlogError::Run(combined_output(&output)));
    }
    Ok(elapsed)
}

/// Spawn a process, capture its output, and enforce a timeout.
/// `Ok(None)` means the timeout elapsed; the child is killed on drop.
async fn run_capture(
    mut cmd: Command,
    timeout: Duration,
) -> std::io::Result<Option<std::process::Output>> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let child = cmd.spawn()?;
    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(result) => Ok(Some(result?)),
        Err(_) => Ok(None),
    }
}

/// Merge stderr and stdout into a single human-readable message.
fn combined_output(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut msg = String::new();
    if !stderr.trim().is_empty() {
        msg.push_str(stderr.trim());
    }
    if !stdout.trim().is_empty() {
        if !msg.is_empty() {
            msg.push('\n');
        }
        msg.push_str(stdout.trim());
    }
    if msg.is_empty() {
        msg = format!("process exited with status {}", output.status);
    }
    strip_ansi(&msg)
}

/// Remove ANSI escape sequences so colored compiler diagnostics render as
/// plain text in the browser.
fn strip_ansi(s: &str) -> String {
    static ANSI: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"\x1b\[[0-9;]*[A-Za-z]").unwrap());
    ANSI.replace_all(s, "").into_owned()
}

async fn make_executable(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path).await?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms).await?;
    }
    Ok(())
}
