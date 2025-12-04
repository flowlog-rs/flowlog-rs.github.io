---
sidebar_position: 3
title: Run FlowLog
---

Use the generator to lower FlowLog programs into Timely/Differential binaries.

```bash
cargo run -p generator -- path/to/program.dl -F facts/ -o demo-app
cd ../demo-app
cargo run --release
```

### CLI flags

| Flag | Description | Required | Notes |
| --- | --- | --- | --- |
| `PROGRAM` | Path to a `.dl` file. Accepts `all`/`--all` to iterate over every program in `examples/`. | Yes | Paths are workspace-relative unless absolute. |
| `-F, --fact-dir <DIR>` | Directory containing CSV facts referenced via `.input`. | When using relative `.input` paths | Prepends `<DIR>` to every `filename=` entry. |
| `-o, --output <NAME>` | Override the generated Cargo package name. | No | Defaults to `<PROGRAM>` stem and writes beside the repo. |
| `-D, --output-dir <DIR>` | Destination for `.output` relations. | When `.output` is present | Pass `-` to stream tuples to stderr. |
| `--mode <MODE>` | Execution semantics: `batch` (default) or `incremental`. | No | Incremental uses signed diffs to enable live updates. |

### Run modes

- **Batch**: easiest for single-shot analyses. Generated binaries ingest all facts, compute a fixpoint, and exit.
- **Incremental**: keeps Timely workers alive and applies changes as new facts arrive. Use this for continuous telemetry pipelines.

If you change the FlowLog program, rerun the generator to refresh the Cargo workspace, then rebuild with `cargo run --release`.
