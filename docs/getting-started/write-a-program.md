---
sidebar_position: 2
title: "Step 1: Write a program"
---

import StyledFlowLog from '../../src/components/StyledFlowLog';

<p>
  <StyledFlowLog /> programs are plain-text Datalog files. A program typically has:
</p>

- Schemas: declare relations with `.decl`
- Inputs (EDB): load facts with `.input`
- Outputs (IDB): export results with `.output` or `.printsize`
- Logic: rules derive new facts

> Execution mode (batch, incremental) is chosen later at runtime via parameter `--mode`. In this step, we focus only on writing the program.

## Example: reachability

This example computes graph reachability from a set of source nodes.

```flowlog
// --- Declarations ---

.decl Source(id: number)
.decl Arc(x: number, y: number)
.decl Reach(id: number)

// --- Inputs (EDB) ---

.input Source(IO="file", filename="Source.csv", delimiter=",")
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

// --- Outputs (IDB) ---

.printsize Reach
// Alternatively, write tuples to a file:
// .output Reach

// --- Rules ---

// Base rule: all sources are reachable.
Reach(y) :- Source(y).

// Recursive rule: if x is reachable and there is an edge x -> y, then y is reachable.
Reach(y) :- Reach(x), Arc(x, y).
```

### Declarations

Use `.decl` to define the schema of each relation: its name and attribute types.

```flowlog
.decl Arc(x: number, y: number)
```

Here `Arc` is a binary relation with two `number` attributes, `x` and `y`.

### Input relations

A relation becomes an input relation when you add an `.input` directive:

```flowlog
.input Arc(IO="file", filename="Arc.csv", delimiter=",")
```

In **batch** mode, the runtime loads input facts from the specified CSV file (here, `Arc.csv`) using the given delimiter.

> **CSV format:** one tuple per line, attributes separated by the delimiter.  
> Example `Source.csv`:  
> ```csv
1
```
> Example `Arc.csv`:  
> ```csv
1,2
2,3
```

In **incremental** mode, input relations are updated through an interactive shell instead of loading from `filename=...`. The `delimiter` parameter is still used to parse tuple text you enter in the shell. We'll cover the interactive shell commands and workflow in the next step.

### Output relations

To observe results, you can either write tuples to a file with `.output`
```flowlog
.output Reach
```

or print only the relation size with `.printsize`

```flowlog
.printsize Reach
```

In **incremental** mode, outputs are emitted as the computation advances, so <StyledFlowLog /> appends a timestamp suffix to the output filename to avoid overwriting previous snapshots (for example, `Reach_<timestamp>.csv`).

### Rules
Rules derive new facts. They have the form:

```flowlog
Head :- Body1, Body2, ...
```

This program contains a base rule：

```flowlog
Reach(y) :- Source(y).
```
and a recursive rule:
```flowlog
Reach(y) :- Reach(x), Arc(x, y).
```
Together, they compute the transitive closure of the graph starting from `Source`.

