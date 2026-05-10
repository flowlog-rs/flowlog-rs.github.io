---
sidebar_position: 1
title: Setup
---

import StyledFlowLog from '@site/src/components/StyledFlowLog';

# Setup

This page walks through embedding a <StyledFlowLog /> program inside a Rust project, from adding dependencies to running the generated engine.

## Add dependencies

Add `flowlog-runtime` as a regular dependency and `flowlog-build` as a build dependency in your `Cargo.toml`:

```toml
[dependencies]
flowlog-runtime = "0.2"

[build-dependencies]
flowlog-build = "0.2"
```

## Write a Datalog program

Place your `.dl` file in the project root (or any path your `build.rs` can reference). For example, `reachability.dl`:

```flowlog
.decl Edge(src: int32, dst: int32)
.input Edge(IO="file", filename="Edge.csv", delimiter=",")

.decl Reach(node: int32)
.output Reach

Reach(y) :- Edge(1, y).
Reach(y) :- Reach(x), Edge(x, y).
```

## Compile in `build.rs`

Create a `build.rs` that invokes the <StyledFlowLog /> compiler. The simplest form is a single function call:

```rust
fn main() {
    flowlog_build::compile("reachability.dl").unwrap();
}
```

This compiles `reachability.dl` into a Rust module that `cargo` picks up automatically during the build.

## Use the generated engine

Include the generated module in your Rust code with `include!`, then instantiate the engine:

### Batch mode

```rust
// Pull in the generated module.
include!(concat!(env!("OUT_DIR"), "/reachability.rs"));

fn main() {
    // Build the engine, insert input tuples, and run.
    let mut engine = DatalogBatchEngine::new();

    // Insert Edge tuples programmatically.
    engine.insert_edge((1, 2));
    engine.insert_edge((2, 3));
    engine.insert_edge((3, 4));

    // Execute the dataflow with 4 worker threads.
    let result = engine.run(4);

    // Iterate over the output relation.
    for tuple in &result.reach {
        println!("Reach: {:?}", tuple);
    }
}
```

### Incremental mode

For incremental mode, compile with `ExecutionMode::DatalogIncremental` (see [Configuration](configuration)), then drive updates through transactions:

```rust
include!(concat!(env!("OUT_DIR"), "/reachability.rs"));

fn main() {
    let mut engine = DatalogIncrementalEngine::new(4); // 4 workers

    // First transaction: insert initial facts.
    engine.begin();
    engine.put_edge((1, 2), 1);  // multiplicity +1
    engine.put_edge((2, 3), 1);
    engine.commit();

    // Second transaction: remove an edge.
    engine.begin();
    engine.put_edge((2, 3), -1); // multiplicity -1
    engine.commit();
}
```

Each `commit()` advances the logical clock and produces output deltas for that epoch.
