---
sidebar_position: 4
title: "System Config"
---

import StyledFlowLog from '../../src/components/StyledFlowLog';

Recommended OS-level settings before running large <StyledFlowLog /> jobs.

## Linux

Raise the kernel's per-process VMA cap so multi-threaded sweeps don't abort early.

Runtime (resets on reboot):

```bash
sudo sysctl -w vm.max_map_count=1048576
```

Persistent across reboots:

```bash
echo 'vm.max_map_count = 1048576' | sudo tee /etc/sysctl.d/99-flowlog-mmap.conf
sudo sysctl -p /etc/sysctl.d/99-flowlog-mmap.conf
```

## macOS

_To be documented._

## Windows

_To be documented._
