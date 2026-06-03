//! Wrapper around the `flowlog-compiler` CLI.
//!
//! FlowLog compiles each Datalog program into a standalone native executable.
//! Compilation is expensive, so compiled binaries are cached under
//! `work_dir/cache/<hash>/prog`, keyed by the program text + mode.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
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
    #[error("Profile report generation failed:\n\n{0}")]
    Profile(String),
    #[error("Profile report generation timed out after {0:?}.")]
    ProfileTimeout(Duration),
    #[error("Profile report is too large ({len} bytes; limit {limit}).")]
    ReportTooLarge { len: usize, limit: usize },
    #[error("server error: {0}")]
    Io(#[from] std::io::Error),
}

/// Stable cache key for a (program, mode, profile) triple. A profiling build
/// carries extra instrumentation, so it must not share a cache slot with the
/// plain build of the same program.
fn cache_key(program: &str, mode: Mode, profile: bool) -> String {
    let mut h = Sha256::new();
    h.update(program.as_bytes());
    h.update([mode as u8]);
    h.update([profile as u8]);
    hex::encode(&h.finalize()[..16])
}

/// Compile `program` to a standalone executable and return its path.
///
/// Batch binaries read inputs from `facts/` and write outputs to `out/`,
/// both resolved relative to the executable's working directory at run time.
/// Incremental binaries take input from their interactive shell (`-D -`).
///
/// When `profile` is set, the compiler embeds profiling instrumentation
/// (`-P`); the resulting binary additionally writes a `program_log/` tree
/// (`ops.json` + per-worker `time/` and `memory/` logs) into its run-time cwd.
pub async fn compile(
    cfg: &Config,
    program: &str,
    mode: Mode,
    profile: bool,
) -> Result<PathBuf, FlowlogError> {
    let key = cache_key(program, mode, profile);
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
    if profile {
        // Bakes timely/differential logging into the binary; at run time it
        // emits `program_log/{ops.json,time,memory}` (see `PROFILE_LOG_DIR`).
        cmd.arg("-P");
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

    // Promote the binary into the cache via a uniquely-named staging file +
    // atomic rename. Renaming over a path another request is *executing* is
    // safe on Linux (the running process keeps the old inode); copying
    // directly onto it is not — that yields ETXTBSY ("Text file busy"). The
    // staging name is unique per (pid, seq) so concurrent compiles of the same
    // program never clobber each other mid-copy.
    static STAGE_SEQ: AtomicU64 = AtomicU64::new(0);
    fs::create_dir_all(&cache_dir).await?;
    let seq = STAGE_SEQ.fetch_add(1, Ordering::Relaxed);
    let staged = cache_dir.join(format!(".prog.staging.{}.{}", std::process::id(), seq));
    fs::copy(&out_bin, &staged).await?;
    make_executable(&staged).await?;
    fs::rename(&staged, &bin).await?;
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

/// Name of the per-program profiling directory a profiled binary writes at
/// run time. The compiler derives it from the `.dl` stem, and we always
/// compile from a file named `program.dl`, so it is always `program_log`.
const PROFILE_LOG_DIR: &str = "program_log";

/// Render the profiling logs a profiled run left under `work` into a single
/// self-contained HTML report and return it, enforcing `cfg.max_report_bytes`.
///
/// Shared by batch and incremental report generation: it runs the visualizer
/// over `program_log/`, size-checks the output before reading it, and returns
/// the HTML (or a `FlowlogError` the caller turns into a `report_error`).
pub async fn render_report(cfg: &Config, work: &Path) -> Result<String, FlowlogError> {
    let out_html = work.join("report.html");
    run_profile_viz(cfg, work, &out_html).await?;
    // Size-check via metadata first, so an over-cap report is never read into
    // memory just to be discarded.
    let len = fs::metadata(&out_html).await?.len() as usize;
    if len > cfg.max_report_bytes {
        return Err(FlowlogError::ReportTooLarge {
            len,
            limit: cfg.max_report_bytes,
        });
    }
    fs::read_to_string(&out_html)
        .await
        .map_err(|e| FlowlogError::Profile(format!("server error reading report: {e}")))
}

/// Render the `program_log/` tree a profiled run left in `work` into a single
/// self-contained HTML report at `out_html`, using `flowlog-profile-viz`.
///
/// The visualizer takes the static plan graph (`ops.json`) plus the per-worker
/// `time/` and `memory/` log folders and embeds everything into one HTML file.
async fn run_profile_viz(
    cfg: &Config,
    work: &Path,
    out_html: &Path,
) -> Result<(), FlowlogError> {
    let log_dir = find_profile_log_dir(work).await.ok_or_else(|| {
        FlowlogError::Profile(
            "the program produced no profiling output (program_log/ not found)".to_string(),
        )
    })?;

    let ops = log_dir.join("ops.json");
    let time = log_dir.join("time");
    let memory = log_dir.join("memory");
    for (path, what) in [(&ops, "ops.json"), (&time, "time/"), (&memory, "memory/")] {
        if !fs::try_exists(path).await? {
            // In an incremental session the per-timestamp snapshots only appear
            // after a commit, so this is the usual "nothing to report yet" path.
            return Err(FlowlogError::Profile(format!(
                "no profiling snapshots yet ({what} not written). \
                 Run at least one commit before generating a report."
            )));
        }
    }

    let mut cmd = Command::new(&cfg.profile_viz);
    cmd.arg("-p")
        .arg(&ops)
        .arg("-t")
        .arg(&time)
        .arg("-m")
        .arg(&memory)
        .arg("-o")
        .arg(out_html);

    // Spawn failures (e.g. the visualizer binary isn't installed) surface here
    // as a clear, named profiling error rather than a bare OS error string.
    let output = run_capture(cmd, cfg.profile_timeout)
        .await
        .map_err(|e| {
            FlowlogError::Profile(format!(
                "could not run the profile visualizer ({}): {e}",
                cfg.profile_viz.display()
            ))
        })?
        .ok_or(FlowlogError::ProfileTimeout(cfg.profile_timeout))?;
    if !output.status.success() {
        return Err(FlowlogError::Profile(combined_output(&output)));
    }
    if !fs::try_exists(out_html).await? {
        return Err(FlowlogError::Profile(
            "the visualizer reported success but wrote no report".to_string(),
        ));
    }
    Ok(())
}

/// Locate the profiling directory under `work`. Prefers the conventional
/// `program_log/`, falling back to the first `*_log/` directory should the
/// upstream stem-naming change.
async fn find_profile_log_dir(work: &Path) -> Option<PathBuf> {
    let conventional = work.join(PROFILE_LOG_DIR);
    if fs::try_exists(&conventional).await.unwrap_or(false) {
        return Some(conventional);
    }
    let mut entries = fs::read_dir(work).await.ok()?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        let is_dir = entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false);
        let is_log = path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.ends_with("_log"));
        if is_dir && is_log {
            return Some(path);
        }
    }
    None
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
