---
sidebar_position: 1
title: Architecture
---

import StyledFlowLog from '../src/components/StyledFlowLog';

The mental model the rest of the develop docs lean on. Read once. Refer back when a deep-dive page mentions a name introduced here.

## Pipeline

A `.dl` program flows through five stages. After codegen the result is consumed by one of two crates: `flowlog-build` (library mode) or `flowlog-compiler` (binary mode).

<svg viewBox="0 0 1200 320" style={{width: '100%', maxWidth: '1100px', display: 'block', margin: '0 auto', fontFamily: 'DM Sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}} xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrhead" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0,0 L10,5 L0,10" fill="none" stroke="#7d8a96" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
    </marker>
    <marker id="arrhead-side" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M0,0 L10,5 L0,10" fill="none" stroke="#b88a17" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"/>
    </marker>
    <filter id="boxshadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.10"/>
    </filter>
  </defs>

  {/* ─── pipeline chain (y center = 165) ─── */}
  <g filter="url(#boxshadow)">
    <rect x="20"  y="140" width="100" height="50" rx="10" fill="#f5f7fa" stroke="#a3b1bd" strokeWidth="1.5"/>
    <rect x="148" y="140" width="135" height="50" rx="10" fill="#fff" stroke="#1e6ba3" strokeWidth="2"/>
    <rect x="311" y="140" width="135" height="50" rx="10" fill="#fff" stroke="#1e6ba3" strokeWidth="2"/>
    <rect x="474" y="140" width="135" height="50" rx="10" fill="#fff" stroke="#1e6ba3" strokeWidth="2"/>
    <rect x="637" y="140" width="135" height="50" rx="10" fill="#fff" stroke="#6a1b9a" strokeWidth="2"/>
    <rect x="800" y="140" width="135" height="50" rx="10" fill="#fff" stroke="#c75300" strokeWidth="2"/>
  </g>

  <text x="70"  y="171" textAnchor="middle" fontSize="16" fontWeight="700" fill="#37474f">.dl</text>
  <text x="215" y="171" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e6ba3">parser</text>
  <text x="378" y="171" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e6ba3">typechecker</text>
  <text x="541" y="171" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e6ba3">stratifier</text>
  <text x="704" y="171" textAnchor="middle" fontSize="16" fontWeight="700" fill="#6a1b9a">planner</text>
  <text x="867" y="171" textAnchor="middle" fontSize="16" fontWeight="700" fill="#c75300">codegen</text>

  {/* short connectors between stages */}
  <line x1="124" y1="165" x2="145" y2="165" stroke="#7d8a96" strokeWidth="2" markerEnd="url(#arrhead)"/>
  <line x1="287" y1="165" x2="308" y2="165" stroke="#7d8a96" strokeWidth="2" markerEnd="url(#arrhead)"/>
  <line x1="450" y1="165" x2="471" y2="165" stroke="#7d8a96" strokeWidth="2" markerEnd="url(#arrhead)"/>
  <line x1="613" y1="165" x2="634" y2="165" stroke="#7d8a96" strokeWidth="2" markerEnd="url(#arrhead)"/>
  <line x1="776" y1="165" x2="797" y2="165" stroke="#7d8a96" strokeWidth="2" markerEnd="url(#arrhead)"/>

  {/* ─── branch: codegen → flowlog-build (top) and flowlog-compiler (bottom) ─── */}
  {/* Single quadratic Bezier per branch. Each curve leaves codegen
       horizontally, sweeps over to the output box, and arrives perpendicular
       to its bottom/top edge. No straight segments, no S, no L-corner. */}
  <path d="M 935 165 Q 1080 165 1080 95"  fill="none" stroke="#7d8a96" strokeWidth="1.6" markerEnd="url(#arrhead)"/>
  <path d="M 935 165 Q 1080 165 1080 235" fill="none" stroke="#7d8a96" strokeWidth="1.6" markerEnd="url(#arrhead)"/>

  {/* ─── outputs ─── */}
  <g filter="url(#boxshadow)">
    <rect x="980" y="45"  width="200" height="50" rx="10" fill="#e0f2f1" stroke="#00897b" strokeWidth="2"/>
    <rect x="980" y="235" width="200" height="50" rx="10" fill="#fff3e0" stroke="#c75300" strokeWidth="2"/>
  </g>
  <text x="1080" y="76"  textAnchor="middle" fontSize="15" fontWeight="800" fill="#00695c">flowlog-build</text>
  <text x="1080" y="266" textAnchor="middle" fontSize="15" fontWeight="800" fill="#bf360c">flowlog-compiler</text>

  {/* ─── side modules ─── */}
  <g filter="url(#boxshadow)">
    <rect x="540" y="245" width="130" height="40" rx="8" fill="#fefce8" stroke="#ca8a04" strokeWidth="1.5"/>
    <rect x="680" y="245" width="130" height="40" rx="8" fill="#fefce8" stroke="#ca8a04" strokeWidth="1.5"/>
    <rect x="820" y="245" width="130" height="40" rx="8" fill="#fefce8" stroke="#ca8a04" strokeWidth="1.5"/>
  </g>
  <text x="605" y="271" textAnchor="middle" fontSize="14" fontWeight="700" fill="#713f12">catalog</text>
  <text x="745" y="271" textAnchor="middle" fontSize="14" fontWeight="700" fill="#713f12">optimizer</text>
  <text x="885" y="271" textAnchor="middle" fontSize="14" fontWeight="700" fill="#713f12">profiler</text>

  {/* dashed arrows from each side-module box up to its target stage */}
  <path d="M 605 245 C 620 220, 655 205, 670 190" fill="none" stroke="#b88a17" strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#arrhead-side)"/>
  <line x1="745" y1="245" x2="738" y2="190" stroke="#b88a17" strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#arrhead-side)"/>
  <line x1="885" y1="245" x2="867" y2="190" stroke="#b88a17" strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#arrhead-side)"/>
</svg>

The five stages, in execution order:

- **[parser](https://github.com/flowlog-rs/flowlog/tree/main/crates/flowlog-build/src/parser)** — A Pest PEG grammar lexes the `.dl` source into a typed AST.
- **[typechecker](https://github.com/flowlog-rs/flowlog/tree/main/crates/flowlog-build/src/typechecker)** — Rejects ill-typed programs and pins every polymorphic literal to its concrete width.
- **[stratifier](https://github.com/flowlog-rs/flowlog/tree/main/crates/flowlog-build/src/stratifier)** — Tarjan SCC over the relation dependency graph; each SCC becomes one stratum.
- **[planner](https://github.com/flowlog-rs/flowlog/tree/main/crates/flowlog-build/src/planner)** — Turns each rule into an ordered chain of dataflow operators (join, map, reduce…), then dedups across rules so the runtime can share intermediate results.
- **[codegen](https://github.com/flowlog-rs/flowlog/tree/main/crates/flowlog-build/src/codegen)** — Emits Rust code segments, consumed by one of the two output crates.

The three side modules feed specific stages:

- **[catalog](https://github.com/flowlog-rs/flowlog/tree/main/crates/flowlog-build/src/catalog)** — Per-rule precomputed metadata (atom signatures, filters, range-restriction checks). Built inside the planner.
- **[optimizer](https://github.com/flowlog-rs/flowlog/tree/main/crates/flowlog-build/src/optimizer)** — Will become a cardinality-based join optimizer; today it just imposes left-to-right join order.
- **[profiler](https://github.com/flowlog-rs/flowlog/tree/main/crates/flowlog-build/src/profiler)** — When `-P` is set: writes a static plan graph at build time, registers timely/DD loggers in the generated engine. Datalog modes only.

## Three crates

The workspace splits the pipeline across three crates with distinct jobs:

<div className="dev-cards dev-cards-3">
  <div className="dev-card accent-teal">
    <h3>flowlog-build</h3>
    <p>The compile pipeline as a library. Used from a user's <code>build.rs</code>.</p>
    <div className="meta">parser · typecheck · stratify · plan · codegen</div>
  </div>
  <div className="dev-card accent-orange">
    <h3>flowlog-compiler</h3>
    <p>The CLI binary. Calls <code>flowlog-build</code>, scaffolds a Cargo project around the emitted code, shells out to <code>cargo build --release</code>.</p>
    <div className="meta">binary-mode driver</div>
  </div>
  <div className="dev-card accent-brown">
    <h3>flowlog-runtime</h3>
    <p>Tiny crate the generated executable links against. Provides interning, IO sharding, sort/merge, and incremental-transaction state.</p>
    <div className="meta">intern · io · sort · txn</div>
  </div>
</div>

External users depend on `flowlog-build` (in `[build-dependencies]`) plus `flowlog-runtime` (in `[dependencies]`). `flowlog-compiler` is for end users who want a CLI workflow rather than a `build.rs` integration.

## Library mode and binary mode

Every stage up to codegen is shared. The two modes differ only in how they package the emitted code:

<div className="dev-cards dev-cards-2">
  <div className="dev-card accent-teal">
    <h3>library mode</h3>
    <p><code>flowlog-build::compile()</code> called from the user's <code>build.rs</code>. Emits a single <code>&lt;stem&gt;.rs</code> to <code>$OUT_DIR</code>; the user's crate <code>include!</code>s it and feeds tuples in directly.</p>
    <div className="meta">no I/O — host pushes tuples, drains results</div>
  </div>
  <div className="dev-card accent-orange">
    <h3>binary mode</h3>
    <p>The <code>flowlog-compiler</code> CLI. Scaffolds a whole Cargo project, runs <code>cargo build --release</code>, drops a standalone executable. The generated <code>main.rs</code> reads CSVs from disk.</p>
    <div className="meta">CSVs in, CSVs (or stderr) out</div>
  </div>
</div>

## Four execution modes

Two orthogonal axes — how recursion is expressed, and the difference type DD uses to track changes:

<div className="dev-axes">
  <div className="corner"></div>
  <div className="axis-label">batch — diff = Present</div>
  <div className="axis-label">incremental — diff = i32</div>

  <div className="axis-label">implicit recursion<br/>(SCC discovery)</div>
  <div>
    <div className="mode">datalog-batch</div>
    <div className="status-default">default</div>
  </div>
  <div>
    <div className="mode">datalog-inc</div>
    <div className="status-ok">supported</div>
  </div>

  <div className="axis-label">explicit recursion<br/>(loop / fixpoint blocks)</div>
  <div>
    <div className="mode">extend-batch</div>
    <div className="status-wip">WIP</div>
  </div>
  <div>
    <div className="mode">extend-inc</div>
    <div className="status-wip">WIP</div>
  </div>
</div>

In Datalog modes the stratifier discovers recursion implicitly via SCCs in the dependency graph. Extended modes require recursion to live inside `loop` / `fixpoint` blocks; an SCC in a plain rule is a hard error. `--profile` is supported only in the two Datalog modes.
