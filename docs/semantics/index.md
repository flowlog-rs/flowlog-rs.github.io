---
sidebar_label: Semantics
title: "Semantics"
---

import StyledFlowLog from '../../src/components/StyledFlowLog';

You've written rules. But how does <StyledFlowLog /> actually evaluate them? This section peels back the curtain.

## The goal: find a fixpoint

A Datalog program says "these facts imply those facts." The engine's job is to apply all your rules repeatedly until nothing new can be derived. That stable state — where applying rules one more time wouldn't change anything — is called a **fixpoint**.

Take transitive closure:

```flowlog
.decl Edge(x: int32, y: int32)
.decl Reach(x: int32, y: int32)

Reach(x, y) :- Edge(x, y).
Reach(x, z) :- Reach(x, y), Edge(y, z).
```

With edges `1→2` and `2→3`:
- **Round 1:** rule 1 gives us `Reach(1,2)` and `Reach(2,3)`.
- **Round 2:** rule 2 combines `Reach(1,2)` + `Edge(2,3)` → `Reach(1,3)`.
- **Round 3:** nothing new. Fixpoint reached.

Simple enough. The question is *how* you get there — and how much redundant work you do along the way.

## This section covers

- [**Naive Evaluation**](naive) — The simple baseline: re-derive everything each round. Easy to understand, terrible at scale.
- [**Semi-Naive Evaluation**](semi-naive) — What <StyledFlowLog /> actually uses: only process what's new each round.
- [**Stratification**](stratification) — How the compiler layers rules so negation and aggregation see fully computed inputs.
