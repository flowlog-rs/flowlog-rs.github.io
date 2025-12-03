---
sidebar_position: 2
title: Current Limitations
---

- Aggregations must appear as the final argument of an IDB head, and every rule deriving that relation must agree on the operator. The grammar accepts `average/AVG`, but support is not implemented.
- Input ingestion currently assumes comma-delimited UTF-8 files even if another delimiter is specified.
- Generated projects are placed one directory above the workspace (for example `../reach_flowlog`).
- `.printsize` output is limited to cardinalities; exporting actual tuples requires `.output` or `-D/--output-dir`.
