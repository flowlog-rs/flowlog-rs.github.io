---
sidebar_position: 4
title: Examples
---

The `examples/` directory contains ready-to-run FlowLog programs you can compile with the generator:

| Example | File | Highlights |
| --- | --- | --- |
| **Reachability** | `examples/simple.dl` | Intro program for graph traversal using recursive rules. |
| **ACL Monitor** | `examples/acl.dl` | Demonstrates joins between flows, policies, and hosts. |
| **Saturation Test** | `examples/stress.dl` | Exercises planner heuristics and constraint propagation. |

To explore one:

```bash
cargo run -p generator -- examples/simple.dl -F examples/facts
cd ../simple
cargo run --release
```

Use `--mode incremental` plus a streaming fact source to watch results adjust in real time.
