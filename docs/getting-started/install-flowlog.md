---
sidebar_position: 1
title: Install FlowLog
---

## Binary distributions

If you are using Ubuntu Linux, get a packaged version from our [GitHub Releases](https://github.com/flowlog-rs/FlowLog/releases). We are actively supporting more platforms.

## Build from sources

Follow these steps when you need the latest FlowLog bits or want to target an OS that does not yet have a prebuilt package.

### Clone the repository

~~~bash
git clone https://github.com/flowlog-rs/FlowLog.git
cd FlowLog
~~~

### Set up prerequisites (Ubuntu or macOS)

For the common paths (Ubuntu/Debian and macOS), just run the bootstrap script that already sets everything up:

~~~bash
bash tools/env.sh
~~~

The script refreshes system packages (`apt` on Linux, Homebrew on macOS), ensures `rustup` is installed, switches to the latest stable toolchain, and finishes with `cargo check` so you know the workspace compiles.

**Prefer to do it manually? Make sure you have:**

- A recent `rustup` + `cargo` (Rust 1.80 or newer is recommended)
- A C/C++ toolchain (`build-essential` on Ubuntu or Xcode Command Line Tools on macOS)
- `pkg-config`, `libssl-dev` (or `openssl` via Homebrew), `clang`/`llvm`, `curl`, and `git`
- Any backend-specific libraries your deployment target requires

Once those pieces are installed you can skip the script and proceed directly to the build.

### Build the workspace

~~~bash
cargo build --release
~~~

Artifacts are emitted under `target/release/`. Drop `--release` for faster debug builds while iterating.

### Run the tests

~~~bash
cargo test --workspace
~~~

Running the full test suite is a good final verification step before packaging binaries or submitting changes.
