---
title: Language
---

import StyledFlowLog from '@site/src/components/StyledFlowLog';

# Language

<StyledFlowLog /> is a Datalog-based language that compiles to efficient Differential Dataflow executables. A program is a `.dl` file with **declarations** and **rules** — you describe *what* you want, and FlowLog figures out *how* to compute it.

Here's a complete program in 10 lines:

```flowlog
.decl Edge(src: int32, dst: int32)
.input Edge(IO="file", filename="Edge.csv", delimiter=",")

.decl Reach(node: int32)
.output Reach

Reach(y) :- Edge(1, y).
Reach(y) :- Reach(x), Edge(x, y).
```

This loads a graph, computes all nodes reachable from node `1`, and writes the result. The rest of this section covers how each piece works:

- [**Syntax**](syntax) — Variables, constants, comments, and `.include`.
- [**Types**](datatype) — `int32`, `string`, `f64`, and friends.
- [**Relations**](relations) — Declaring data with `.decl` and wiring up I/O.
- [**Rules**](rules) — The core logic: atoms, joins, and negation.
- [**Expressions**](expressions) — Arithmetic, string concatenation, and comparisons.
- [**Aggregation**](aggregation) — `min`, `max`, `sum`, `count`, `average`.
- [**User-Defined Functions**](extern-functions) — Call Rust code from your rules.
- [**Extended Semantics**](extended-semantics) — Loop blocks for fine-grained iteration control.
