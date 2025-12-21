---
sidebar_position: 0
sidebar_label: Welcome
title: Welcome to FlowLog
---

import StyledFlowLog from '../src/components/StyledFlowLog';

<p align="center">
  <img src="/img/flowlog_full.png" alt="FlowLog Logo" width="420" />
</p>

<p>
  <StyledFlowLog /> is a Datalog-inspired toolchain for building dataflow services. It compiles Datalog programs into Rust crates backed by <a href="https://github.com/TimelyDataflow/differential-dataflow">Differential Dataflow</a>, ingests telemetry and cloud-flow data, and plans optimized pipelines that are ready to deploy. <StyledFlowLog /> is built for workloads that need to keep results fresh as data changes, without giving up on performance stability or operability at scale.
</p>

<ul>
  <li>
    <strong>Incremental by design.</strong> <StyledFlowLog /> maintains results incrementally instead of recomputing from
    scratch, so updates are fast and efficient even over large fact sets.
  </li>
  <li>
    <strong>Low latency with predictable performance.</strong> <StyledFlowLog /> takes care of join ordering and physical planning for you. You only write declarative logic rules while the compiler produces robust plans with stable, low-latency behavior—rather than brittle, hand-tuned queries.
  </li>
  <li>
    <strong>Scales up and out.</strong> The same <StyledFlowLog /> program can run on a single powerful machine or across a cluster. Compiled artifacts are standard Rust workspaces that fit naturally into existing systems workflows.
  </li>
</ul>

<p>
  <StyledFlowLog /> grew out of a long line of Datalog systems work in Prof. Paraschos Koutris’s group at the University
  of Wisconsin–Madison. The story starts with <strong>RecStep</strong>, a Datalog engine backend led by Ph.D. Zhiwei Fan; continues with a Differential Dataflow–based prototype developed by Ph.D. Hangdong Zhao; and is now being actively extended by Zhenghong Yu to support richer language features, better tooling, and broader workloads.
</p>

## Why the Name “FlowLog”?

<p>
  <StyledFlowLog /> is named from its two main ingredients: <strong>Differential Data<em>flow</em></strong> and{' '}
  <strong>Data<em>log</em></strong>.
</p>

## Improve This Documentation

We welcome edits and additions. If you find errors or spots where the explanations can be improved, please let us know by
filing an issue on GitHub: <a href="https://github.com/flowlog-rs/flowlog-rs.github.io/issues/new">File an issue</a>.
