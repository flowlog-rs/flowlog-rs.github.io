---
sidebar_position: 2
title: A Simple Example
---

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

We see that `Source` and `Arc` are `.input` relations, so their data will be read from disk. `Reach` plays the role of the output relation (add `.output Reach` if you want FlowLog to materialize `Reach.csv`).

The last two rules state that (1) every tuple in `Source` is also in `Reach`, and (2) if we already know a tuple `(x, z)` is in `Reach` and there is an `Arc` from `z` to `y`, then `(x, y)` must also be reachable. 

For instance, if the tab-separated input files are

```
Source|Arc
------|---
1     |1,2
      |2,3
```

then FlowLog derives the three tuples shown below. The extra `(1,3)` row appears because rule (2) chains the two edges together.

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

This compiles the generated FlowLog workspace in release mode and executes it with four worker threads. Use fewer workers on laptops with limited cores or drop `--release` for faster rebuilds while editing.

There are many other useful options available to FlowLog, so be sure to explore them too!
