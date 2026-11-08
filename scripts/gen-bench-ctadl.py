#!/usr/bin/env python3
"""Regenerate the CTADL benchmark figure from ctadl-flowlog's measurements.

    python3 scripts/gen-bench-ctadl.py measurements.csv

The CSV is the one ctadl-flowlog's benchmark/report.py writes (as in its
benchmark/results/): one row per run of a workload's `ctadl index` or
`ctadl query`, with Soufflé or FlowLog. As report.py does, this takes the
medians of each engine's successful measured runs per workload and phase,
writes them to the DATA line of static/benchmarks/ctadl-speedup.html, and
prints the numbers that src/pages/benchmarks/ctadl.mdx and index.mdx quote.
"""
import csv
import json
import math
import re
import statistics
import sys
from pathlib import Path

HTML = Path(__file__).resolve().parent.parent / "static/benchmarks/ctadl-speedup.html"
SUITES = (("Synthetic", "taint-front"), ("P-code", "pcode"), ("JADX", "JADX"))
ENGINES = ("souffle", "flowlog")
PHASES = ("index", "query")
METRICS = ("wall_seconds", "engine_seconds", "process_peak_rss_mib")


def geomean(xs):
    return math.exp(sum(map(math.log, xs)) / len(xs))


def load(path):
    """{(workload, engine, phase, metric): median}, {workload: suite}."""
    runs, suite = {}, {}
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            suite[r["workload"]] = r["language"]
            if r["mode"] == "measure" and r["status"] == "ok":
                for m in METRICS:
                    runs.setdefault((r["workload"], r["backend"], r["phase"], m), []).append(float(r[m]))
    return {k: statistics.median(v) for k, v in runs.items()}, suite


def main(path):
    med, suite = load(path)
    done = [w for w in suite if all((w, e, p, m) in med for e in ENGINES for p in PHASES for m in METRICS)]
    missing = sorted(set(suite) - set(done))
    if missing:
        sys.exit(f"no complete medians for: {', '.join(missing)}")

    def ratio(ws, p, m):
        return geomean([med[w, "souffle", p, m] / med[w, "flowlog", p, m] for w in ws])

    def rss(w, e):
        return max(med[w, e, p, METRICS[2]] for p in PHASES)

    # one row per workload: per phase [S wall, F wall, S engine, F engine, S RSS, F RSS] (s, MiB)
    rows = []
    for i, (name, lang) in enumerate(SUITES):
        ws = sorted((w for w in done if suite[w] == lang), key=lambda w: med[w, "souffle", "index", METRICS[0]])
        rows += [[i, w] + [[round(med[w, e, p, m], 3 if m != METRICS[2] else 1) for m in METRICS for e in ENGINES]
                           for p in PHASES] for w in ws]
    total = {e: sum(med[w, e, p, METRICS[0]] for w in done for p in PHASES) for e in ENGINES}
    mem = [rss(w, "flowlog") / rss(w, "souffle") for w in done]
    walls = [med[w, "souffle", p, METRICS[0]] / med[w, "flowlog", p, METRICS[0]] for w in done for p in PHASES]
    cap = {
        "n": len(done),
        "wall": [round(ratio(done, p, METRICS[0]), 2) for p in PHASES],
        "engine": [round(ratio(done, p, METRICS[1]), 2) for p in PHASES],
        "total": [round(total[e]) for e in ENGINES],
        "faster": [sum(x > 1 for x in walls), len(walls)],
        "mem": [round(geomean(mem), 1), round(min(mem), 1), round(max(mem), 1),
                round(max(rss(w, "flowlog") for w in done) / 1024, 1)],
    }
    data = {"suites": [s for s, _ in SUITES], "cap": cap, "rows": rows}

    html, n = re.subn(r"^const DATA = .*;$",
                      lambda _: "const DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";",
                      HTML.read_text(), count=1, flags=re.M)
    assert n == 1, "DATA line not found"
    HTML.write_text(html)

    print(f"wrote {HTML.relative_to(HTML.parent.parent.parent)}: {len(done)} workloads")
    for name, lang in SUITES:
        ws = [w for w in done if suite[w] == lang]
        print(f"  {name:9} {len(ws):2}  wall x {ratio(ws, 'index', METRICS[0]):.2f} / {ratio(ws, 'query', METRICS[0]):.2f}"
              f"  engine x {ratio(ws, 'index', METRICS[1]):.2f} / {ratio(ws, 'query', METRICS[1]):.2f}"
              f"  total {sum(med[w, 'souffle', p, METRICS[0]] for w in ws for p in PHASES):,.0f}"
              f" / {sum(med[w, 'flowlog', p, METRICS[0]] for w in ws for p in PHASES):,.0f} s"
              f"  RSS F/S {geomean([rss(w, 'flowlog') / rss(w, 'souffle') for w in ws]):.1f}")
    print("ctadl.mdx stats:")
    print(f"  {total['souffle'] / total['flowlog']:.1f}× less total time ({total['souffle']:,.0f} s → {total['flowlog']:,.0f} s)")
    print(f"  {cap['faster'][0]} / {cap['faster'][1]} index and query runs faster (slowest {min(walls):.2f}×)")
    print(f"  peak memory {cap['mem'][0]}× Soufflé's (geomean; {cap['mem'][1]}–{cap['mem'][2]}×, at most {cap['mem'][3]} GiB)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__.strip().splitlines()[2].strip())
    main(sys.argv[1])
