---
sidebar_position: 1
title: Language Overview
---

FlowLog accepts a Soufflé-compatible Datalog dialect with recursion, negation, arithmetic, and aggregations.

```datalog
.decl Edge(src: number, dst: number)
.input Edge(IO="file", filename="edge.csv")

.decl Triangle(x: number, y: number, z: number)
.printsize Triangle

.decl PathLen(src: number, dst: number, total: number)
.printsize PathLen

Triangle(x, y, z) :-
    Edge(x, y),
    Edge(y, z),
    Edge(z, x),
    x != y,
    y != z,
    z != x.

PathLen(src, dst, sum(len)) :-
    Edge(src, mid),
    Edge(mid, dst),
    len = 1.

IndirectOnly(x, z) :-
    Edge(x, y),
    Edge(y, z),
    !Edge(x, z).
```

Features:

- Stratified negation with automatic SCC detection.
- Arithmetic expressions in rule heads and bodies.
- Aggregations (`count`, `sum`, `min`, `max`) with per-relation type consistency.
- CSV ingestion for integer or string relations, sharded across Timely workers on the first attribute.
- `.output` to materialize IDBs and `.printsize` to record cardinalities.
