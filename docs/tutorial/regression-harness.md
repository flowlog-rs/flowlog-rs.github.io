---
sidebar_position: 2
title: Regression Harness
---

`tools/check/check.sh` automates dataset downloads, code generation, execution, and verification.

```bash
bash tools/check/check.sh
```

- Programs and datasets are listed in `tools/check/config.txt`.
- Datasets are cached under `facts/` and cleaned between runs.
- Logs and parsed relation sizes are written to `result/logs/` and `result/parsed/`.
- Temporary Cargo projects live one directory above the workspace (e.g., `../flowlog_reach_livejournal`).
