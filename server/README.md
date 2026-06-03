# FlowLog Playground Server

Backend for the interactive playground at
`https://flowlog-rs.github.io/playground`.

It wraps the [`flowlog-compiler`](https://github.com/flowlog-rs/flowlog) CLI:
each request compiles the submitted Datalog program to a native executable,
runs it, and streams progress + results back to the browser. With profiling
enabled it additionally invokes the
[`flowlog-profile-viz`](https://github.com/flowlog-rs/profile-visualizer) CLI
to turn the run's profiling logs into a self-contained HTML report.

* `POST /api/run` — **batch** mode. Streams newline-delimited JSON progress
  (`compiling → compiled → running → done`) then a final `result`. When the
  request sets `options.profile = true`, the program is compiled with `-P` and,
  after the result, the server streams a `profiling` status and a final
  `report` line carrying a self-contained HTML report (best-effort: a failure
  becomes a non-fatal `report_error` line). See [Profiling](#profiling).
* `GET /api/session` (WebSocket) — **incremental** mode. Bridges the generated
  interactive shell (`begin` / `put` / `file` / `commit` / `abort`) to the
  browser and emits a result snapshot after every commit. With `?profile=true`,
  a `{"type":"profile"}` message renders a report spanning every commit so far
  (see [Profiling](#profiling)).
* `GET /health` — returns `ok`.

## How it works

1. The program text is hashed; compiled binaries are cached under
   `WORK_DIR/cache/<hash>/`. Re-running the same program (e.g. a built-in
   example) skips the slow Rust compile entirely.
2. **Every request gets its own scratch directory** (`tempfile::tempdir_in`),
   so concurrent users never share input/output files. It is deleted when the
   request finishes.
3. Compilation and execution run under wall-clock timeouts; worker counts and
   program/fact sizes are capped (see env vars below).

The program and input facts travel **in the request itself** — JSON body for
batch, the `init` WebSocket message for incremental. Default examples and
custom programs use the exact same path; nothing extra is needed to support
user-supplied data. The server keeps no per-user state between requests.

## Profiling

When a batch request sets `options.profile = true`:

1. The program is compiled **with `-P`** (cached separately from the plain
   build). The resulting binary, in addition to its normal `out/` relations,
   writes a `program_log/` tree into its run-time cwd:
   `ops.json` (static plan graph) plus per-worker `time/` and `memory/` logs.
2. After streaming the `result`, the server runs `flowlog-profile-viz` over
   that tree (`-p ops.json -t time -m memory -o report.html`) to render a
   **single self-contained HTML report** (data embedded; no external assets
   beyond optional web fonts).
3. The report is streamed to the browser as a trailing
   `{"type":"report","html":"…"}` line, which the playground opens in an
   embedded viewer (and can pop out to a new tab).

Report generation is **best-effort**: the run has already succeeded by then, so
any failure (visualizer missing, render error, oversized report) is reported as
a non-fatal `{"type":"report_error","text":"…"}` line and the results still
stand.

**Incremental** sessions profile too: open the socket with `?profile=true` (the
binary is compiled with `-P`, and each commit writes a per-timestamp snapshot
under `program_log/`), then send `{"type":"profile"}` whenever you want a
report. The visualizer groups the per-worker logs by their `_tN_` timestamp, so
one report spans **every commit so far**, with a snapshot selector — the same
`report` / `report_error` messages carry the result.

## Build

You need the `flowlog-compiler` binary. Build it from the FlowLog repo:

```bash
git clone https://github.com/flowlog-rs/flowlog
cd flowlog
cargo build --release        # produces target/release/flowlog-compiler
```

For profiling support, also build the `flowlog-profile-viz` binary from the
profile-visualizer repo (optional — without it, profiled runs still return
results and report a non-fatal profiling error):

```bash
git clone https://github.com/flowlog-rs/profile-visualizer
cd profile-visualizer
cargo build --release        # produces target/release/flowlog-profile-viz
```

Then build this server:

```bash
cd server
cargo build --release        # produces target/release/flowlog-playground-server
```

## Run

```bash
FLOWLOG_COMPILER=/path/to/flowlog/target/release/flowlog-compiler \
  ./target/release/flowlog-playground-server
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `BIND_ADDR` | `0.0.0.0:8080` | Address to listen on. |
| `FLOWLOG_COMPILER` | `flowlog-compiler` | Path to the compiler binary (PATH lookup if bare). |
| `FLOWLOG_PROFILE_VIZ` | `flowlog-profile-viz` | Path to the profile-visualizer binary (PATH lookup if bare). |
| `WORK_DIR` | `<tmp>/flowlog-playground` | Compile cache + per-request scratch dirs. |
| `ALLOWED_ORIGINS` | `https://flowlog-rs.github.io,http://localhost:3000` | Comma-separated CORS origins. `*` allows any. |
| `COMPILE_TIMEOUT_SECS` | `300` | Max time for one compilation. |
| `RUN_TIMEOUT_SECS` | `30` | Max time for one batch run. |
| `PROFILE_TIMEOUT_SECS` | `60` | Max time for one profile-report render. |
| `SESSION_TIMEOUT_SECS` | `900` | Max lifetime of an incremental session. |
| `MAX_WORKERS` | `8` | Upper bound on the client-requested `-w` count. |
| `MAX_PROGRAM_BYTES` | `256000` | Reject larger programs. |
| `MAX_TOTAL_FACT_BYTES` | `1048576` | Reject input facts larger than 1 MiB in total. |
| `MAX_REPORT_BYTES` | `25165824` | Drop (don't stream) profile reports larger than this. |
| `ENABLE_CACHE` | `true` | Reuse cached compiled binaries. |
| `RUST_LOG` | `info` | Log filter. |

## Deploying on CloudLab

A CloudLab node is a whole machine and a natural sandbox, so the server runs
directly with no extra isolation. The one requirement is **HTTPS/WSS**: the
playground is served from GitHub Pages over HTTPS, and browsers block an
HTTPS page from calling `http://` or `ws://` ("mixed content").

Put [Caddy](https://caddyscaddyfile.com) in front — it obtains a Let's Encrypt
certificate automatically for the node's public hostname:

```caddyfile
# /etc/caddy/Caddyfile  — replace with your node's CloudLab hostname
nodeX.yourcluster.cloudlab.us {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
# server on 8080 (localhost only is fine; Caddy faces the internet)
BIND_ADDR=127.0.0.1:8080 FLOWLOG_COMPILER=... \
  ./target/release/flowlog-playground-server &
caddy run --config /etc/caddy/Caddyfile
```

Then point the playground at it by editing `DEFAULT_SERVER` in
[`../src/pages/playground.js`](../src/pages/playground.js):

```js
const DEFAULT_SERVER = 'https://nodeX.yourcluster.cloudlab.us';
```

Rebuild and redeploy the Docusaurus site. The "Server" box in the playground
UI still lets users override this, so `http://localhost:8080` works for local
development.

> Redeploying every couple of weeks (new CloudLab node → new hostname) means
> updating `DEFAULT_SERVER` and the `Caddyfile` host each time.

## Note on the built-in examples

The example programs currently shipped in `playground.js` use a simplified
syntax (`.in`, `.input Source.csv`, `number`). Real FlowLog expects, e.g.:

```
.decl Source(id: int32)
.input Source(IO="file", filename="Source.csv", delimiter=",")
.decl Reach(id: int32)
.output Reach
Reach(y) :- Source(y).
```

Incremental programs use `.input Arc(IO="cmd", delimiter=",")`. The examples
should be updated to compile against a live server.
