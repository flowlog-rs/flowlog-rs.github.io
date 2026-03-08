---
title: Language
---

import StyledFlowLog from '@site/src/components/StyledFlowLog';

# Language

<StyledFlowLog /> is a Datalog-based language that compiles to Rust. A program consists of **declarations** and **rules**.

**Declarations** define relations and their types, specify I/O, and declare user-defined functions:

```flowlog
.decl Edge(src: int32, dst: int32)
.input Edge

.decl Reach(node: int32)
.output Reach

.extern fn my_hash(x: int32, y: int32) -> int64
```

**Rules** derive new facts from existing ones. Every rule ends with a period (`.`):

```flowlog
Reach(y) :- Edge(1, y).
Reach(y) :- Reach(x), Edge(x, y).
```

A complete program combines both:

```flowlog
.decl Edge(src: int32, dst: int32)
.input Edge

.decl Reach(node: int32)
.output Reach

Reach(y) :- Edge(1, y).
Reach(y) :- Reach(x), Edge(x, y).
```
