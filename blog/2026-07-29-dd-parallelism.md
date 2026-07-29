---
slug: differential-dataflow-parallelism
title: Where Differential Dataflow Gets Its Parallelism
authors: [nemo]
tags: [flowlog, differential-dataflow, timely-dataflow, performance]
description: A source-guided study of workers, exchange, scheduling, progress, arrangements, and the limits of key-partitioned parallelism.
---

Differential Dataflow (DD) often scales remarkably well. It is tempting to explain that result by imagining a sophisticated load balancer that watches the workers, finds idle cores, and continuously moves work to them.

That is not what happens.

DD's primary placement rule is much simpler.

:::info Core placement rule

`target_worker = hash(logical_key) % worker_count`

:::

This note records what we found by reading the implementation and then constructing FlowLog experiments around each observation. The goal is not just to report benchmark numbers, but to connect each number to the runtime mechanism that predicts it.

<!--truncate-->

## The conclusion first

DD is good at exploiting parallel work that the data already exposes. It does not manufacture parallelism when the logical work is concentrated in one key or one sequential dependency chain.

Five mechanisms make up the execution model:

- **Workers** provide parallel copies of the dataflow graph, but do not run several operators concurrently inside one worker.
- **Exchange** gives every key a deterministic owner, but does not route according to load or migrate hot keys.
- **Scheduling** cooperatively runs active operators, but does not preempt them or steal their work across workers.
- **Progress** proves when a logical time is complete, but cannot remove dependencies between times.
- **Arrangements** provide worker-local indexed state, but do not automatically split a hot partition.

## A two-join example

Consider two joins:

```flowlog
Middle(x, y) :- Left(x, a), Right(x, a, y).
Output(y, z) :- Middle(x, y), Other(y, z).
```

The first join uses `x`; the second uses `y`:

<div className="engineering-flow" aria-label="Left and Right are exchanged by x, joined by x, exchanged by y, and joined by y">
  <div className="engineering-flow__step"><span>Inputs</span><strong>Left + Right</strong></div>
  <div className="engineering-flow__arrow"><span>exchange by x</span></div>
  <div className="engineering-flow__step"><span>worker hash(x)</span><strong>Join on x</strong></div>
  <div className="engineering-flow__arrow"><span>exchange by y</span></div>
  <div className="engineering-flow__step"><span>worker hash(y)</span><strong>Join on y</strong></div>
  <div className="engineering-flow__arrow"><span>emit</span></div>
  <div className="engineering-flow__step"><span>Relation</span><strong>Output</strong></div>
</div>

Suppose `hash(x = 1)` selects worker 1. All records and join state for `x = 1` meet on worker 1.

The join produces a tuple containing `y = 7`. If `hash(y = 7)` selects worker 3, the dataflow sends that tuple from worker 1 to worker 3 before the second join.

That movement is data routing, not work stealing. Worker 3 receives the tuple because the graph explicitly repartitions by `y`, not because the scheduler observed that worker 1 was busy.

This example contains most of the execution model. The following findings take it apart one mechanism at a time.

## Finding 1: exchange balances keys, not their cost

### What the implementation does

A Timely worker is a single-threaded executor. Every worker builds a copy of the complete dataflow graph.

The logical graph has the structure `Input -> JoinX -> JoinY -> Reduce`. Every worker contains its own copy:

- worker 0 has `Input_0`, `JoinX_0`, `JoinY_0`, and `Reduce_0`;
- worker 1 has `Input_1`, `JoinX_1`, `JoinY_1`, and `Reduce_1`;
- worker 2 has `Input_2`, `JoinX_2`, `JoinY_2`, and `Reduce_2`.

At one instant, worker 0 might run `JoinX_0`, worker 1 might run `JoinX_1`, and worker 2 might run `JoinY_2`.

Within a worker, operators execute sequentially. Across workers, one operator activation per worker can execute concurrently. The main source of parallelism is therefore data parallelism: copies of the same logical operator process different partitions.

An exchange channel creates those partitions. Timely 0.31.0 uses `hash & (workers - 1)` when the worker count is a power of two, and `hash % workers` otherwise.

DD normally uses an FNV hash:

- `arrange_by_key` hashes the logical key;
- `arrange_by_self` hashes the complete datum;
- a join arranges both inputs by its join key;
- a group-by arranges records by its group key.

:::tip The property that makes local state possible

All records with the same logical key reach the same worker.

:::

Once both inputs are arranged by the same key, their join reads worker-local state. No further exchange is needed for that join.

### What this predicts

For worker `i`, load is approximately `sum(cost(key))` over the keys assigned to that worker.

Hashing distributes many ordinary keys statistically. It does not measure `cost(key)`.

For a many-to-many join, `cost(key) ~= left_values(key) * right_values(key)`.

We should therefore expect many distinct keys to scale well, but one dominant key to concentrate a stateful phase on one worker.

DD does not observe CPU load and reroute that key. It does not automatically split the key, migrate the arrangement, or add workers to an executing graph. Changing the worker count changes the owner of most keys and requires rebuilding the state.

### Experiment: uniform keys versus one hot key

We tested this semijoin:

```flowlog
Joined(v) :- Left(k, v), Right(k).
```

Both input distributions produced 4,000,000 output tuples.

| Input distribution         | 1 worker | 18 workers | Speedup |
| -------------------------- | -------: | ---------: | ------: |
| Four million distinct keys |   0.97 s |    0.095 s |   10.2x |
| One join key               |  0.605 s |     0.32 s |    1.9x |

For the distinct-key case, maximum worker active time divided by mean worker active time was:

| Operator    | Maximum / mean |
| ----------- | -------------: |
| Arrangement |           1.18 |
| Join        |           1.15 |

For the hot-key case:

| Operator    | Maximum / mean |
| ----------- | -------------: |
| Arrangement |          17.99 |
| Join        |          17.95 |

With 18 workers, the largest possible ratio is 18. The stateful hot-key phase ran almost entirely on one worker.

### What we learned

The measurement matches the placement rule. Every source worker contributed input, but exchange sent all records for the hot key to one target worker.

The hot-key program still gained some speed because parsing and a later whole-result deduplication were distributed. End-to-end wall time can therefore hide a severely imbalanced operator.

It is useful to say that DD balances hash buckets. It does not balance computational cost.

### The FlowLog consequence

FlowLog balances initial ingestion: file input is divided into byte ranges, and batch or incremental vectors are distributed among workers. Stateful operators then repartition records by their own keys:

- relation deduplication commonly arranges by the complete tuple;
- joins arrange by equijoin key;
- aggregates arrange by group key;
- downstream deduplication can redistribute join output again.

Balanced file parsing therefore does not imply a balanced join. The implementation is visible in FlowLog's [transformation generation][flowlog-transform], [file input][flowlog-input], and [incremental input staging][flowlog-incremental].

## Finding 2: cooperative scheduling cannot split a hot key

### What the implementation does

Data or progress events make an operator active. A worker follows this scheduling loop:

<div className="engineering-flow engineering-flow--compact" aria-label="Receive events, activate operators, choose one, run it until return, and schedule again">
  <div className="engineering-flow__step"><strong>Receive events</strong></div>
  <div className="engineering-flow__arrow"></div>
  <div className="engineering-flow__step"><strong>Activate</strong></div>
  <div className="engineering-flow__arrow"></div>
  <div className="engineering-flow__step"><strong>Choose one</strong></div>
  <div className="engineering-flow__arrow"></div>
  <div className="engineering-flow__step"><strong>Run until return</strong></div>
  <div className="engineering-flow__arrow"></div>
  <div className="engineering-flow__step"><strong>Schedule again</strong></div>
</div>

The exact scheduler uses activation paths and graph order. The important property is that it is cooperative: the scheduler regains control only when the current operator voluntarily returns.

In other words:

- an operator processes a bounded or natural unit of work and returns voluntarily;
- the local scheduler chooses another active operator only after that return;
- the runtime does not interrupt an operator after a CPU time slice;
- an idle worker does not take half of another worker's pending key.

There is no general runtime preemption inside an operator call and no cross-worker work stealing.

### The important join detail

DD 0.25.1 gives a join activation a budget of 2,000,000 output records. This helps a productive join return after emitting a substantial amount of output.

The budget does not divide one matching key. The cursor logic effectively:

1. finds one matching key;
2. loads both value histories;
3. enumerates the value cross-product for that key;
4. collects completed output containers;
5. returns the containers to the fuel-accounted driver.

:::warning The scheduling boundary is outside the hot key

One matching key can consume a long CPU interval before join fuel causes the operator to return.

:::

The driver observes completed containers after the key has been processed. One hot key can therefore monopolize its worker for the complete cross-product before reaching the scheduling boundary.

A residual predicate can make this worse. The operator may examine a large cross-product while producing little output, so output-based fuel does not represent the CPU work.

### What the hot-key experiment tells us

The near-18 maximum-to-mean ratio from Finding 1 is not repaired by the scheduler. Idle workers do not take part of `x = 1`, because the arrangement state and the cursor for `x = 1` belong to its owner.

The scheduler can improve responsiveness only when the operator returns. Until then:

- a long Rust function blocks other operators on that worker;
- a reduce can perform substantial work;
- a scan producing little output can run for a long time;
- independent branches on that worker are interleaved, not simultaneous.

Other workers continue executing their own local operators.

## Finding 3: progress enables concurrency, but not across a dependency

### What progress means

Progress does not mean percentage completed. It tracks which logical timestamps can still receive data.

Each record has a timestamp, such as transaction epoch 3 or 4.

A worker with an empty local queue cannot conclude that time 3 is complete. Another worker might still:

- hold a time-3 record;
- have a time-3 message in transit;
- hold permission to produce more time-3 records;
- create more time-3 work through a loop.

Timely tracks messages and capabilities. A capability is an operator's permission to produce data at a logical time.

:::info Reading a frontier

On an ordinary integer timeline, `frontier = 4` means that no more records at times before 4 can appear. Times 0 through 3 are complete; time 4 or later may still produce records.

:::

The frontier advances when no earlier messages remain in flight and no operator retains the capability to produce an earlier message.

All workers participate because any worker may hold a message or capability. They exchange changes to this distributed accounting. This is collective coordination, but it is not a global barrier after every operator.

### What this predicts for recursion

Progress lets DD prove that a recursive computation reached a fixed point. It cannot make a serial recurrence parallel.

A wide recursive frontier contains many independent records at one iteration. A chain exposes only one useful next record:

<div className="engineering-flow engineering-flow--compact" aria-label="Node 1 enables node 2, which enables node 3, which enables node 4">
  <div className="engineering-flow__step"><strong>Node 1</strong></div>
  <div className="engineering-flow__arrow"><span>enables</span></div>
  <div className="engineering-flow__step"><strong>Node 2</strong></div>
  <div className="engineering-flow__arrow"><span>enables</span></div>
  <div className="engineering-flow__step"><strong>Node 3</strong></div>
  <div className="engineering-flow__arrow"><span>enables</span></div>
  <div className="engineering-flow__step"><strong>Node 4</strong></div>
</div>

Extra workers should help the wide frontier and hurt the chain by adding exchange, activation, and progress work without adding useful computation.

### Experiment: wide tree versus narrow chain

| Workload                       | 1 worker | 18 workers |          Result |
| ------------------------------ | -------: | ---------: | --------------: |
| Wide tree with 4 million edges |   0.86 s |     0.09 s |     9.6x faster |
| Narrow chain                   |   0.61 s |     4.25 s | About 7x slower |

The tree exposed a broad frontier. The chain exposed one useful record per iteration.

Timely's default `Demand` progress mode delays updates until they can help advance the global frontier. `Eager` publishes each update immediately. If optional progress-message buffering caused the chain result, changing this mode should affect it.

It did not:

| Workers | Demand |  Eager |
| ------: | -----: | -----: |
|       1 | 0.58 s | 0.59 s |
|       8 | 1.88 s | 1.90 s |
|      18 | 4.36 s | 4.40 s |

The serial dependency, not optional progress accumulation, was the limiting mechanism.

### A separate correctness observation

The chain input contained 100,000 edges, but FlowLog produced exactly 65,536 reachable nodes.

FlowLog uses `type Iter = u16` in [`time.rs`][flowlog-time]. Timely uses checked addition for timestamp summaries, so feedback stops when the next inner timestamp would overflow.

The performance measurement therefore covers 65,535 feedback steps, not a complete 100,000-edge chain. This is a separate FlowLog recursion-depth limit, discovered because the performance result forced us to inspect the output as well as the timing.

## Finding 4: arrangements reward batches but create uneven maintenance

### What an arrangement is

An arrangement is a worker-local indexed trace. Exchange assigns each key to a worker; that worker stores the key's immutable, sorted update batches.

This gives stateful operators three useful properties:

1. all state for a key is local;
2. updates can be compared with indexed history;
3. several consumers can share one arrangement.

Sharing avoids repeating exchange, sorting, indexing, and merge work for the same relation and key.

DD maintains arrangement batches in a fueled spine. Level `i` contains batches with scale approximately `2^i`.

Similar-sized batches merge incrementally. New updates provide merge fuel, so index maintenance is amortized rather than a complete rebuild after every transaction.

DD also distinguishes:

- logical compaction, which permits older timestamps to become indistinguishable and consolidate;
- physical compaction, which permits old batches to merge or disappear once no reader needs their old boundaries.

An old capability or retained trace handle can hold back compaction. Deferred join work can also delay physical compaction and make later batches scan more trace batches.

### What this predicts

Large update batches should amortize exchange, sorting, and scheduling. Repeated small epochs should pay more fixed cost and flush more partial containers.

Timely exchange targets containers of approximately 8 KiB. With `B` records and `P` workers, a global exchange can activate `P * P` source-to-target lanes, leaving an expected `B / (P * P)` records per lane.

Large batches fill those containers. Small batches leave more of them partial. A new timestamp also flushes current builders.

The fueled spine also predicts uneven latency: most updates are inexpensive, but occasionally a larger merge level becomes active.

### Experiment: one large commit versus many smaller commits

The hot-key semijoin received the same total of 4,000,000 updates:

| Commit shape                    | 1 worker | 18 workers |
| ------------------------------- | -------: | ---------: |
| One commit of 4 million updates |   1.10 s |     0.48 s |
| 400 commits of 10,000 updates   |   2.18 s |     1.35 s |

Splitting the input roughly doubled one-worker time and nearly tripled 18-worker time.

Forty commits of 100,000 updates also showed periodic latency spikes:

| Epoch | Worker-local dataflow active time |
| ----: | --------------------------------: |
|     9 |                           68.8 ms |
|    17 |                          110.7 ms |
|    33 |                          111.1 ms |

Most other commits were approximately 23 to 31 ms. The near-power-of-two pattern is consistent with the fueled-spine structure. The larger costs appeared in threshold and join processing, not only in the first arrangement operator.

### What we learned

The incremental data structure makes total maintenance efficient, but it does not promise uniform latency for every epoch. Transaction shape affects both communication efficiency and when arrangement work becomes visible.

A script-like interface that submits one small update and waits after every statement gives up much of DD's batching and temporal concurrency.

## Finding 5: a commit is one completed logical step

### What FlowLog does

In normal incremental use, the caller groups all changes belonging to one logical step into a transaction. FlowLog processes that transaction synchronously:

<div className="engineering-flow engineering-flow--compact" aria-label="Publish, coordinate workers, apply and flush updates, wait for the frontier, write output, coordinate again, and return">
  <div className="engineering-flow__step"><strong>Publish</strong></div>
  <div className="engineering-flow__arrow"></div>
  <div className="engineering-flow__step"><strong>Coordinate</strong></div>
  <div className="engineering-flow__arrow"></div>
  <div className="engineering-flow__step"><strong>Apply + flush</strong></div>
  <div className="engineering-flow__arrow"></div>
  <div className="engineering-flow__step"><strong>Wait for frontier</strong></div>
  <div className="engineering-flow__arrow"></div>
  <div className="engineering-flow__step"><strong>Write output</strong></div>
  <div className="engineering-flow__arrow"></div>
  <div className="engineering-flow__step"><strong>Return</strong></div>
</div>

Waiting for the frontier is part of the semantics: it proves that the step is complete and that its output can be observed safely. If the next step depends on that output, the synchronization is necessary.

The cost of one step has two parts: work caused by changed data, plus the fixed work of advancing logical time and proving completion.

### Experiment: measuring the latency floor

One thousand empty commits remove the changed-data work and isolate the fixed completion cost:

| Workers |                        Total wall time |
| ------: | -------------------------------------: |
|       1 |                                 0.01 s |
|       8 |                                 0.14 s |
|      12 |                                 0.22 s |
|      16 |                                 0.27 s |
|      18 | 1.23 s median; 0.34 to 6.79 s observed |

This is not a representative useful incremental workload, and it is not evidence against synchronous commits. It measures the latency floor paid by each logical step.

The 18-worker discontinuity was host-specific and variable, but it illustrates two general effects:

1. synchronous completion runs at the pace of the slowest scheduled worker;
2. using every physical core can leave little scheduling headroom.

### How to read this result

- Put all changes for one logical step into one transaction, so they share one completion wait.
- When step `N + 1` depends on the result of step `N`, waiting is semantically required.
- When intermediate results are not observed, combining changes into a larger logical step amortizes the fixed cost.
- A truly empty transaction could be fast-pathed if advancing its epoch has no observable meaning.
- More workers help only when the step contains enough independent work to pay for exchange and coordination.

The best worker count therefore depends on the amount and shape of work inside each logical step, not just on the machine's core count.

## The resulting mental model

:::info DD's parallelism bargain

- Partition state deterministically by key.
- Keep each partition local and incremental.
- Pipeline batches through worker-local operator copies.
- Coordinate logical completion with progress frontiers.

:::

This works extremely well when the data exposes many balanced keys. It does not automatically repair a hot key, a long operator activation, a narrow dependency chain, or a workload divided into more synchronization steps than its semantics require.

For FlowLog, the important questions are:

1. Are expensive keys distributed reasonably across workers?
2. Does each commit contain all changes belonging to one logical step?
3. Does recursion expose a broad frontier?
4. Is the worker count appropriate for the work inside each step?

The experiments were run on an Apple M5 Max with 18 physical cores using FlowLog commit `f29dc83be336`, `differential-dataflow` 0.25.1, and Timely 0.31.0.

## Further reading

- [Timely communication][timely-communication]
- [Timely progress tracking][timely-progress]
- [DD arrangements][dd-arrangements]
- [DD sharing arrangements][dd-sharing]
- [DD advancing time][dd-advancing-time]
- [DD performing work][dd-performing-work]
- [Shared Arrangements paper][shared-arrangements]

[flowlog-transform]: https://github.com/flowlog-rs/flowlog/blob/f29dc83be336/flowlog-build/src/codegen/flow/transformation.rs
[flowlog-input]: https://github.com/flowlog-rs/flowlog/blob/f29dc83be336/flowlog-compiler/src/io/input.rs
[flowlog-incremental]: https://github.com/flowlog-rs/flowlog/blob/f29dc83be336/flowlog-build/src/build/engine/incremental.rs
[flowlog-time]: https://github.com/flowlog-rs/flowlog/blob/f29dc83be336/flowlog-build/src/codegen/ty/time.rs
[timely-communication]: https://timelydataflow.github.io/timely-dataflow/chapter_5/chapter_5_1.html
[timely-progress]: https://timelydataflow.github.io/timely-dataflow/chapter_5/chapter_5_2.html
[dd-arrangements]: https://timelydataflow.github.io/differential-dataflow/chapter_5/chapter_5.html
[dd-sharing]: https://timelydataflow.github.io/differential-dataflow/chapter_5/chapter_5_3.html
[dd-advancing-time]: https://timelydataflow.github.io/differential-dataflow/chapter_3/chapter_3_4.html
[dd-performing-work]: https://timelydataflow.github.io/differential-dataflow/chapter_3/chapter_3_5.html
[shared-arrangements]: https://people.inf.ethz.ch/troscoe/pubs/msherry-vldb-2020.pdf
