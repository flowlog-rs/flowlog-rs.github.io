---
slug: flowlog-differential-dataflow-sharding
title: How FlowLog Uses Differential Dataflow's Sharding Model
authors: [nemo]
tags: [flowlog, differential-dataflow, timely-dataflow, performance]
description: How Differential Dataflow's key-based sharding shapes FlowLog's generated dataflows, arrangements, joins, and performance.
---

FlowLog gives you a Datalog language, but the program that eventually runs is a Differential Dataflow (DD) graph. That makes one DD property especially important to FlowLog's design: stateful work is sharded by key.

The rule is simple. Hash the logical key, send every record with that key to one worker, and keep the key's indexed state there. DD does not watch CPU load and continually move expensive work to idle workers. It expects the dataflow to expose enough independent keys for static sharding to work well.

FlowLog should not treat this as a hidden runtime detail. Whenever the compiler chooses an arrangement key for a join, aggregate, or deduplication, it is also choosing where the corresponding state and work will live.

Let's follow one FlowLog rule through that process.

<!--truncate-->

## Start with two joins

Consider:

```flowlog
Middle(x, y) :- Left(x, a), Right(x, a, y).
Output(y, z) :- Middle(x, y), Other(y, z).
```

The first join needs records grouped by `x`. The second needs records grouped by `y`. FlowLog generates arrangements and exchanges to make both requirements true:

<div className="engineering-flow" aria-label="Left and Right are exchanged by x, joined by x, exchanged by y, and joined by y">
  <div className="engineering-flow__step"><span>Inputs</span><strong>Left + Right</strong></div>
  <div className="engineering-flow__arrow"><span>exchange by x</span></div>
  <div className="engineering-flow__step"><span>worker hash(x)</span><strong>Join on x</strong></div>
  <div className="engineering-flow__arrow"><span>exchange by y</span></div>
  <div className="engineering-flow__step"><span>worker hash(y)</span><strong>Join on y</strong></div>
  <div className="engineering-flow__arrow"><span>emit</span></div>
  <div className="engineering-flow__step"><span>Relation</span><strong>Output</strong></div>
</div>

Suppose `hash(x = 1)` selects worker 1. Every `Left` and `Right` record with `x = 1` goes to worker 1. The arrangement state for that key lives there, and worker 1 computes all of its matches.

Now suppose the join emits a tuple with `y = 7`, and `hash(y = 7)` selects worker 3. The next exchange sends that tuple from worker 1 to worker 3 for the second join.

This is the first useful FlowLog design lesson: a relation is not assigned to one worker forever. It can be sharded by `x` for one operator, then reshuffled by `y` for the next. The key required by each stateful operator determines the current ownership.

## What FlowLog asks DD to do

Every Timely worker contains a copy of the generated dataflow graph. Within one worker, operator activations run sequentially; across workers, those graph copies run concurrently over different shards.

FlowLog's generated exchange supplies the routing key. Timely 0.31.0 maps its `u64` with `hash & (workers - 1)` when the worker count is a power of two, and `hash % workers` otherwise. DD normally uses an FNV hash: `arrange_by_key` hashes the logical key, while `arrange_by_self` hashes the complete tuple.

Once records arrive at their owner, DD stores them in worker-local arrangements. A join arranged by `x` is therefore not one global index with every worker fighting over it. It is a collection of local indexed traces, each responsible for a subset of `x` values.

That locality is a large part of why DD is fast. The owner can update its join, reduce, threshold, or distinct state without taking a global lock for every record. When several FlowLog operators need the same arrangement, FlowLog can reuse the indexed trace instead of repeating the exchange, sorting, and state maintenance.

So FlowLog's compiler is doing more than translating Datalog syntax into Rust calls. It is laying out distributed state:

<div className="engineering-flow" aria-label="FlowLog chooses an operator key, DD exchanges records, the owner maintains an arrangement, and the operator runs locally">
  <div className="engineering-flow__step"><span>FlowLog</span><strong>Choose operator key</strong></div>
  <div className="engineering-flow__arrow"><span>generate exchange</span></div>
  <div className="engineering-flow__step"><span>DD</span><strong>Route by hash</strong></div>
  <div className="engineering-flow__arrow"><span>co-locate</span></div>
  <div className="engineering-flow__step"><span>Owner worker</span><strong>Maintain state</strong></div>
  <div className="engineering-flow__arrow"><span>process</span></div>
  <div className="engineering-flow__step"><span>Local operator</span><strong>Join / reduce / distinct</strong></div>
</div>

The relevant code is in FlowLog's [transformation generation][flowlog-transform]. Input distribution is handled separately by [file input][flowlog-input] and [incremental input staging][flowlog-incremental].

That separation matters. FlowLog can divide an input file evenly across workers and still create an imbalanced join later, because ingestion and operator state use different partitioning rules.

## Here is the catch: hashing balances keys, not work

For worker `i`, the meaningful load is the sum of `cost(key)` over the keys assigned to that worker. Hashing distributes many independent keys statistically, but it has no idea how expensive each one is.

For a many-to-many join, a useful approximation is `cost(key) ~= left_values(key) * right_values(key)`. If `x = 1` has 1,000 values on the left and 2,000 on the right, its owner may compute 2,000,000 candidate pairs. A perfect distribution of every other key does not divide that cross-product.

This gives us a direct prediction: many distinct join keys should scale well, while one dominant key should concentrate the arrangement and join on one worker.

### We tested that prediction

We ran this FlowLog semijoin with two input distributions. Both produced 4,000,000 output tuples.

```flowlog
Joined(v) :- Left(k, v), Right(k).
```

| Input distribution | 1 worker | 18 workers | Speedup |
| --- | ---: | ---: | ---: |
| Four million distinct keys | 0.97 s | 0.095 s | 10.2x |
| One join key | 0.605 s | 0.32 s | 1.9x |

The measurements were made on an Apple M5 Max with 18 physical cores using FlowLog commit `f29dc83be336`, `differential-dataflow` 0.25.1, and Timely 0.31.0.

The distinct-key case was well distributed: maximum worker time was 1.18 times the mean in the arrangement and 1.15 times the mean in the join. It reached a 10.2x speedup.

The hot-key case looked completely different. Maximum worker time was 17.99 times the mean in the arrangement and 17.95 times the mean in the join. With 18 workers, 18 is the largest possible ratio, so those phases ran almost entirely on one worker.

Every source worker contributed input, but exchange routed the hot key to one target. Nothing malfunctioned: DD preserved exactly the co-location the join required. The physical work attached to that key simply was not divisible under this sharding.

The hot-key program still improved from 0.605 seconds to 0.32 seconds. Why? Because the whole FlowLog graph did not use the hot key everywhere. Parsing was distributed, and a later whole-result deduplication reshuffled output by the complete tuple. One stage can be badly skewed while the surrounding stages still use several workers.

This is why looking only at end-to-end speedup can be misleading. To understand a FlowLog dataflow, we need to ask which key owns the state at each stage.

## Can the scheduler rescue a hot shard?

Not automatically. Timely schedules active operator copies after exchange has assigned their data and state. An idle worker cannot take half of `x = 1`, because it does not own that arrangement partition or its cursor. Moving the computation would also require moving or replicating the state.

Scheduling is cooperative rather than preemptive. When a worker calls an active operator, the operator keeps that worker thread until it returns. DD 0.25.1 gives join a budget of 2,000,000 output records per activation, but the cursor processes one matching key before completed output containers reach the fuel-accounted driver. A single hot key can therefore enumerate its whole value cross-product before the scheduling boundary is checked.

Join fuel can help an operator yield between units of work. It does not turn one logical key into several shards, and cross-worker work stealing does not relocate that key.

For FlowLog, the practical conclusion is straightforward: we should rely on DD to execute a good sharding plan efficiently, but not expect its scheduler to repair a bad shard after the graph has been built.

## What this means for FlowLog's design

FlowLog is deliberately declarative: users describe relations and rules rather than worker placement. That means the compiler owns the physical consequences of DD's sharding model.

A few design rules follow naturally:

1. A join or group key is also a state-placement key.
2. Sharding is per operator; a relation may be reshuffled several times through one flow.
3. Reusing an arrangement matters because it reuses both the index and its existing sharding.
4. More workers help when an operator exposes many reasonably balanced keys.
5. A dominant key stays dominant unless FlowLog chooses a physical strategy that explicitly divides or replicates its work.

The key question is not simply, "Did FlowLog split the input?" It is, "For every stateful operator, which logical key owns the state, and how much work sits behind each value of that key?"

That is the DD property FlowLog needs to stay aware of as its compiler evolves. Static key sharding is not just an implementation detail below the language. It is the physical model that turns a FlowLog rule into parallel, worker-local state.

## Further reading

- [Timely communication][timely-communication]
- [DD arrangements][dd-arrangements]
- [DD sharing arrangements][dd-sharing]
- [Shared Arrangements paper][shared-arrangements]

[flowlog-transform]: https://github.com/flowlog-rs/flowlog/blob/f29dc83be336/flowlog-build/src/codegen/flow/transformation.rs
[flowlog-input]: https://github.com/flowlog-rs/flowlog/blob/f29dc83be336/flowlog-compiler/src/io/input.rs
[flowlog-incremental]: https://github.com/flowlog-rs/flowlog/blob/f29dc83be336/flowlog-build/src/build/engine/incremental.rs
[timely-communication]: https://timelydataflow.github.io/timely-dataflow/chapter_5/chapter_5_1.html
[dd-arrangements]: https://timelydataflow.github.io/differential-dataflow/chapter_5/chapter_5.html
[dd-sharing]: https://timelydataflow.github.io/differential-dataflow/chapter_5/chapter_5_3.html
[shared-arrangements]: https://people.inf.ethz.ch/troscoe/pubs/msherry-vldb-2020.pdf
