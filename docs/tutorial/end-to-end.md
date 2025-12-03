---
sidebar_position: 1
title: End-to-End Example
---

The `example/reach.dl` program computes nodes reachable from a seed set.

```datalog
.decl Source(id: number)
.input Source(IO="file", filename="Source.csv", delimiter=",")

.decl Arc(x: number, y: number)
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

.decl Reach(id: number)
.printsize Reach

Reach(y) :- Source(y).
Reach(y) :- Reach(x), Arc(x, y).
```

1. **Generate the executable**
   ```bash
   cargo run -p generator -- example/reach.dl -F reach -o reach_flowlog -D -
   ```
   - `-F reach` points the generator at the directory holding `Source.csv` and `Arc.csv`.
   - `-o reach_flowlog` names the generated Cargo project (written to `../reach_flowlog`).
   - `-D -` prints IDB tuples to stderr instead of writing CSVs.

2. **Prepare sample data**
   ```bash
   cd ../reach_flowlog
   mkdir -p reach
   cat <<'EOF' > reach/Source.csv
   1
   EOF

   cat <<'EOF' > reach/Arc.csv
   1,2
   2,3
   EOF
   ```

3. **Run the generated project**
   ```bash
   cargo run --release -- -w 4
   ```
   Adjust `-w` to control the number of Timely workers.
