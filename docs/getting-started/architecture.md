---
sidebar_position: 3
title: Architecture Overview
---

```
crates/
├── common       # shared CLI/parsing utilities and fingerprint helpers
├── parser       # Pest grammar and AST for the FlowLog language
├── stratifier   # dependency graph + SCC-based scheduling of rules
├── catalog      # per-rule metadata (signatures, filters, comparisons)
├── optimizer    # heuristic plan trees consumed by the planner
├── planner      # lowers strata into transformation flows
└── generator    # writes Timely/DD executables from planned strata
```

Each crate produces an artifact consumed by the next stage: parsed ASTs feed the stratifier, stratified rules become logical plans, and the planner emits dataflow descriptions that the generator renders into Timely/Differential Rust projects.
