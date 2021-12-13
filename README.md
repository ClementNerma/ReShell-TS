# ReShell

ReShell, or `rsh`, is a modern shell aiming to provide a more flexible, simple-to-use yet powerful language for shell programming.

It is currently under heavy construction.

## Roadmap

| Phase                               | Status                   |
| ----------------------------------- | ------------------------ |
| Language design                     | :heavy_check_mark:       |
| Language parsing and AST generation | :heavy_check_mark: (80%) |
| Syntax checking                     | :heavy_check_mark: (80%) |
| Typechecking                        | _TODO_                   |
| Runtime engine                      | _TODO_                   |

## Comparison with other shells

ReShell was made because of the problems caused by *sh shells like Bash or ZSH. These shells are fine for launching commands and nothing more, but as soon as you start writing more complex programs you'll have to overcome some pretty big issues:

* No typing, even dynamic
* No block scoping
* No argument naming in functions
* No way to ensure arguments are provided to a function
* No way to return values (properly) from functions
* No nested arrays
* No nested dictionaries
* No closures
* No support for functions as values in general
* Almost no safety (variables checking, etc.) by default
* Complex syntax for more advance usage (e.g. replacements, joins, etc.)
* Because of all of these, no IDE autocompletion
* Less-than-intuitive documentation

And many other problems. All of this makes *sh scripting hard and error-prone.

There are a few alternative shells, like Xonsh or csh, but they are often more verbose and have their own problems to deal with.

There is only [NuShell](https://github.com/nushell/nushell), which is a very interesting one with a table-based approach, and some kind of basic typing, but it works in a different way than usual shells, and the typing part isn't very deep.

## What features does ReShell have?

* Simple and intuitive syntax
* Simple and intuitive static typing with runtime checks
* Block scoping
* Base syntax (running commands, chaining, ...) is the same as *sh shells
* IDE autocompletion
* Support for closures
* ...and many other things!

## License

This project is released under the [Apache-2.0](LICENSE.md) license terms.
