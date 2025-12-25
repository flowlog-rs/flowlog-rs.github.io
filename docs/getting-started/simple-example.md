---
sidebar_position: 2
title: A Simple Example
---

import StyledFlowLog from '../../src/components/StyledFlowLog';

## Batch Mode 

Say we have a Datalog file `example.dl`, whose contents are as shown.

```flowlog
.decl Source(id: number)
.input Source(IO="file", filename="Source.csv", delimiter=",")

.decl Arc(x: number, y: number)
.input Arc(IO="file", filename="Arc.csv", delimiter=",")

.decl Reach(id: number)
.printsize Reach

Reach(y) :- Source(y).
Reach(y) :- Reach(x), Arc(x, y).
```

We see that `Source` and `Arc` are `.input` relations, so their data will be read from disk. `Reach` plays the role of the output relation (add `.output Reach` if you want <StyledFlowLog /> to materialize `Reach.csv`).

The last two rules state that (1) every tuple in `Source` is also in `Reach`, and (2) if we already know a tuple `(x, z)` is in `Reach` and there is an `Arc` from `z` to `y`, then `(x, y)` must also be reachable. 

For instance, if the tab-separated input files are

```
Source|Arc
------|---
1     |1,2
      |2,3
```

then <StyledFlowLog /> derives the three tuples shown below. The extra `(1,3)` row appears because rule (2) chains the two edges together.

```
Reach
-----
1,2
2,3
1,3
```

We can compile this program by running

```bash
$ flowlog examples/example.dl -o example_flowlog -F . -D .
```
We get an `example_flowlog` rust crate, note that no `reach.csv` has been produced, as the program has not yet been evaluated.

The `-F` and `-D` options specify the directories for input and output files respectively. So in this case, `Source.csv` and `Arc.csv` is in the generated rust crate working directory `.`, and `Reach.csv` will be produced here also.

If instead `Source.csv` and `Arc.csv` were in a subdirectory called `input`, and we wanted to have `Reach.csv` in a subdirectory called `output`, we could do

```bash
$ flowlog examples/example.dl -o example_flowlog -F ./input -D ./output
```

To evaluate our program, we have to run the compiled rust crate

```bash
# Enter generated rust crate 
$ cd example_flowlog
$ cargo run --release -- -w 4
```

This compiles the generated <StyledFlowLog /> workspace in release mode and executes it with four worker threads. Use fewer workers on laptops with limited cores or drop `--release` for faster rebuilds while editing.

## Incremental Mode

Consider this program:

```flowlog
.decl bar(X0: number)
.input bar(IO="cmd")

.decl baz()
.input baz(IO="cmd")

.decl foo(X: number)
.output foo

foo(X0) :- bar(X0), baz().
```

`bar(X0)` is a normal (arity-1) input relation, while `baz()` is a **nullary** (arity-0) input relation — it behaves like a single boolean flag. The rule says: `foo(X0)` is produced exactly when `bar(X0)` is present and `baz()` is true.

After compiling with `--mode incremental`, run the generated crate:

```bash
$ cargo run --release -- -w 64
```

You’ll see something like:

```flowlog
... Dataflow assembled
FlowLog Incremental Interactive Shell, type 'help' for commands.
```

We first start a command

```flowlog
>> begin
(cmd begin)
```

This begins a command where updates are staged. We then insert `bar(1)`,

```text
>> put bar 1 +1
(queued put)
```

This stages an insertion of the tuple `bar(1)`. We turn `baz()` on (nullary = boolean)

```flowlog
>> put baz True
(queued put)
```

For **nullary relations**, <StyledFlowLog /> uses boolean tuples:

- `put baz True`  ⇒ insert/enable `baz()`
- `put baz False` ⇒ delete/disable `baz()`

We commit the command

```flowlog
>> commit
[tuple][foo]  t=0  data=(1,)  diff=+1
... Committed & executed
```

On `commit`, <StyledFlowLog /> will publishes staged updates, advances logical time (here `t=0`), incrementally updates derived results. Because `bar(1)` is present **and** `baz()` is true, the rule fires and we get `foo(1)` with `diff=+1` (it appears).

In the next step, we toggling the switch off, 

```flowlog
>> begin
(cmd begin)
>> put baz False
(queued put)
>> commit
[tuple][foo]  t=1  data=(1,)  diff=-1
... Committed & executed
```

At `t=1`, `baz()` becomes false, so the rule no longer holds and `foo(1)` is retracted (`diff=-1`).

There are many other useful options available to <StyledFlowLog />, so be sure to explore them too!
