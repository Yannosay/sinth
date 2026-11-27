---
title: Functions
description: Typed functions, defaults, named arguments and UI functions.
---

# Functions

```sinth
function add(num a, num b) -> num {
  return a + b
}

function greet(str name, str greeting = "Hello") -> str {
  return greeting + ", " + name + "!"
}

async function loadUser(num id) -> obj {
  const res = await fetch("/api/users/" + id)
  return await res.json()
}
```

- Parameters may have types and defaults. Parameter syntax `name: type` also works.
- `-> type` declares the return type; returning the wrong type is an error.
- Calling with missing or too many arguments is a compile error (E0315 / E0314).
- Arguments can be named and given in any order: `greet(greeting: "Hi", name: "Ada")`.
- Function bodies support `var`, `const`, `if`/`elif`/`else`, `for ... in`, `while`, `try`/`catch`/`finally`, `throw`, `return`, `break`, `continue`, and single-line `if cond return x`.

## Errors

`try`, `catch` and `finally` work like in JavaScript. The caught error is only visible inside its `catch` block; `catch { ... }` without a name is allowed too.

```sinth live
var str status = "Not loaded"

async function load() {
  try {
    const res = await fetch("https://example.invalid/data.json")
    status = "Loaded " + res.status
  } catch (e) {
    status = "Failed: " + e.message
  } finally {
    console.log("request finished")
  }
}

function percent(num value) -> num {
  if value < 0 or value > 1 { throw new RangeError("value must be between 0 and 1") }
  return value * 100
}

Main {
  Button(onClick: load()) { "Load" }
  Paragraph { status + " · " + percent(0.5) + "%" }
}
```

Functions can change page state:

```sinth
function addTodo() {
  if draft.trim() == "" { return }
  todos.push({ text: draft.trim(), done: false })
  draft = ""
}
```

## UI functions

A function returning `ui` renders markup and can be called inside markup:

```sinth
function badge(str label, str tone = "info") -> ui {
  Span(class: "badge " + tone) { label }
}

Main {
  badge("New")
  badge("Sale", tone: "danger")
}
```
