---
sidebar_position: 4
title: "System Config"
---

import StyledFlowLog from '../../src/components/StyledFlowLog';

Most users can run <StyledFlowLog /> with no system tuning. The one exception is large, long-running jobs on Linux — multi-threaded sweeps on big-RAM machines can hit a kernel bookkeeping cap well before physical memory is exhausted. This page documents the one knob you may need to raise before launching a sweep.

## Linux: kernel VMA limit

<StyledFlowLog />'s compiled binaries use [mimalloc](https://github.com/microsoft/mimalloc) as the global allocator. Under heavy parallelism (e.g. 64-thread join-order variant sweeps), mimalloc allocates many per-thread segments via `mmap(MAP_ANONYMOUS, ...)`, and each segment costs one entry against the kernel's per-process **VMA cap** — `vm.max_map_count`, default `65530` on most distros.

When the cap is hit, `mmap` returns `ENOMEM` even though physical RAM is available. mimalloc has no fallback, so Rust's default OOM handler aborts the process. The symptom is a job dying with significant RAM headroom — for example, ~150 GB RSS on a 250 GB machine. This is a kernel bookkeeping cap, not a real OOM.

The same operational issue is documented by Elasticsearch, ClickHouse, Kafka, and RocksDB. **macOS and Windows are unaffected** — the cap is Linux-specific, and no action is required on those platforms.

### Fix

Raise the cap. Runtime (resets on reboot):

```bash
sudo sysctl -w vm.max_map_count=1048576
```

Persistent across reboots:

```bash
echo 'vm.max_map_count = 1048576' | sudo tee /etc/sysctl.d/99-flowlog-mmap.conf
sudo sysctl -p /etc/sysctl.d/99-flowlog-mmap.conf
```

### How to tell if you've hit this

You're likely hitting the VMA cap if **all** of the following are true:

- The job aborts with `memory allocation of N bytes failed`, followed by `Command terminated by signal 6` (SIGABRT).
- `htop` or `ps` shows RSS well below total RAM at the moment of failure.
- `cat /proc/<pid>/maps | wc -l` is at or near `65530` just before the abort.

Once `vm.max_map_count` is raised, the same workload should run to completion without further changes.
