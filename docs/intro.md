---
sidebar_position: 0
sidebar_label: Welcome
title: Welcome
---

import StyledFlowLog from '../src/components/StyledFlowLog';

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
