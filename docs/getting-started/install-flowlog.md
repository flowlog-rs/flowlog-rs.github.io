---
sidebar_position: 1
title: Install FlowLog
---

## Binary distributions

If you’re using Ubuntu/Debian, macOS or Windows, download a packaged version from our [GitHub Releases](https://github.com/flowlog-rs/FlowLog/releases). We are actively supporting more platforms.

## Build from sources

Follow these steps when you need the latest FlowLog bits or want to target an OS that does not yet have a prebuilt package.

### Clone the repository

```bash
$ git clone https://github.com/flowlog-rs/FlowLog.git
$ cd FlowLog
```

### Set up prerequisites

For the common platforms, run the bootstrap script that already sets everything up:

- **Ubuntu/Debian** and **macOS**:
```bash
$ bash tools/env.sh
```

- **Windows**:
```bash
$ powershell -ExecutionPolicy Bypass -File tools/env.ps1
```

The script refreshes system packages (`apt` on Linux, Homebrew on macOS), ensures `rustup` is installed, switches to the latest stable toolchain, and finishes with `cargo check` so you know the workspace compiles.

**Prefer to do it manually? Make sure you have:**

- A recent Rust toolchain installed via `rustup` (Rust 1.80 or newer is recommended)
- A C/C++ build toolchain (`build-essential` on Ubuntu/Debian or Xcode Command Line Tools on macOS)
- Git and cURL (these are usually installed by default on most systems)

Once those pieces are installed you can skip the script and proceed directly to the build.

### Build the workspace

```bash
$ cargo build --release
```

Artifacts are emitted under `target/release/`. Drop `--release` for faster debug builds while iterating.

### Run the tests

```bash
$ bash tools/check/check.sh
```

Running the full test suite is a good final verification step before packaging binaries or submitting changes.
