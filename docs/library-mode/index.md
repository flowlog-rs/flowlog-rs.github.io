---
title: Library Mode
---

import StyledFlowLog from '@site/src/components/StyledFlowLog';

# Library Mode

<p>
  In addition to the standalone CLI compiler, <StyledFlowLog /> can be embedded directly into Rust projects as a library. Instead of producing a separate binary, <b>library mode</b> compiles Datalog programs into Rust modules at <code>cargo build</code> time and links them into your application.
</p>

This is useful when you want to:

- **Embed Datalog computation inside an existing Rust application** rather than managing a separate executable.
- **Drive dataflow programmatically** — feed data from your own structs, iterate over results in-process, and integrate with your application's error handling.
- **Use `cargo` as the single build system** — no extra CLI invocation or build script coordination.

Library mode is provided by two crates:

| Crate | Role |
|-------|------|
| [`flowlog-build`](https://crates.io/crates/flowlog-build) | Build-time compilation of `.dl` programs into Rust source modules. Added as a **build-dependency**. |
| [`flowlog-runtime`](https://crates.io/crates/flowlog-runtime) | Runtime types and traits used by the generated code. Added as a **regular dependency**. |

Both batch and incremental execution modes are supported.

- [**Setup**](setup) — Add the crates and write a minimal `build.rs`.
- [**Configuration**](configuration) — Tune compilation with the `Builder` API.
