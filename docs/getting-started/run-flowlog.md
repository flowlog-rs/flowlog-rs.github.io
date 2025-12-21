---
sidebar_position: 3
title: Run FlowLog
---

import StyledFlowLog from '../../src/components/StyledFlowLog';

<p>
  <StyledFlowLog /> is a compiler for executing Datalog programs. The execution mode (batch, incremental, etc.) is determined by the runtime arguments when you execute the generated program.
</p>

## Input/Output

<p>
  <StyledFlowLog /> supports file-based I/O so you can separate Datalog programs from their data. Input files correspond to the extensional database (<strong>EDB</strong>) while output files correspond to the intensional database (<strong>IDB</strong>) in Datalog terminology.
</p>

### Input relations

A relation becomes an input relation when you add `.input` to its declaration:

```flowlog
.decl my_relation(a:number, b:number)
.input my_relation
```

#### Batch mode

In **batch** mode, <StyledFlowLog /> loads all input facts from disk before executing the program.

By default, <StyledFlowLog /> searches for input facts in the directory specified by `-F <fact-dir>`. If `-F` is not provided, it assumes the fact files are in the current directory. The default filename is `<relation_name>.csv`, so the example above expects `my_relation.csv` in either the current directory or `<fact-dir>`.

If you need precise control over the filename, specify it explicitly:

```flowlog
.decl my_relation(a:number, b:number)
.input my_relation(filename="my_relation_data.csv")
```

#### Incremental mode

In **incremental** mode, input relations are updated at runtime through an interactive command loop (instead of being loaded from `-F`). You can push tuple-level or file-based updates, then `commit` to apply them.

```text
Commands:
  cmd | begin
  put  <rel> <tuple> [diff]
  file <rel> <path>  [diff]
  commit | done
  abort | rollback
  quit | exit | q
  help | h | ?

Examples:
  cmd
  put source 7
  put arc 1,2 +1
  put arc 1,2 -1
  file source /tmp/Source.csv +1
  file arc    /tmp/Arc.csv    -1
  commit
```

Notes:

- `put <rel> <tuple> [diff]` applies a single-tuple update.
- `file <rel> <path> [diff]` applies updates from a CSV at an explicit filesystem path (so `-F` is not used here).
- The optional `diff` is a signed multiplicity (e.g., `+1`, `-1`). If omitted, it defaults to `+1`.

To select the mode when running the generated Rust crate, pass `--mode` to the compiled binary:

```bash
# Batch: load inputs from -F, write outputs to -D
$ cargo run --release -- --mode batch -w 4 -F ./input -D ./output

# Incremental: interactively update inputs; outputs still go to -D
$ cargo run --release -- --mode incremental -w 4 -D ./output
```

### Output relations

You can mark relations for output with `.output`:

```flowlog
.decl result(a:number, b:number, c:number)
.output result
```

In both **batch** and **incremental** modes, <StyledFlowLog /> writes outputs to the current directory by default. You can set a default output directory with `-D <output-dir>`, or write to standard output with `-D -`. With default naming, the example above is written under the name `result.csv` in the chosen output directory.

As with input, you can specify a custom output file:

```flowlog
.decl result(a:number, b:number, c:number)
.output result(filename="result.csv")
```

In **incremental** mode, outputs are emitted as the computation advances, so <StyledFlowLog /> appends a timestamp suffix to the output filename to avoid overwriting previous snapshots (for example, `result_<timestamp>.csv`).

### Delimiters, compression

Both input and output support a custom `delimiter` and can choose whether the data is compressed. For example:

```flowlog
.decl result(a:number, b:number, c:number)
.output result(filename="<path to output file>", delimiter="|", compress=true)
```

This writes columns separated by `|` and compresses the output using gzip (TODO: unsupported feature).

### Printing relation sizes

If you use `.printsize`, <StyledFlowLog /> prints the number of tuples of a relation to standard output instead of writing the relation to a file:

```flowlog
.decl result(a:number, b:number, c:number)
.printsize result
```

## Profiling (unsuported for now)

As a side-effect of execution, a profiling log can be generated. You can visualize this log with `flowlogprof` (see the profiler section for details). Profiling is enabled by passing `-p <log-file>` when running the compiler, and it works in both batch and incremental modes.

## Parallel execution

All execution modes of <StyledFlowLog /> support parallel evaluation **at runtime**. Parallelism is controlled when running the **compiled** Rust binary (the generated crate), not when invoking the <StyledFlowLog /> compiler.

Use `-w <num>` to choose the number of worker threads:

```bash
# Run the compiled crate with 4 workers
$ cargo run --release -- -w 4
```

## Verbose compiler output

The `flowlog` compiler is itself a Rust program, so you can enable more verbose **compiler** logs by setting `RUST_LOG` when you run `flowlog`:

```bash
$ RUST_LOG=debug flowlog examples/example.dl -o example_flowlog -F ./input -D ./output
```

Valid levels are typically `trace`, `debug`, `info`, `warn`, and `error`.

Note: `RUST_LOG` here controls the **compiler’s** logging (i.e., the `flowlog` command). It is separate from runtime flags like `-w` / `-j`, which control how the **compiled binary** executes your program.

More informations about verbose compiler output is described in the developer documentations.
