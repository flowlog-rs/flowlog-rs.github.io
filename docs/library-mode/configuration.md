---
sidebar_position: 2
title: Configuration
---

import StyledFlowLog from '@site/src/components/StyledFlowLog';

# Configuration

The `Builder` API gives fine-grained control over how <StyledFlowLog /> compiles your Datalog programs. Use it in `build.rs` when the one-liner `compile()` isn't enough.

## Builder API

```rust
fn main() {
    flowlog_build::Builder::default()
        .sip(true)                                   // Sideways Information Passing
        .string_intern(true)                         // String interning
        .mode(flowlog_build::ExecutionMode::DatalogIncremental) // Incremental mode
        .profile(true)                               // Operator profiling
        .udf_file("udfs.rs")                         // User-defined functions
        .compile(
            &["program.dl"],                         // Program files
            &["include/"],                           // Include directories
        )
        .unwrap();
}
```

## Options reference

| Method | Type | Default | Description |
|--------|------|---------|-------------|
| `mode(m)` | `ExecutionMode` | `DatalogBatch` | Execution mode: `DatalogBatch` or `DatalogIncremental`. |
| `sip(flag)` | `bool` | `false` | Enable Sideways Information Passing for demand-driven evaluation. |
| `string_intern(flag)` | `bool` | `false` | Intern string values for reduced memory and faster equality checks. |
| `profile(flag)` | `bool` | `false` | Emit per-operator profiling counters in the generated code. |
| `udf_file(path)` | `impl AsRef<Path>` | none | Path to a Rust source file containing [user-defined functions](../language/extern-functions). |

### `compile(programs, includes)`

The terminal method. Accepts:

- **programs** — a slice of `.dl` file paths to compile.
- **includes** — a slice of directories to search for `.include` directives.

Returns `Result<(), BoxError>`.

## Execution mode

| Mode | Enum variant | When to use |
|------|-------------|-------------|
| Batch | `ExecutionMode::DatalogBatch` | Load all data, compute once, read results. |
| Incremental | `ExecutionMode::DatalogIncremental` | Stream updates over time, observe deltas per epoch. |

Batch mode generates a `DatalogBatchEngine` with `insert_*` and `run()` methods. Incremental mode generates a `DatalogIncrementalEngine` with `begin()`, `put_*()`, `file_*()`, and `commit()` for transactional updates.

## Runtime crate

The [`flowlog-runtime`](https://crates.io/crates/flowlog-runtime) crate provides types used by the generated code:

- **`Relation` trait** — auto-implemented on every generated relation type, providing `relation_name()` and `to_tuple()`.
- **`intern` module** — thread-safe string interning (used when `string_intern` is enabled).
- **`io` module** — CSV file reader and parallel data ingestion helpers.
- **`txn` module** — transaction primitives for incremental mode (`Diff`, `TxnOp`, `TxnAction`, `TxnState`).

## Error handling

`Builder::compile` returns a `Result`. Common failure modes:

- **Parse errors** in the `.dl` file — the error message includes line and column.
- **Missing UDF file** — the path passed to `udf_file()` does not exist.
- **Type mismatches** — UDF signatures don't match their `.extern fn` declarations.

```rust
fn main() {
    if let Err(e) = flowlog_build::Builder::default()
        .compile(&["program.dl"], &[])
    {
        eprintln!("FlowLog build failed: {e}");
        std::process::exit(1);
    }
}
```
