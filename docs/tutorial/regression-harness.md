---
sidebar_position: 2
title: Testing
---

End-to-end tests live in `tests/e2e/`. Run the full suite with:

```bash
bash tests/e2e/run.sh
```

Or run specific tests by name:

```bash
bash tests/e2e/run.sh loop_fixpoint negation
```

Each test is a directory under `tests/e2e/<test_name>/` containing:
- `program.dl` — Datalog source (must use `.output` directives).
- `data/` — Optional CSV input facts copied into the test working directory.
- `expected/` — Expected output files (one per output relation).
- `commands.txt` — Optional incremental transcript (enables incremental mode).
