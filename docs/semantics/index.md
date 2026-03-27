---
sidebar_label: Stratification
title: "Stratification"
---

import StyledFlowLog from '../../src/components/StyledFlowLog';

# Stratification

<StyledFlowLog /> evaluates your rules by repeatedly applying them until no new facts can be derived — a stable state called a <b>fixpoint</b>. The engine is powered by <a href="https://github.com/TimelyDataflow/differential-dataflow">Differential Dataflow</a>, which efficiently tracks only what changes each round.  

Most of the time, you don't need to think about this. But there are two situations where the evaluation order matters and the compiler will warn you: <b>negation</b> and <b>aggregation</b>.

## Stratification

Not all rules can run together. If relation A **negates** relation B, or **aggregates** over B, then B needs to be fully computed first — otherwise you're reading a half-finished answer.

<StyledFlowLog /> handles this automatically by splitting your program into ordered layers called <b>strata</b>:

1. **Analyze dependencies** — which relations depend on which.
2. **Group mutual recursion** — relations that depend on each other through positive edges go in the same stratum.
3. **Order by negation/aggregation** — if A negates or aggregates over B, B's stratum completes before A's begins.

### Example

```flowlog
.decl Edge(x: int32, y: int32)
.decl Node(x: int32)
.decl Reach(x: int32, y: int32)
.decl Unreachable(x: int32, y: int32)

// Stratum 1: Reach (positive recursion — safe to evaluate together)
Reach(x, y) :- Edge(x, y).
Reach(x, z) :- Reach(x, y), Edge(y, z).

// Stratum 2: Unreachable negates Reach — must wait for stratum 1
Unreachable(x, y) :- Node(x), Node(y), !Reach(x, y).
```

By the time `Unreachable` runs, `Reach` is fully computed. No surprises.

## Negation in recursion

What if negation appears inside a recursive cycle?

```flowlog
A(x) :- Node(x), !B(x).
B(x) :- Node(x), !A(x).
```

A needs B to be finished, and B needs A — there's no valid ordering. <StyledFlowLog /> will <b>warn</b> about this but still compile the program. The result may depend on evaluation order, so the semantics are your responsibility. If you've proven your program converges, go for it — just know the compiler can't guarantee correctness here.

## Aggregation in recursion

Same situation when an aggregate appears in a recursive rule:

```flowlog
SSSP(x, min(0)) :- Source(x).
SSSP(y, min(d + w)) :- SSSP(x, d), Edge(x, y, w).
```

Here <code>SSSP</code> aggregates over itself — <code>min</code> reads a relation that's still being computed. Strictly speaking, this breaks stratification.

<StyledFlowLog /> allows it with a <b>warning</b>. Monotone aggregates like <code>min</code> and <code>max</code> converge in practice because the value can only move in one direction. Non-monotone aggregates (<code>count</code>, <code>sum</code>, <code>average</code>) in recursion are riskier — the fixpoint may not be meaningful.

## Quick reference

| Pattern | Safe? | Notes |
|---------|-------|-------|
| Negation across strata | Yes | Compiler handles it automatically |
| Aggregation across strata | Yes | Earlier stratum finishes first |
| <code>min</code>/<code>max</code> in recursion | Usually | Monotone — converges in practice, but you own the proof |
| <code>count</code>/<code>sum</code>/<code>average</code> in recursion | Risky | Non-monotone — fixpoint may not be meaningful |
| Negation in recursive cycle | Risky | No valid stratification — evaluation-order dependent |
