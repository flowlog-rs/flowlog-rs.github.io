---
sidebar_position: 1
title: Reachability Demo
---

The `example/graph_analysis/reach.dl` program computes nodes reachable from a seed set.

```flowlog
.decl Source(id: int32)
.input Source(IO="file", filename="Source.csv", delimiter=",")

.decl Arc(x: int32, y: int32)
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

.decl Reach(id: int32)
.printsize Reach

Reach(y) :- Source(y).
Reach(y) :- Reach(x), Arc(x, y).
```

1. **Prepare sample data**
   ```bash
   mkdir -p reach
   cat <<'EOF' > reach/Source.csv
   1
   EOF

   cat <<'EOF' > reach/Arc.csv
   1,2
   2,3
   EOF
   ```

2. **Compile into an executable**
   ```bash
   flowlog example/graph_analysis/reach.dl -F reach -o reach_bin -D -
   ```
   - `-F reach` points the compiler at the directory holding `Source.csv` and `Arc.csv`.
   - `-o reach_bin` names the output executable.
   - `-D -` prints IDB tuples and sizes to stderr instead of writing CSVs.

3. **Run the generated executable**
   ```bash
   ./reach_bin -w 4
   ```
   Adjust `-w` to control the number of Timely workers.
