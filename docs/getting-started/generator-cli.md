---
sidebar_position: 4
title: Generator CLI
---

Use the generator to lower FlowLog programs into Timely/Differential Cargo projects.

```bash
cargo run -p generator -- <PROGRAM> [OPTIONS]
```

| Flag | Description | Required | Notes |
| --- | --- | --- | --- |
| `PROGRAM` | Path to a `.dl` file. Accepts `all`/`--all` to iterate over every program in `example/`. | Yes | Parsed relative to the workspace unless absolute. |
| `-F, --fact-dir <DIR>` | Directory containing input CSVs referenced by `.input`. | When `.input` uses relative paths | Prepends `<DIR>` to every `filename=` parameter. |
| `-o, --output <NAME>` | Override the generated Cargo package name. | No | Default derives from `<PROGRAM>` and writes to `../<NAME>`. |
| `-D, --output-dir <DIR>` | Location for `.output` relations. | When relations use `.output` | Pass `-` to print tuples to stderr. |
| `--mode <MODE>` | Execution semantics: `batch` (default) or `incremental`. | No | `incremental` switches the diff type to `isize`. |
| `-h, --help` | Show full Clap help text. | No | Includes extra examples and environment variables. |
