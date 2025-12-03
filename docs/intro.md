---
sidebar_position: 0
sidebar_label: Welcome
title: Welcome to FlowLog
---

<p align="center">
  <img src="/img/flowlog_full.png" alt="FlowLog Logo" width="420" />
</p>

FlowLog is a Datalog-inspired toolchain for building dataflow services. It compiles Datalog programs into Rust crates backed by [Differential Dataflow](https://github.com/TimelyDataflow/differential-dataflow), ingests telemetry and cloud-flow data, and plans optimized pipelines that are ready to deploy. FlowLog is built for workloads that need to keep results fresh as data changes, without giving up on performance stability or operability at scale.

- **Incremental by design**. FlowLog maintains results incrementally instead of recomputing from scratch, so updates are fast and efficient even over large fact sets.

- **Low latency with predictable performance**. FlowLog takes care of join ordering and physical planning for you, so you only write declarative logic rules while the compiler produces robust plans with stable, low-latency behavior—rather than brittle, hand-tuned queries.

- **Scales up and out**. The same FlowLog program can run on a single powerful machine or across a cluster. Compiled artifacts are standard Rust workspaces fits naturally into existing systems workflows.

FlowLog grew out of a long line of Datalog systems work in Prof. Paraschos Koutris’s group at University of Wisconsin–Madison. The story starts with RecStep, a Datalog engine backend led by Ph.D. Zhiwei Fan, continues with a Differential Dataflow–based prototype developed by Ph.D. Hangdong Zhao, and is now being actively extended by Zhenghong Yu to support richer language features, better tooling, and broader workloads.

## Why the Name “FlowLog”?

FlowLog is literally named from its two main ingredients: **Differential Data*flow*** and **Data*log***.

## Improve This Documentation

We welcome edits and additions. If there are errors, and/or explanations in the documentation can be improved, please let us know. [File an issue](https://github.com/flowlog-rs/flowlog-rs.github.io/issues/new).
