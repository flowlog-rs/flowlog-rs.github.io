import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import Layout from '@theme/Layout';
import styles from './playground.module.css';
import doopProgram from '../doopProgram';

// ─── Example programs ───

const EXAMPLES = [
  {
    name: 'Reachability',
    program: `.decl Source(id: int32)
.input Source(IO="file", filename="Source.csv", delimiter=",")

.decl Arc(x: int32, y: int32)
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

.decl Reach(id: int32)
.output Reach

Reach(y) :- Source(y).
Reach(y) :- Reach(x), Arc(x, y).`,
    facts: [
      { name: 'Source.csv', csv: '1' },
      { name: 'Arc.csv', csv: '1,2\n2,3\n3,4\n4,5' },
    ],
  },
  {
    name: 'Transitive Closure',
    program: `.decl Arc(x: int32, y: int32)
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

.decl Tc(x: int32, y: int32)
.output Tc

Tc(x, y) :- Arc(x, y).
Tc(x, y) :- Tc(x, z), Arc(z, y).`,
    facts: [
      { name: 'Arc.csv', csv: '1,2\n2,3\n3,4' },
    ],
  },
  {
    name: 'Connected Components',
    program: `.decl Arc(node: int32, b: int32)
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

.decl CC(node: int32, cc: int32)
.output CC

CC(node, min(node)) :- Arc(node, _).
CC(node, min(cc)) :- Arc(other, node), CC(other, cc).`,
    facts: [
      { name: 'Arc.csv', csv: '1,2\n2,3\n4,5\n5,6\n7,8' },
    ],
  },
  {
    name: 'Shortest Paths (SSSP)',
    program: `.decl Arc(src: int32, dest: int32, weight: int32)
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

.decl Id(src: int32)
.input Id(IO="file", filename="Id.csv", delimiter=",")

.decl Sssp(x: int32, y: int32)
.output Sssp

Sssp(x, min(0)) :- Id(x).
Sssp(y, min(d1 + d2)) :- Sssp(x, d1), Arc(x, y, d2).`,
    facts: [
      { name: 'Id.csv', csv: '1' },
      { name: 'Arc.csv', csv: '1,2,3\n2,3,5\n1,3,10\n3,4,2\n2,4,7' },
    ],
  },
  {
    name: 'Same Generation',
    program: `.decl Arc(src: int32, dest: int32)
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

.decl Sg(src: int32, dest: int32)
.output Sg

Sg(x, y) :- Arc(a, x), Arc(a, y), x != y.
Sg(x, y) :- Arc(a, x), Sg(a, b), Arc(b, y).`,
    facts: [
      { name: 'Arc.csv', csv: '1,2\n1,3\n2,4\n2,5\n3,6' },
    ],
  },
  {
    name: 'K-Core Decomposition',
    program: `// 2-core: iteratively peel vertices whose degree drops below 2.
// Uses an explicit fixpoint block (extended mode, batch only).
.decl edge(x: int32, y: int32)
.input edge(IO="file", filename="edge.csv", delimiter=",")

.decl active_edge(x: int32, y: int32)
.decl degree(x: int32, y: int32)
.decl removed(x: int32)

active_edge(x, y) :- edge(x, y).

fixpoint {
    .iterative active_edge
    .iterative degree

    active_edge(x, y) :- edge(x, y), !removed(x), !removed(y).
    degree(x, count(y)) :- active_edge(x, y).
    removed(x) :- degree(x, d), d < 2.
}

.output active_edge
.output removed`,
    facts: [
      // Undirected (both directions): a 4-cycle 1-2-3-4 plus a pendant 4-5.
      // Vertex 5 peels off; the 2-core is the cycle.
      { name: 'edge.csv', csv: '1,2\n2,1\n2,3\n3,2\n3,4\n4,3\n4,1\n1,4\n4,5\n5,4' },
    ],
  },
  {
    name: 'Pointer Analysis (Andersen)',
    program: `.decl AddressOf(y: int32, x: int32)
.input AddressOf(IO="file", filename="AddressOf.csv", delimiter=",")

.decl Assign(y: int32, x: int32)
.input Assign(IO="file", filename="Assign.csv", delimiter=",")

.decl Load(y: int32, x: int32)
.input Load(IO="file", filename="Load.csv", delimiter=",")

.decl Store(y: int32, x: int32)
.input Store(IO="file", filename="Store.csv", delimiter=",")

.decl PointsTo(y: int32, x: int32)
.output PointsTo

PointsTo(y, x) :- AddressOf(y, x).
PointsTo(y, x) :- Assign(y, z), PointsTo(z, x).
PointsTo(y, w) :- Load(y, x), PointsTo(x, z), PointsTo(z, w).
PointsTo(z, w) :- Store(y, x), PointsTo(y, z), PointsTo(x, w).`,
    facts: [
      { name: 'AddressOf.csv', csv: '1,100\n2,200\n3,300' },
      { name: 'Assign.csv', csv: '4,1\n5,2' },
      { name: 'Load.csv', csv: '6,4' },
      { name: 'Store.csv', csv: '7,5' },
    ],
  },
  {
    name: 'Context-Sensitive Alias (CSPA)',
    program: `.decl Assign(x: int32, y: int32)
.input Assign(IO="file", filename="Assign.csv", delimiter=",")

.decl Dereference(x: int32, y: int32)
.input Dereference(IO="file", filename="Dereference.csv", delimiter=",")

.decl ValueFlow(x: int32, y: int32)
.output ValueFlow
.decl MemoryAlias(x: int32, y: int32)
.output MemoryAlias
.decl ValueAlias(x: int32, y: int32)
.output ValueAlias

ValueFlow(y, x) :- Assign(y, x).
ValueFlow(x, y) :- Assign(x, z), MemoryAlias(z, y).
ValueFlow(x, y) :- ValueFlow(x, z), ValueFlow(z, y).
MemoryAlias(x, w) :- Dereference(y, x), ValueAlias(y, z), Dereference(z, w).
ValueAlias(x, y) :- ValueFlow(z, x), ValueFlow(z, y).
ValueAlias(x, y) :- ValueFlow(z, x), MemoryAlias(z, w), ValueFlow(w, y).
ValueFlow(x, x) :- Assign(x, y).
ValueFlow(x, x) :- Assign(y, x).
MemoryAlias(x, x) :- Assign(y, x).
MemoryAlias(x, x) :- Assign(x, y).`,
    facts: [
      { name: 'Assign.csv', csv: '1,2\n2,3\n4,2' },
      { name: 'Dereference.csv', csv: '5,1\n6,4' },
    ],
  },
  // ─── Talk demo: Doop points-to analysis on Apache Tomcat ───
  // Server-side dataset (~389MB of Doop .facts, staged via `make dataset-tomcat`),
  // 32 threads. A real whole-program points-to analysis: string-typed join keys
  // are interned automatically (the server adds --str-intern). Watch the Time
  // and the per-relation .printsize output.
  {
    name: 'Doop (points-to, Tomcat)',
    dataset: 'tomcat',
    workers: 32,
    facts: [],
    program: doopProgram,
  },
];

const DEFAULT_SERVER = 'https://referred-shipments-waiting-focuses.trycloudflare.com';

// Resolve the backend base URL: `?server=<url>` query param wins (used by
// `make local` to point at a local backend, e.g. `?server=http://localhost:8088`),
// otherwise the hosted default server (the cloudflared tunnel). SSR has no
// `window`, so it falls back to the default.
function resolveServer() {
  if (typeof window === 'undefined') return DEFAULT_SERVER;
  try {
    return new URLSearchParams(window.location.search).get('server') || DEFAULT_SERVER;
  } catch {
    return DEFAULT_SERVER;
  }
}

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');

// Resolve an `?example=` value to an EXAMPLES index. Accepts a 0-based index,
// an exact name slug (e.g. `doop-points-to-tomcat`), or a substring/slug of the
// name (e.g. `doop`, `reachability`). Returns -1 if nothing matches.
function resolveExampleIndex(q) {
  if (q == null) return -1;
  const t = String(q).trim();
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return n >= 0 && n < EXAMPLES.length ? n : -1;
  }
  const qs = slugify(t);
  const exact = EXAMPLES.findIndex((ex) => slugify(ex.name) === qs);
  if (exact >= 0) return exact;
  return EXAMPLES.findIndex((ex) => slugify(ex.name).includes(qs));
}

// Parse `"569-574,600"` into 1-based [[start,end], ...] line ranges.
function parseRanges(s) {
  if (!s) return [];
  return String(s)
    .split(',')
    .map((part) => {
      const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return null;
      const a = parseInt(m[1], 10);
      const b = m[2] ? parseInt(m[2], 10) : a;
      return a <= b ? [a, b] : [b, a];
    })
    .filter(Boolean);
}

// Sentinel result-tab id for the self-contained profile report (vs. the
// per-relation output tabs, which are keyed by relation name).
const PROFILE_TAB = '__profile__';

// The profile report opens in its own browser window when the user clicks
// "Open report" (the embedded pane is too small for the interactive DAG).
// Reusing one window name focuses/replaces it.
const REPORT_WINDOW_NAME = 'flowlogProfileReport';
const REPORT_WINDOW_FEATURES = 'width=1200,height=820';

// Human-readable label for each batch progress phase reported by the server.
const PHASE_LABELS = {
  compiling: 'Compiling…',
  compiled: 'Compiled ✓',
  running: 'Running…',
  done: 'Collecting results…',
  profiling: 'Profiling…',
};

// ─── API client ───

// Runs a batch program and streams progress. The server responds with
// newline-delimited JSON; `onEvent` is called once per event:
//   { type: 'status', phase: 'compiling' | 'compiled' | 'running' | 'done' | 'profiling' }
//   { type: 'result', results: {...}, stats: {...} }
//   { type: 'report', html: '...' }           (only when profiling was requested)
//   { type: 'report_error', text: '...' }      (non-fatal profiling failure)
//   { type: 'error',  text: '...' }
async function apiBatchRun(server, { program, facts, workers, profile, dataset }, onEvent) {
  const factsObj = {};
  for (const f of facts) {
    if (f.name.trim()) {
      factsObj[f.name.trim()] = f.csv;
    }
  }

  const res = await fetch(`${server}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      program,
      facts: factsObj,
      options: { workers, profile, dataset },
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Server error: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushLine = (line) => {
    const trimmed = line.trim();
    if (trimmed) onEvent(JSON.parse(trimmed));
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      flushLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  flushLine(buffer);
}

// Deterministic row comparator: numeric per column when both cells parse as
// numbers, otherwise locale-aware string compare. Ties fall through to the
// next column, then to row length.
function compareRows(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? '';
    const bv = b[i] ?? '';
    const an = Number(av);
    const bn = Number(bv);
    const numA = av !== '' && Number.isFinite(an);
    const numB = bv !== '' && Number.isFinite(bn);
    if (numA && numB) {
      if (an !== bn) return an < bn ? -1 : 1;
    } else {
      const c = av.localeCompare(bv);
      if (c !== 0) return c;
    }
  }
  return a.length - b.length;
}

// Columns are tab-separated: FlowLog's `.output` files are tab-delimited and
// the incremental server joins row cells with a tab too. Tab is safe where a
// comma is not — Doop values like `int(java.lang.Object,java.lang.Object)`
// contain commas.
const COL_SEP = '\t';

// Cap the incremental terminal so it stays a fixed, scrollable height.
const MAX_TERMINAL_LINES = 500;

// Attach a per-row `status` derived from the latest commit's delta and
// merge in just-removed rows so they can be displayed (faded) at their
// sorted position. `delta` is `{ added: ["a\tb", ...], removed: [...] }`.
function enrichRows(rows, delta) {
  const addedSet = new Set((delta?.added) || []);
  const removedRaw = (delta?.removed) || [];
  const out = rows.map(row => ({
    row,
    status: addedSet.has(row.join(COL_SEP)) ? 'added' : 'kept',
  }));
  for (const s of removedRaw) {
    out.push({ row: s.split(COL_SEP), status: 'removed' });
  }
  out.sort((a, b) => compareRows(a.row, b.row));
  return out;
}

function createSession(server, workers, profile, dataset) {
  const params = new URLSearchParams({
    workers: String(workers),
    profile: String(!!profile),
  });
  if (dataset) params.set('dataset', dataset);

  const wsUrl = server.replace(/^http/, 'ws') + `/api/session?${params}`;
  const ws = new WebSocket(wsUrl);
  return ws;
}

// Parse a server `{ RelName: "csv", ... }` results object into the table form
// `{ RelName: rows[][] }` the UI renders.
function parseRelations(resultsObj) {
  const relations = {};
  for (const [name, csv] of Object.entries(resultsObj || {})) {
    relations[name] = csv
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => line.split(COL_SEP));
  }
  return relations;
}

// ─── Component ───

export default function Playground() {
  // Editor state
  // Start blank — the user types a program + data, or loads an example.
  const [program, setProgram] = useState('');
  const [facts, setFacts] = useState([]);
  // Name of the active server-side dataset (e.g. 'tomcat'), or null for inline
  // facts. Set by dataset-backed examples; non-null hides the inline facts editor.
  const [dataset, setDataset] = useState(null);
  // Read-only preview ({ files: [{name, rows, preview}], preview_rows }) of the
  // active dataset, fetched from the server.
  const [datasetPreview, setDatasetPreview] = useState(null);
  const [datasetPreviewError, setDatasetPreviewError] = useState(false);
  const [activeTab, setActiveTab] = useState('program'); // 'program' | 'facts'

  // Mode & config
  const [mode, setMode] = useState('batch'); // 'batch' | 'incremental'
  const [workers, setWorkers] = useState(4);
  const [profile, setProfile] = useState(false); // batch: also build a profile report
  const [server, setServer] = useState(resolveServer);

  // Execution state
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null); // { relations: { name: rows[][] }, stats }
  const [activeResult, setActiveResult] = useState(null);
  const [phase, setPhase] = useState(null); // batch progress: compiling | compiled | running | done | profiling

  // Profile report state (batch + profiling). `reportPending` is true between
  // a profiled result arriving and its report (or report error) landing.
  const [report, setReport] = useState(null);          // self-contained HTML string
  const [reportError, setReportError] = useState(null); // non-fatal profiling failure text
  const [reportPending, setReportPending] = useState(false);
  // Incremental: profiling snapshots only exist after a commit, so the report
  // auto-refreshes on each commit once the session has committed at least once.
  // A ref (not state) avoids a stale closure inside the ws.onmessage handler.
  const hasCommittedRef = useRef(false);

  // Incremental mode state
  const [sessionActive, setSessionActive] = useState(false);
  const [terminalLines, setTerminalLines] = useState([]);
  const [terminalInput, setTerminalInput] = useState('');
  const wsRef = useRef(null);
  const terminalOutputRef = useRef(null);
  const terminalInputRef = useRef(null);

  // Resizable layout: store the split as grow ratios (out of 100). The panels
  // each get `flex: <ratio> 0 0` so they share the available space minus the
  // 5px handle — no overflow, no rigid bases.
  const [leftRatio, setLeftRatio] = useState(50);
  const [topRatio, setTopRatio] = useState(60);
  const workspaceRef = useRef(null);
  const splitColumnRef = useRef(null);
  const gutterRef = useRef(null);
  const editorWrapRef = useRef(null);
  const editorMirrorRef = useRef(null);
  const editorRef = useRef(null);
  const highlightInnerRef = useRef(null);
  const selectionAnchorRef = useRef(null); // gutter shift-select anchor line
  // Highlighted program line ranges (1-based), e.g. [[569, 574]]. Set from a
  // ?highlight= param or an example's `highlight` config.
  const [highlight, setHighlight] = useState([]);
  // Per-line rendered heights (px), measured from a hidden mirror that wraps
  // exactly like the textarea. Lets the line-number gutter stay aligned even
  // when a long line soft-wraps onto several visual rows.
  const [lineHeights, setLineHeights] = useState([]);

  const startVerticalDrag = useCallback((e) => {
    if (!workspaceRef.current) return;
    e.preventDefault();
    const rect = workspaceRef.current.getBoundingClientRect();
    const onMove = (ev) => {
      const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
      if (clientX == null) return;
      const pct = ((clientX - rect.left) / rect.width) * 100;
      setLeftRatio(Math.max(20, Math.min(80, pct)));
    };
    const onEnd = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
  }, []);

  // Horizontal split lives inside a dedicated wrapper (`splitColumnRef`)
  // that excludes the action bar, so the cursor position maps directly to
  // the resultsArea/terminal boundary without an implicit offset.
  const startHorizontalDrag = useCallback((e) => {
    if (!splitColumnRef.current) return;
    e.preventDefault();
    const rect = splitColumnRef.current.getBoundingClientRect();
    const onMove = (ev) => {
      const clientY = ev.clientY ?? ev.touches?.[0]?.clientY;
      if (clientY == null) return;
      const pct = ((clientY - rect.top) / rect.height) * 100;
      setTopRatio(Math.max(20, Math.min(85, pct)));
    };
    const onEnd = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onEnd);
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalOutputRef.current) {
      terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
    }
  }, [terminalLines]);

  // Measure each program line's wrapped height (from the hidden mirror) so the
  // gutter line numbers line up with soft-wrapped lines. Re-runs on edits and
  // on width changes (panel drag / window resize) via a ResizeObserver.
  useLayoutEffect(() => {
    const mirror = editorMirrorRef.current;
    if (!mirror) return;
    const measure = () => {
      setLineHeights(Array.from(mirror.children).map(c => c.offsetHeight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (editorWrapRef.current) ro.observe(editorWrapRef.current);
    return () => ro.disconnect();
  }, [program, activeTab]);

  // Position the highlight bands from the gutter's real DOM line positions
  // (which are aligned with the wrapped text), so they can't drift from summed
  // heights. Keeps the gutter scroll in sync and optionally scrolls a range
  // into view (only when off-screen, so clicking a visible line doesn't jump).
  const positionHighlights = useCallback((scrollIntoView) => {
    const ed = editorRef.current;
    const g = gutterRef.current;
    if (!ed || !g || activeTab !== 'program') return;
    if (scrollIntoView && highlight.length) {
      const first = g.children[highlight[0][0] - 1];
      if (first) {
        const top = first.offsetTop;
        const bottom = top + first.offsetHeight;
        if (top < ed.scrollTop || bottom > ed.scrollTop + ed.clientHeight) {
          ed.scrollTop = Math.max(0, top - 60);
        }
      }
    }
    g.scrollTop = ed.scrollTop;
    const host = highlightInnerRef.current;
    if (!host) return;
    const st = g.scrollTop;
    highlight.forEach((range, i) => {
      const a = g.children[range[0] - 1];
      const b = g.children[range[1] - 1];
      const band = host.children[i];
      if (!a || !b || !band) return;
      band.style.top = `${a.offsetTop - st}px`;
      band.style.height = `${b.offsetTop + b.offsetHeight - a.offsetTop}px`;
    });
  }, [highlight, activeTab]);

  // Re-position whenever the highlight or measured line heights change.
  useEffect(() => {
    positionHighlights(true);
  }, [highlight, lineHeights, activeTab, positionHighlights]);

  // Write the current highlight to the URL (?highlight=) without reloading, so
  // a selection is shareable — GitHub-style line linking.
  const updateHighlightUrl = useCallback((range) => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (range) {
        const v = range[0] === range[1] ? `${range[0]}` : `${range[0]}-${range[1]}`;
        url.searchParams.set('highlight', v);
      } else {
        url.searchParams.delete('highlight');
      }
      window.history.replaceState(null, '', url);
    } catch {
      // ignore
    }
  }, []);

  // Click a gutter line number to select it; shift-click to extend a range;
  // click the sole selected line again to clear.
  const selectLine = useCallback((lineNum, shiftKey) => {
    const anchor = selectionAnchorRef.current;
    let range;
    if (shiftKey && anchor != null) {
      range = [Math.min(anchor, lineNum), Math.max(anchor, lineNum)];
    } else if (
      highlight.length === 1 && highlight[0][0] === lineNum && highlight[0][1] === lineNum
    ) {
      // Clicking the sole selected line again clears the selection.
      selectionAnchorRef.current = null;
      setHighlight([]);
      updateHighlightUrl(null);
      return;
    } else {
      range = [lineNum, lineNum];
      selectionAnchorRef.current = lineNum;
    }
    setHighlight([range]);
    updateHighlightUrl(range);
  }, [highlight, updateHighlightUrl]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Fetch the read-only preview of the active server-side dataset.
  useEffect(() => {
    setDatasetPreview(null);
    setDatasetPreviewError(false);
    if (!dataset) return;
    let cancelled = false;
    fetch(`${server}/api/dataset/${encodeURIComponent(dataset)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { if (!cancelled) setDatasetPreview(d); })
      .catch(() => { if (!cancelled) setDatasetPreviewError(true); });
    return () => { cancelled = true; };
  }, [dataset, server]);

  // ─── Profile report state ───

  // Clear all report state (the three atoms move as one unit).
  const resetReport = useCallback(() => {
    setReport(null);
    setReportError(null);
    setReportPending(false);
  }, []);

  // Apply a `report` / `report_error` message to the shared report state.
  // Returns true if it handled the message.
  const applyReportMessage = useCallback((m) => {
    if (m.type === 'report') {
      setReport(m.html || '');
      setReportError(null);
      setReportPending(false);
      return true;
    }
    if (m.type === 'report_error') {
      // Keep the user-facing text generic — the server's reason can include
      // internal paths or visualizer diagnostics.
      setReportError('Profile report could not be generated.');
      setReportPending(false);
      return true;
    }
    return false;
  }, []);

  // ─── Example loading ───

  const loadExample = useCallback((idx) => {
    const ex = EXAMPLES[idx];
    if (!ex) return;
    setProgram(ex.program);
    setFacts((ex.facts || []).map(f => ({ ...f })));
    setDataset(ex.dataset || null);
    setWorkers(ex.workers || 4);
    setActiveTab('program');
    setHighlight(parseRanges(ex.highlight));
    setResults(null);
    setActiveResult(null);
    setError(null);
    resetReport();
  }, [resetReport]);

  // Deep-link from URL query params, once on mount. Pre-loads the playground
  // into a ready-to-run state but never auto-runs. Supported params:
  //   ?example=<index|name|slug>   load a program (e.g. doop, reachability)
  //   ?mode=batch|incremental
  //   ?profile=true|false
  //   ?workers=<n>
  //   ?tab=program|facts
  //   ?server=<url>                (handled by resolveServer)
  // e.g. /playground?example=doop&mode=incremental&profile=true
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const idx = resolveExampleIndex(params.get('example') ?? params.get('program'));
    if (idx >= 0) loadExample(idx);

    const m = params.get('mode');
    if (m === 'batch' || m === 'incremental') setMode(m);

    const p = params.get('profile');
    if (p != null) setProfile(p === 'true' || p === '1');

    const w = parseInt(params.get('workers'), 10);
    if (!Number.isNaN(w)) setWorkers(Math.min(32, Math.max(1, w)));

    const tab = params.get('tab');
    if (tab === 'program' || tab === 'facts') setActiveTab(tab);

    const hl = params.get('highlight') ?? params.get('lines');
    if (hl != null) setHighlight(parseRanges(hl));
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Facts management ───

  const addFact = useCallback(() => {
    setFacts(prev => [...prev, { name: '', csv: '' }]);
  }, []);

  const removeFact = useCallback((idx) => {
    setFacts(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateFact = useCallback((idx, field, value) => {
    setFacts(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  }, []);

  // ─── Profile report actions ───

  // Make a Blob URL for the current report, hand it to `use`, and revoke it
  // shortly after (the consuming window/anchor keeps its own copy).
  const withReportUrl = useCallback((use) => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report], { type: 'text/html' }));
    use(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [report]);

  // Open the (already-received) report in its own browser window. Runs from a
  // click gesture, so the popup is allowed; the report HTML never leaves the
  // browser until the user asks for it here (or via Download).
  const openReport = useCallback(() => {
    withReportUrl(url => window.open(url, REPORT_WINDOW_NAME, REPORT_WINDOW_FEATURES));
  }, [withReportUrl]);

  const downloadReport = useCallback(() => {
    withReportUrl(url => {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'flowlog-profile-report.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }, [withReportUrl]);

  // ─── Batch execution ───

  const runBatch = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    setActiveResult(null);
    setPhase('compiling');
    // Reset the previous report; arm the pending state only for profiled runs.
    resetReport();
    setReportPending(profile);

    try {
      await apiBatchRun(
        server,
        { program, facts, workers, profile, dataset },
        (evt) => {
          if (evt.type === 'status') {
            // Live progress: compiling → compiled → running → done → profiling
            setPhase(evt.phase);
          } else if (evt.type === 'error') {
            setError(evt.text || 'Execution failed');
          } else if (evt.type === 'result') {
            // evt: { results: {...}, sizes: { rel: count }, stats: {...} }
            const relations = parseRelations(evt.results);
            setResults({ relations, sizes: evt.sizes || {}, stats: evt.stats || {}, deltas: {} });
            const names = Object.keys(relations);
            // Show a relation by default; the Profile tab is available for the
            // user to click (we don't steal focus to it).
            if (names.length > 0) {
              setActiveResult(names[0]);
            }
          } else {
            applyReportMessage(evt);
          }
        },
      );
    } catch {
      // Network / server-infra failures (the thrown text can be a raw proxy
      // body or status). Program errors arrive as streamed `error` events
      // above, so this catch is safe to keep generic.
      setError('Could not reach the server. Please try again.');
    } finally {
      setRunning(false);
      setPhase(null);
      setReportPending(false);
    }
  }, [server, program, facts, workers, profile, dataset, resetReport, applyReportMessage]);

  // ─── Incremental session ───

  const addTerminalLine = useCallback((type, text) => {
    // Keep only the most recent lines so the terminal stays a fixed, scrollable
    // length instead of growing without bound.
    setTerminalLines(prev => {
      const next = [...prev, { type, text }];
      return next.length > MAX_TERMINAL_LINES ? next.slice(-MAX_TERMINAL_LINES) : next;
    });
  }, []);

  const startSession = useCallback(() => {
    setError(null);
    setTerminalLines([]);
    setResults(null);
    setActiveResult(null);
    resetReport();
    hasCommittedRef.current = false;

    addTerminalLine('info', 'Connecting to server…');

    // Tracks whether this socket ever connected and whether we've already
    // surfaced a failure, so a single dropped connection doesn't spam the
    // terminal with a raw "WebSocket error." + "Session closed." pair.
    let opened = false;
    let failed = false;

    try {
      const ws = createSession(server, workers, profile, dataset);
      wsRef.current = ws;

      ws.onopen = () => {
        opened = true;
        setSessionActive(true);
        addTerminalLine('success', 'Session established.');
        addTerminalLine('info', 'Program loaded. Use begin/put/file/commit/abort commands.');
        addTerminalLine('muted', 'Type "help" for available commands.');
        if (profile) {
          addTerminalLine('muted', 'Profiling on — the report refreshes after each commit; open it from the Profile tab.');
        }

        // Send the program to initialize the session
        ws.send(JSON.stringify({ type: 'init', program, facts: (() => {
          const obj = {};
          for (const f of facts) {
            if (f.name.trim()) obj[f.name.trim()] = f.csv;
          }
          return obj;
        })() }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'output') {
            addTerminalLine('default', msg.text);
          } else if (msg.type === 'error') {
            addTerminalLine('error', msg.text);
          } else if (msg.type === 'result') {
            // Update results pane
            const relations = parseRelations(msg.results);
            setResults({ relations, sizes: msg.sizes || {}, stats: msg.stats || {}, deltas: msg.deltas || {} });
            const names = Object.keys(relations);
            if (names.length > 0) {
              // Keep the Profile tab focused if the user is viewing it.
              setActiveResult(prev =>
                (prev === PROFILE_TAB || (prev && names.includes(prev))) ? prev : names[0]
              );
            }
            {
              // Timing is FlowLog's own (shown in the engine log above + the
              // Time pill), so the summary line just states what happened.
              const st = msg.stats || {};
              const tup = `${st.tuples ?? 0} tuple(s)`;
              if (st.phase === 'preload') {
                addTerminalLine('success', `Preloaded — ${tup}.`);
              } else {
                addTerminalLine('success', `Committed at T=${st.timestamp ?? '?'} — ${tup}.`);
              }
            }
            // Auto-refresh the profile report after each commit (once profiling
            // is on and the session has committed). The report updates in the
            // background; the user opens it from the Profile tab when they want.
            if (profile && hasCommittedRef.current &&
                wsRef.current?.readyState === WebSocket.OPEN) {
              setReportError(null);
              setReportPending(true);
              wsRef.current.send(JSON.stringify({ type: 'profile' }));
            }
          } else if (msg.type === 'info') {
            addTerminalLine('info', msg.text);
          } else if (msg.type === 'report') {
            // Refreshed in the background — don't steal the user's tab focus.
            applyReportMessage(msg);
          } else if (msg.type === 'report_error') {
            applyReportMessage(msg);
            addTerminalLine('error', 'Could not generate the profile report.');
          }
        } catch {
          addTerminalLine('default', event.data);
        }
      };

      ws.onerror = () => {
        if (failed) return;
        failed = true;
        addTerminalLine('error', 'Could not connect to the server. Please try again.');
      };

      ws.onclose = () => {
        setSessionActive(false);
        wsRef.current = null;
        // Only narrate a clean end. A failed connection already reported its
        // own message; don't follow it with a redundant "closed" line.
        if (opened && !failed) {
          addTerminalLine('muted', 'Session ended.');
        }
      };
    } catch {
      addTerminalLine('error', 'Could not start the session. Please try again.');
    }
  }, [server, program, facts, workers, profile, addTerminalLine, resetReport, applyReportMessage]);

  const stopSession = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setSessionActive(false);
  }, []);

  const sendCommand = useCallback((cmd) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    addTerminalLine('prompt', `>> ${cmd}`);
    // Profiling snapshots are written on commit, so the report only auto-
    // refreshes once the session has committed at least once.
    const verb = cmd.trim().split(/\s+/)[0]?.toLowerCase();
    if (verb === 'commit' || verb === 'done') hasCommittedRef.current = true;
    wsRef.current.send(JSON.stringify({ type: 'command', command: cmd }));
  }, [addTerminalLine]);

  const handleTerminalKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && terminalInput.trim()) {
      sendCommand(terminalInput.trim());
      setTerminalInput('');
    }
  }, [terminalInput, sendCommand]);

  // ─── Render helpers ───

  // Profile tab body: error, a pending spinner, or a "report ready" panel. The
  // report itself renders full-size in its own browser window (the embedded
  // pane is too cramped for the interactive DAG).
  const renderProfileContent = () => {
    if (reportError) {
      return (
        <div className={styles.resultEmpty}>
          <div className={`${styles.resultEmptyIcon} ${styles.reportErrorIcon}`}>&#9888;</div>
          <div className={styles.resultEmptyText}>Profile report unavailable</div>
          <div className={styles.resultEmptyHint}>{reportError}</div>
        </div>
      );
    }
    if (!report) {
      return (
        <div className={styles.resultEmpty}>
          <div className={styles.resultEmptyIcon}><span className={styles.spinner} /></div>
          <div className={styles.resultEmptyText}>Generating profile report…</div>
          <div className={styles.resultEmptyHint}>
            Rendering the timely / differential profile into an interactive report
          </div>
        </div>
      );
    }
    return (
      <div className={styles.resultEmpty}>
        <div className={styles.resultEmptyIcon}><span className={styles.profileTabIcon}>&#9201;</span></div>
        <div className={styles.resultEmptyText}>Profile report ready</div>
        <div className={styles.resultEmptyHint}>
          Open the full interactive report in a new window, or download the self-contained HTML.
        </div>
        <div className={styles.profileOpenActions}>
          <button className={styles.profileOpenBtn} onClick={openReport}>
            &#8599; Open report
          </button>
          <button className={styles.profileActionBtn} onClick={downloadReport}>
            &#8595; Download
          </button>
        </div>
      </div>
    );
  };

  const renderResultsPane = () => {
    // A batch run error (compile / syntax / server) is really run output, so
    // show it here in the results pane — formatted, where results would
    // appear — rather than as a banner that covers the whole workspace.
    if (mode === 'batch' && error && !running) {
      return (
        <div className={styles.resultErrorPane}>
          <div className={styles.resultErrorBar}>
            <span className={styles.resultErrorBarIcon}>&#9888;</span>
            <span>Run failed</span>
            <button
              className={styles.resultErrorDismiss}
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
          <pre className={styles.resultErrorBody}>{error}</pre>
        </div>
      );
    }

    // Before results arrive, show the server-reported progress steps.
    if (running && mode === 'batch' && !results) {
      const steps = [
        { key: 'compiling', label: 'Compiling program' },
        { key: 'running', label: 'Running evaluation' },
        { key: 'done', label: 'Collecting results' },
        ...(profile ? [{ key: 'profiling', label: 'Building profile report' }] : []),
      ];
      // `compiled` advances past the compiling step so this pane agrees with
      // the Run button's "Compiled ✓" instead of still showing "Compiling".
      const stepOf = { compiling: 0, compiled: 1, running: 1, done: 2, profiling: 3 };
      const current = stepOf[phase] ?? 0;
      return (
        <div className={styles.resultEmpty}>
          <div className={styles.resultEmptyIcon}><span className={styles.spinner} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            {steps.map((s, i) => {
              const state = i < current ? 'done' : i === current ? 'active' : 'pending';
              return (
                <div
                  key={s.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    opacity: state === 'pending' ? 0.4 : 1,
                    fontWeight: state === 'active' ? 600 : 400,
                  }}
                >
                  <span>{state === 'done' ? '✓' : state === 'active' ? '▶' : '○'}</span>
                  <span>{s.label}{state === 'active' ? '…' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    const sizes = results?.sizes || {};
    const hasSizes = Object.keys(sizes).length > 0;
    const noRelations = !results || Object.keys(results.relations).length === 0;
    if (noRelations && !showProfileTab && !hasSizes) {
      // Incremental session is live but the initial snapshot hasn't arrived —
      // the engine is loading the dataset and computing the t=0 state.
      if (mode === 'incremental' && sessionActive) {
        return (
          <div className={styles.resultEmpty}>
            <div className={styles.resultEmptyIcon}><span className={styles.spinner} /></div>
            <div className={styles.resultEmptyText}>Preloading dataset…</div>
            <div className={styles.resultEmptyHint}>
              Loading the dataset and computing the initial state. For a large
              dataset (e.g. Tomcat) this can take a few minutes; then use
              begin / put / commit.
            </div>
          </div>
        );
      }
      return (
        <div className={styles.resultEmpty}>
          <div className={styles.resultEmptyIcon}>&#9655;</div>
          <div className={styles.resultEmptyText}>
            {mode === 'batch' ? 'Run a program to see results' : 'Commit a transaction to see results'}
          </div>
          <div className={styles.resultEmptyHint}>
            {mode === 'batch'
              ? 'Write your Datalog program, add input facts, and click Run'
              : 'Start a session, then use begin/put/commit commands'}
          </div>
        </div>
      );
    }

    // Table data — only computed for the relation view.
    const tableName = (!onProfileTab && currentName) ? currentName : null;
    const rows = tableName ? (results.relations[tableName] || []) : [];
    const delta = tableName ? (results.deltas?.[tableName] || null) : null;
    const enriched = tableName ? enrichRows(rows, delta) : [];
    const colCount = enriched[0]?.row.length ?? rows[0]?.length ?? 0;

    const rowClassFor = (status) => {
      if (status === 'added') return styles.rowAdded;
      if (status === 'removed') return styles.rowRemoved;
      return '';
    };

    return (
        <div className={styles.resultsContent}>
          {onProfileTab ? (
            renderProfileContent()
          ) : !tableName ? (
            hasSizes ? (
              <div className={styles.sizesPane}>
                <div className={styles.sizesTitle}>Relation sizes</div>
                <div className={styles.sizesGrid}>
                  {Object.entries(sizes).map(([rel, n]) => (
                    <div key={rel} className={styles.sizeItem}>
                      <span className={styles.sizeRel}>{rel}</span>
                      <span className={styles.sizeCount}>{Number(n).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.sizesHint}>
                  <code>.printsize</code> relations aren&apos;t materialized — only their cardinality
                  is shown. Compare the <strong>Time</strong> above across join orders.
                </div>
              </div>
            ) : (
              <div className={styles.resultEmpty}>
                <div className={styles.resultEmptyText}>No output relations</div>
              </div>
            )
          ) : enriched.length === 0 ? (
            <div className={styles.resultEmpty}>
              <div className={styles.resultEmptyText}>No tuples in {currentName}</div>
            </div>
          ) : (
            <>
              <table className={styles.resultTable}>
                <thead>
                  <tr>
                    {delta && <th className={styles.statusCol} aria-label="status" />}
                    {Array.from({ length: colCount }).map((_, ci) => (
                      <th key={ci}>col_{ci}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((entry, ri) => (
                    <tr key={ri} className={rowClassFor(entry.status)}>
                      {delta && (
                        <td className={styles.statusCol}>
                          {entry.status === 'added' ? '+' : entry.status === 'removed' ? '−' : ''}
                        </td>
                      )}
                      {entry.row.map((val, ci) => (
                        <td key={ci}>{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {(results.sizes?.[tableName] ?? 0) > rows.length && (
                <div className={styles.resultTruncated}>
                  Showing first {rows.length.toLocaleString()} of{' '}
                  {results.sizes[tableName].toLocaleString()} tuples — too large to display in full.
                </div>
              )}
            </>
          )}
        </div>
    );
  };

  const getTerminalLineClass = (type) => {
    switch (type) {
      case 'prompt': return styles.terminalPrompt;
      case 'error': return styles.terminalError;
      case 'success': return styles.terminalSuccess;
      case 'info': return styles.terminalInfo;
      case 'muted': return styles.terminalMuted;
      default: return '';
    }
  };

  // The server only allows the higher thread count for dataset-backed runs.
  const maxWorkers = dataset ? 32 : 8;

  // Nothing to run when the program editor is empty (whitespace-only). A
  // dataset alone can't be evaluated without a program, so both the batch
  // Run and the incremental Start Session button stay disabled until the
  // user types or loads a program.
  const canRun = program.trim().length > 0;

  // Shared result-view state — used both by the persistent result-tabs row
  // (rendered as the right panel's second header row) and by the content pane.
  const resultNames = results ? Object.keys(results.relations) : [];
  const showProfileTab = reportPending || report || reportError;
  const onProfileTab = showProfileTab && activeResult === PROFILE_TAB;
  const currentName =
    (activeResult && activeResult !== PROFILE_TAB && resultNames.includes(activeResult))
      ? activeResult
      : resultNames[0];

  // The result tabs (one per output relation, plus Profile) live in their own
  // header row so they align with the left editor toolbar. Empty before a run.
  const renderResultTabs = () => (
    <div className={styles.resultsTabs}>
      {resultNames.map(name => (
        <button
          key={name}
          className={`${styles.resultTab} ${(!onProfileTab && name === currentName) ? styles.resultTabActive : ''}`}
          onClick={() => setActiveResult(name)}
        >
          {name} ({(results.sizes?.[name] ?? results.relations[name].length).toLocaleString()})
        </button>
      ))}
      {showProfileTab && (
        <button
          key={PROFILE_TAB}
          className={`${styles.resultTab} ${styles.profileTab} ${onProfileTab ? styles.resultTabActive : ''}`}
          onClick={() => setActiveResult(PROFILE_TAB)}
          title="Self-contained profiling report"
        >
          <span className={styles.profileTabIcon}>&#9201;</span> Profile
          {reportPending && <span className={styles.profileTabSpinner} />}
        </button>
      )}
    </div>
  );

  return (
    <Layout
      title="Playground"
      description="Run FlowLog Datalog programs interactively"
    >
      <div className={styles.playgroundPage}>
        {/* ─── Header ─── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.title}>
              <span className={styles.titleBlue}>Flow</span>
              <span className={styles.titleBrown}>Log</span> Playground
            </h1>
            <span className={styles.modeBadge}>{mode}</span>
          </div>
          <div className={styles.headerRight}>
            <div className={styles.controlGroup}>
              <span className={styles.label}>Mode</span>
              <select
                className={styles.select}
                value={mode}
                onChange={e => {
                  setMode(e.target.value);
                  setResults(null);
                  setActiveResult(null);
                  setError(null);
                  resetReport();
                  // Datasets work in both modes now (the session stages them
                  // server-side and the engine preloads them), so keep it.
                  if (e.target.value === 'batch' && sessionActive) {
                    stopSession();
                  }
                }}
              >
                <option value="batch">Batch</option>
                <option value="incremental">Incremental</option>
              </select>
            </div>
            <div className={styles.controlGroup}>
              <span className={styles.label}>Workers</span>
              <input
                type="number"
                className={styles.numberInput}
                value={workers}
                min={1}
                max={maxWorkers}
                onChange={e => setWorkers(Math.min(maxWorkers, Math.max(1, parseInt(e.target.value) || 1)))}
              />
            </div>
            <div className={styles.controlGroup}>
              <span className={styles.label}>Profile</span>
              <button
                type="button"
                role="switch"
                aria-checked={profile}
                className={`${styles.toggle} ${profile ? styles.toggleOn : ''}`}
                onClick={() => setProfile(p => !p)}
                disabled={running || sessionActive}
                title={mode === 'batch'
                  ? 'Compile with -P and build an interactive profile report'
                  : 'Compile with -P; generate a per-commit profile report from the session'}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.serverGroup}>
              <span
                className={`${styles.statusDot} ${
                  sessionActive ? styles.statusConnected :
                  running ? styles.statusConnecting :
                  styles.statusDisconnected
                }`}
                title={sessionActive ? 'Connected' : running ? 'Connecting...' : 'Disconnected'}
              />
            </div>
          </div>
        </div>

        {/* ─── Workspace ─── */}
        <div className={styles.workspace} ref={workspaceRef}>
          {/* ─── Left: Editor + Facts ─── */}
          <div
            className={styles.leftPanel}
            style={{ flex: `${leftRatio} 0 0`, minWidth: 0 }}
          >
            <div className={styles.tabBar}>
              <button
                className={`${styles.tab} ${activeTab === 'program' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('program')}
              >
                Program
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'facts' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('facts')}
              >
                {dataset ? `Dataset: ${dataset}` : `Input Facts (${facts.length})`}
              </button>
            </div>

            {activeTab === 'program' ? (
              <div className={styles.editorPanel}>
                <div className={styles.editorToolbar}>
                  <select
                    className={styles.exampleSelect}
                    onChange={e => {
                      const idx = parseInt(e.target.value);
                      if (!isNaN(idx)) loadExample(idx);
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>Load example...</option>
                    {EXAMPLES.map((ex, i) => (
                      <option key={i} value={i}>{ex.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.editorWrap} ref={editorWrapRef}>
                  <div className={styles.gutter} ref={gutterRef} aria-hidden="true">
                    {(program.length ? program.split('\n') : ['']).map((_, i) => {
                      const ln = i + 1;
                      const sel = highlight.some(([s, e]) => ln >= s && ln <= e);
                      return (
                        <div
                          key={i}
                          className={`${styles.gutterLine} ${sel ? styles.gutterLineSelected : ''}`}
                          style={lineHeights[i] ? { height: lineHeights[i] } : undefined}
                          onMouseDown={(e) => { e.preventDefault(); selectLine(ln, e.shiftKey); }}
                          title="Click to select line · shift-click for a range"
                        >
                          {ln}
                        </div>
                      );
                    })}
                  </div>
                  {highlight.length > 0 && (
                    <div className={styles.editorHighlights} aria-hidden="true">
                      <div ref={highlightInnerRef} className={styles.editorHighlightsInner}>
                        {highlight.map((_, i) => (
                          <div key={i} className={styles.editorHighlightBand} />
                        ))}
                      </div>
                    </div>
                  )}
                  <textarea
                    className={styles.editor}
                    ref={editorRef}
                    value={program}
                    onChange={e => setProgram(e.target.value)}
                    onScroll={() => positionHighlights(false)}
                    placeholder="Type a Datalog program here, or pick an example above — then add input facts and Run."
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                  {/* Hidden mirror: wraps identically to the textarea so we can
                      measure each line's height for the gutter. */}
                  <div className={styles.editorMirror} ref={editorMirrorRef} aria-hidden="true">
                    {(program.length ? program.split('\n') : ['']).map((line, i) => (
                      <div key={i} className={styles.editorMirrorLine}>
                        {line === '' ? ' ' : line}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : dataset ? (
              <div className={styles.factsPanel}>
                <div className={styles.datasetNote}>
                  <span className={styles.datasetNoteIcon}>&#128230;</span>
                  <span className={styles.datasetNoteTitle}>
                    Server dataset <code>{dataset}</code> · read-only
                  </span>
                  <span className={styles.datasetNoteText}>
                    Fixed dataset hosted on the server ({workers} threads). Edit the{' '}
                    <strong>program</strong> — not the data — and Run to compare the Time.
                  </span>
                </div>
                <div className={styles.datasetFiles}>
                  {datasetPreview?.files ? datasetPreview.files.map(f => (
                    <div className={styles.datasetFile} key={f.name}>
                      <div className={styles.datasetFileHead}>
                        <span className={styles.datasetFileName}>{f.name}</span>
                        <span className={styles.datasetFileRows}>
                          {Number(f.rows).toLocaleString()} rows
                        </span>
                      </div>
                      <pre className={styles.datasetFilePreview}>
                        {f.preview}{f.rows > (datasetPreview.preview_rows ?? 8) ? '\n…' : ''}
                      </pre>
                    </div>
                  )) : datasetPreviewError ? (
                    <div className={styles.factsEmpty}>
                      Dataset preview unavailable — couldn&apos;t reach the server.
                      The dataset still loads on the server when you Run.
                    </div>
                  ) : (
                    <div className={styles.factsEmpty}>Loading dataset preview…</div>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.factsPanel}>
                <div className={styles.factsToolbar}>
                  <span className={styles.label}>
                    {facts.length} relation{facts.length !== 1 ? 's' : ''}
                  </span>
                  <button className={styles.addFactBtn} onClick={addFact}>
                    + Add Relation
                  </button>
                </div>
                {facts.length === 0 ? (
                  <div className={styles.factsEmpty}>
                    No input facts. Click "+ Add Relation" to begin.
                  </div>
                ) : (
                  <div className={styles.factsList}>
                    {facts.map((fact, idx) => (
                      <div className={styles.factEntry} key={idx}>
                        <div className={styles.factHeader}>
                          <input
                            className={styles.factNameInput}
                            value={fact.name}
                            onChange={e => updateFact(idx, 'name', e.target.value)}
                            placeholder="Relation.csv"
                          />
                          <button
                            className={styles.removeFactBtn}
                            onClick={() => removeFact(idx)}
                            title="Remove"
                          >
                            &times;
                          </button>
                        </div>
                        <textarea
                          className={styles.factCsv}
                          value={fact.csv}
                          onChange={e => updateFact(idx, 'csv', e.target.value)}
                          placeholder="CSV rows (one tuple per line)"
                          rows={6}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Draggable vertical splitter between Left and Right panels. */}
          <div
            className={styles.dragHandleV}
            onPointerDown={startVerticalDrag}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor / results panel"
          />

          {/* ─── Right: Results / Terminal ─── */}
          <div
            className={styles.rightPanel}
            style={{ flex: `${100 - leftRatio} 0 0`, minWidth: 0 }}
          >
            <div className={styles.actionBar}>
              {mode === 'batch' ? (
                <button
                  className={styles.runBtn}
                  onClick={runBatch}
                  disabled={running || !canRun}
                  title={!canRun ? 'Type or load a program first' : undefined}
                >
                  {running ? (
                    <><span className={styles.spinner} /> {PHASE_LABELS[phase] || 'Running…'}</>
                  ) : (
                    <><span className={styles.runBtnIcon}>&#9655;</span> Run</>
                  )}
                </button>
              ) : (
                sessionActive ? (
                  <>
                    <button className={styles.stopBtn} onClick={stopSession}>
                      Stop Session
                    </button>
                    {profile && (
                      <span className={styles.profilingChip}>
                        <span className={styles.profileTabIcon}>&#9201;</span>
                        {reportPending ? 'Profiling — refreshing…' : 'Profiling — auto-refreshes on commit'}
                      </span>
                    )}
                  </>
                ) : (
                  <button
                    className={styles.runBtn}
                    onClick={startSession}
                    disabled={!canRun}
                    title={!canRun ? 'Type or load a program first' : undefined}
                  >
                    <span className={styles.runBtnIcon}>&#9655;</span> Start Session
                  </button>
                )
              )}

              {results?.stats && (
                <div className={styles.actionStats}>
                  {results.stats.time_ms != null && (
                    <span className={`${styles.statPill} ${styles.statPillAccent}`}>
                      <span className={styles.statLabel}>Time</span>
                      <span className={styles.statValue}>{results.stats.time_ms}<span className={styles.statUnit}>ms</span></span>
                    </span>
                  )}
                  {results.stats.tuples != null && (
                    <span className={styles.statPill}>
                      <span className={styles.statLabel}>Tuples</span>
                      <span className={styles.statValue}>{results.stats.tuples}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Second header row: result tabs (aligns with the left editor
                toolbar). Empty until a run produces output relations. */}
            {renderResultTabs()}

            {mode === 'batch' ? (
              <div className={styles.resultsArea}>
                {renderResultsPane()}
              </div>
            ) : (
              <div className={styles.splitColumn} ref={splitColumnRef}>
                {/* Top: cumulative results table (with per-commit delta
                    highlights). Bottom: command terminal. The wrapper
                    excludes the action bar so the drag handle's position
                    matches the cursor 1:1. */}
                <div
                  className={styles.resultsArea}
                  style={{ flex: `${topRatio} 0 0`, minHeight: 0 }}
                >
                  {renderResultsPane()}
                </div>
                <div
                  className={styles.dragHandleH}
                  onPointerDown={startHorizontalDrag}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize results / terminal"
                />
                <div
                  className={styles.terminal}
                  style={{ flex: `${100 - topRatio} 0 0`, minHeight: 0 }}
                >
                  <div className={styles.terminalHeader}>Engine output</div>
                  <div className={styles.terminalOutput} ref={terminalOutputRef}>
                    {terminalLines.length === 0 ? (
                      <div className={styles.terminalPlaceholder}>
                        <p>
                          Click <strong>Start Session</strong> to connect, then use these commands:
                        </p>
                        <dl className={styles.commandList}>
                          <dt>begin</dt><dd>start a transaction</dd>
                          <dt>put R a,b +1</dt><dd>insert tuple (a, b) into R</dd>
                          <dt>put R a,b -1</dt><dd>delete tuple (a, b) from R</dd>
                          <dt>commit</dt><dd>commit the transaction and advance time</dd>
                          <dt>abort</dt><dd>rollback the current transaction</dd>
                          <dt>help</dt><dd>show all commands</dd>
                        </dl>
                      </div>
                    ) : (
                      terminalLines.map((line, i) => (
                        <div
                          key={i}
                          className={`${styles.terminalLine} ${getTerminalLineClass(line.type)}`}
                        >
                          {line.text}
                        </div>
                      ))
                    )}
                  </div>
                  {sessionActive && (
                    <div className={styles.terminalInputRow}>
                      <span className={styles.terminalInputPrompt}>&gt;&gt;</span>
                      <input
                        ref={terminalInputRef}
                        className={styles.terminalInput}
                        value={terminalInput}
                        onChange={e => setTerminalInput(e.target.value)}
                        onKeyDown={handleTerminalKeyDown}
                        placeholder="begin | put R a,b +1 | commit | abort | help"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
