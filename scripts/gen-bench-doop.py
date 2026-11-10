#!/usr/bin/env python3
"""Regenerate the DOOP benchmark figure from doop-flowlog's timing results.

    python3 scripts/gen-bench-doop.py time_<host>.tsv

The TSV is what doop-flowlog's verify/bench/time.sh writes: one row per
(dataset, family) with, per engine, the compile time (s) and RSS (MB), the
median run time (s) and peak RSS (MB), or FAIL/NA. Engines: fl = FlowLog,
sfnp = Soufflé without DOOP's hand-tuned .plan, sfpl = Soufflé with it.

Rewrites DATA and the numbers in CAP and MEMCAP of
static/benchmarks/doop-speedup.html, then prints the headline numbers that
src/pages/benchmarks/doop.mdx and index.mdx quote. Thread counts, the
platform line and the captions' wording are prose: edit those by hand.
"""
import csv
import json
import math
import re
import statistics
import sys
from pathlib import Path

HTML = Path(__file__).resolve().parent.parent / "static/benchmarks/doop-speedup.html"


def num(s):
    """A measurement as an int, or None for FAIL/NA."""
    try:
        return int(s)
    except ValueError:
        return None


def gb(mb):
    return None if mb is None else round(mb / 1024, 1)


def load(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t"))
    fams, ds, builds, cells = [], [], {}, []
    for r in rows:
        fam, d = r["family"], r["dataset"]
        if fam not in fams:
            fams.append(fam)
            builds[fam] = [num(r["fl_build_s"]), num(r["sfnp_build_s"]), num(r["sfpl_build_s"]),
                           gb(num(r["fl_build_rss"])), gb(num(r["sfnp_build_rss"]))]
        if d not in ds:
            ds.append(d)
        fl, sfnp, sfpl = num(r["fl_run_s"]), num(r["sfnp_run_s"]), num(r["sfpl_run_s"])
        rss = [gb(num(r[e + "_run_rss"])) if t is not None else None
               for e, t in (("fl", fl), ("sfnp", sfnp), ("sfpl", sfpl))]
        sf = sfnp or sfpl
        # NOT_RUN: a cell the sweep left out (see the figure's legend)
        status = ("skip" if r["verdict"] == "NOT_RUN" else "both" if fl and sf
                  else "flonly" if fl else "sfonly" if sf else "neither")
        cells.append([fam, d, status, fl, sfnp, sfpl, *rss])
    return rows, {"fams": fams, "ds": ds, "builds": builds, "cells": cells}


def ratios(rows, a, b, unit):
    """b ÷ a (run time) or a ÷ b (memory) over the cells where both finished."""
    out = []
    for r in rows:
        ta, tb = num(r[a + "_run_s"]), num(r[b + "_run_s"])
        if not (ta and tb):
            continue
        if unit == "s":
            out.append(tb / ta)
        else:
            ma, mb = num(r[a + "_run_rss"]), num(r[b + "_run_rss"])
            if ma and mb:
                out.append((ma / mb, mb))
    return out


def geomean(xs):
    return math.exp(sum(map(math.log, xs)) / len(xs))


def main(tsv):
    rows, data = load(tsv)
    html = HTML.read_text()

    html, n = re.subn(r"^const DATA = .*;$",
                      lambda _: "const DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";",
                      html, count=1, flags=re.M)
    assert n == 1, "DATA line not found"

    speed = {"tuned": ratios(rows, "fl", "sfpl", "s"), "untuned": ratios(rows, "fl", "sfnp", "s")}
    for mode, xs in speed.items():
        html, n = re.subn(rf'(^\s*{mode}:\s*\{{med:")[^"]*(", rng:")[^"]*(",\s*n:)\d+(,\s*faster:)\d+',
                          lambda m: f"{m[1]}{statistics.median(xs):.1f}×{m[2]}{min(xs):.1f}–{max(xs):.1f}×"
                                    f"{m[3]}{len(xs)}{m[4]}{sum(v > 1 for v in xs)}",
                          html, count=1, flags=re.M)
        assert n == 1, f"CAP.{mode} not found"

    mem = {"tuned": ratios(rows, "fl", "sfpl", "rss"), "untuned": ratios(rows, "fl", "sfnp", "rss")}
    for mode, xs in mem.items():
        html, n = re.subn(rf'(^\s*{mode}:\s*\{{med:")[^"]*(",\s*what:"[^"]*"[^\n]*)$',
                          lambda m: f"{m[1]}{statistics.median(v for v, _ in xs):.2f}×{m[2]}",
                          html, count=1, flags=re.M)
        assert n == 1, f"MEMCAP.{mode} not found"
    # the hand-tuned note quotes the median over the quarter with the largest Soufflé RSS
    heavy = sorted(mem["tuned"], key=lambda p: -p[1])[: len(mem["tuned"]) // 4]
    html = re.sub(r"median [0-9.]+× on the heaviest",
                  f"median {statistics.median(v for v, _ in heavy):.2f}× on the heaviest", html, count=1)

    HTML.write_text(html)

    tuned, untuned = speed["tuned"], speed["untuned"]
    print(f"wrote {HTML.relative_to(HTML.parent.parent.parent)}: "
          f"{len(data['fams'])} families × {len(data['ds'])} datasets, "
          + ", ".join(f"{s} {sum(c[2] == s for c in data['cells'])}"
                      for s in ("both", "flonly", "sfonly", "neither", "skip")))
    print("doop.mdx stats:")
    print(f"  up to {max(tuned):.1f}× faster than hand-tuned Soufflé")
    print(f"  {sum(v > 1 for v in tuned)} / {len(tuned)} faster than hand-tuned Soufflé"
          f" (slowest {min(tuned):.2f}×)")
    g = geomean([v for v, _ in mem["tuned"]])
    print(f"  peak memory vs hand-tuned Soufflé, geomean {g:.3f}×"
          f" ({abs(1 - g) * 100:.1f}% {'less' if g < 1 else 'more'})")
    print(f"index.mdx card: {len(data['fams'])} analyses · up to {max(untuned):.1f}× faster")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__.strip().splitlines()[2].strip())
    main(sys.argv[1])
