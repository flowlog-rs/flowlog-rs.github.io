---
sidebar_position: 1
title: Environment Setup
---

## Bootstrap Script

```bash
bash tools/env.sh
```

The script installs a stable Rust toolchain, `rustup`, and supporting utilities required for Timely/Differential builds. It also checks for common dependencies such as `cmake`, `clang`, and `protobuf`.

## Manual Requirements

- Rust 1.80 or newer with `cargo`
- `wasm32-wasi` target (for generator smoke tests)
- `libssl-dev`, `pkg-config`, and other Timely runtime packages on Linux

Ensure `$CARGO_HOME/bin` is on your `PATH` before continuing.
