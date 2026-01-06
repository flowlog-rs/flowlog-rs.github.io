---
sidebar_position: 3
title: "Step 2: Run it"
---

import StyledFlowLog from '../../src/components/StyledFlowLog';

## Batch Mode 

In batch mode, the runtime loads all input facts from CSV files on disk, evaluates the program once, and then exits.

We continues from **Step 1** using reachability program `reachability.dl`.

```flowlog
.decl Source(id: number)
.input Source(IO="file", filename="Source.csv", delimiter=",")

.decl Arc(x: number, y: number)
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

.decl Reach(id: number)
.output Reach

Reach(y) :- Source(y).
Reach(y) :- Reach(x), Arc(x, y).
```

>- `Source` and `Arc` are input relations, so their facts are read from CSV files.
>- `Reach` is the result relation. With `.printsize`, FlowLog prints only the number of tuples in `Reach`.

### Prepare input files
Create the input CSV files (one tuple per line, comma-separated for `Arc`).
 
```csv
# Source.csv
1

# Arc.csv
1,2
2,3
```

With these inputs, we could imagine the runtime should derive `Reach = {1,2,3}` (node `3` becomes reachable by chaining `1→2→3`).

### Compile the program

We can compile this program by running

```bash
$ flowlog reachability.dl -o reachability -F . -D .
```
This generates a Rust crate at `reachability/`, note that no `reach.csv` has been produced, as the program has not yet been evaluated.

The `-F` and `-D` options specify the directories for input and output files respectively. So in this case, `Source.csv` and `Arc.csv` is in the generated rust crate working directory `.`, and `Reach.csv` will be produced here also.

If instead `Source.csv` and `Arc.csv` were in a subdirectory called `input`, and we wanted to have `Reach.csv` in a subdirectory called `output`, we could do

```bash
$ flowlog reachability.dl -o reachability -F ./input -D ./output
```

### Run the generated crate

To evaluate our program, we have to run the compiled rust crate

```bash
# Enter generated rust crate 
$ cd reachability
$ cargo run --release -- -w 4
```

This compiles the generated <StyledFlowLog /> workspace in release mode and executes it with four worker threads. Use fewer workers on laptops with limited cores or drop `--release` for faster rebuilds while editing.

## Incremental Mode

In **incremental mode**, input relations are updated at runtime through an interactive shell.
Updates are applied in **Transactions**: you `begin`, stage updates (`put` / `file`), then `commit` to publish them and advance logical time.

We continues from **Step 1** but using a slightly different reachability program `reachability.dl`.

```flowlog
.decl Source(id: number)
.input Source(IO="cmd", delimiter=",")

.decl Arc(x: number, y: number)
.input Arc(IO="cmd", delimiter=",")

.decl Reach(id: number)
.output Reach

Reach(y) :- Source(y).
Reach(y) :- Reach(x), Arc(x, y).
```

### Compile the program

We generate a Rust crate:

```bash
$ flowlog reachability.dl -o reachability -D . --mode incremental 
```

In incremental mode, inputs come from the interactive shell, so `-F` is not used. Outputs still go to disk, so `-D` still matters for `.output` relations.

### Run the generated crate

Start the interactive shell by running the generated crate:

```bash
# Enter generated rust crate
$ cd reachability
$ cargo run --release -- -w 4
```

You should see a prompt like:

```txt
... Dataflow assembled
FlowLog Incremental Interactive Shell, type 'help' for commands.
```

### Insert facts and commit

We start a transaction:

```txt
>> begin
(txn begin)
```

Insert a `Source` node:

```txt
>> put Source 1
(queued put)
```

Insert `Arc` edges (note the comma-separated tuple, matching `delimiter=","`):

```txt
>> put Arc 1,2
(queued put)
>> put Arc 2,3
(queued put)
```

You can also insert tuples using file interface if they are large,

```txt
>> file Arc Arc.csv 
```

We finally commit the transaction:

```txt
>> commit
[tuple][reach]  t=0  data=(1,)  diff=+1
[tuple][reach]  t=0  data=(2,)  diff=+1
[tuple][reach]  t=0  data=(3,)  diff=+1
1.074922ms:     Committed & executed
```

### Remove facts and observe updates

Incremental mode supports deletions by providing a negative multiplicity (`diff = -1`).
For example, remove the edge `2 -> 3`:

```txt
>> begin
(txn begin)
>> put Arc 2,3 -1
(queued put)
>> commit
[tuple][reach]  t=1  data=(3,)  diff=-1
723.148µs:      Committed & executed
```

After this commit, `3` is no longer reachable from `1` (for this example graph), so `Reach` is updated accordingly in the next output snapshot / size print.

The interactive shell offers additional commands (e.g., `help`, `abort`). We’ll cover the full command reference in the following section. There also have many other useful options available to <StyledFlowLog />, so be sure to explore them too!
