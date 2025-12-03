---
sidebar_position: 2
title: Build the Workspace
---

## Compile Everything

```bash
cargo build --release
```

The workspace is split into crates such as `parser`, `planner`, and `generator`. Building in release mode ensures deterministic fingerprints and surfaces linker issues early.

## Useful Targets

- `cargo check -p generator` for rapid iteration on the CLI.
- `cargo fmt && cargo clippy --all-targets` before opening a pull request.
- `cargo test --workspace` to exercise unit suites outside the regression harness.
