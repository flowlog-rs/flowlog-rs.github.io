---
sidebar_position: 1
title: "Install"
---

import StyledFlowLog from '../../src/components/StyledFlowLog';

## Binary distributions

If you’re using Ubuntu/Debian, macOS or Windows, download a packaged version from our [GitHub Releases](https://github.com/flowlog-rs/FlowLog/releases). We are actively supporting more platforms.

## Build from sources

Follow these steps when you need the latest <StyledFlowLog /> changes or want to target an OS that does not yet have a prebuilt package.

### Clone the repository

```bash
$ git clone https://github.com/flowlog-rs/flowlog.git
$ cd flowlog
```

The default branch, `main`, contains ongoing development and can include
unreleased changes. To build a published compiler version, check out its tag
before building, for example:

```bash
$ git switch --detach flowlog-compiler-v0.6.0
```

For contributions, create a feature branch from `main` and target your PR at
`main`. See the [contributor guide](https://github.com/flowlog-rs/flowlog/blob/main/AGENTS.md)
and [release process](https://github.com/flowlog-rs/flowlog/blob/main/docs/dev/releases.md).

### Set up prerequisites

For the common platforms, run the bootstrap script that already sets everything up:

- **Ubuntu/Debian** and **macOS**:
```bash
$ bash env/env.sh
```

- **Windows**:
```powershell
$ powershell -ExecutionPolicy Bypass -File env/env.ps1
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

The compiler is emitted at `target/release/flowlog-compiler` (`flowlog-compiler.exe`
on Windows). Drop `--release` for faster debug builds while iterating.

### Run the tests

```bash
$ bash tests/fixtures/run_compiler.sh
$ bash tests/fixtures/run_lib.sh
```

See [the testing guide](https://github.com/flowlog-rs/flowlog/blob/main/tests/README.md)
for unit tests, fixture suites, and the Souffle oracle.
