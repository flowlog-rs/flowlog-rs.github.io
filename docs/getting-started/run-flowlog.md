---
sidebar_position: 3
title: Run FlowLog
---

FlowLog is a compiler for executing Datalog programs. The execution mode (batch, incremental etc.) is determined by the argument parameters of the FlowLog command.

## Input/Output

FlowLog supports file-based I/O so you can separate Datalog programs from their data. Input files correspond to the extensional database (**EDB**) while Output files correspond to the intensional database (**IDB**) in Datalog terminology.

### Input relations
A relation becomes an input relation when you add `.input` to its declaration:

```FlowLog
.decl my_relation(a:number, b:number)
.input my_relation
```

By default, FlowLog searches for input facts in the directory specified by `-F <fact-dir>`. If `-F` is not provided, it assumes the fact files are in the current directory. The default filename is `<relation_name>.csv`, so the example above expects `my_relation.csv` in either the current directory or `<fact-dir>`.

If you need precise control over the file location, specify a filename directly:

```FlowLog
.decl my_relation(a:number, b:number)
.input my_relation(filename="<path to input file>")
```

### Output relations

You can mark relations for output with `.output`:

```FlowLog
.decl result(a:number, b:number, c:number)
.output result
```

If no command-line flags or in-program directives override it, FlowLog writes output to the current directory. You can set a default output directory with `-D <output-dir>`, or write to standard output with `-D -`. With default naming, the example above is written to `result.csv` in the chosen output directory.

As with input, you can specify a custom output file:

```FlowLog
.decl result(a:number, b:number, c:number)
.output result(filename="<path to output file>")
```

### Delimiters, compression

Both input and output support a custom `delimiter` and can choose whether the data is compressed. For example:

```FlowLog
.decl result(a:number, b:number, c:number)
.output result(filename="<path to output file>", delimiter="|", compress=true)
```

This writes columns separated by `|` and compresses the output using gzip (TODO: unsupported feature). 

### Printing relation sizes
If you use `.printsize`, FlowLog prints the number of tuples of a relation to standard output instead of writing the relation to a file:
```FlowLog
.decl result(a:number, b:number, c:number)
.printsize
```
