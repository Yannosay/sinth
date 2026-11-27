---
title: Variables and types
description: State, constants, computed values and types.
---

# Variables and types

```sinth
var str name = "Sinth"
var num count = 0
var bool open = false
var str[] tags = ["web", "ui"]
var num[] scores = [1, 2, 3]
var obj user = { name: "Ada", age: 36 }
var obj[] todos = [{ text: "Write docs", done: false }]
var str? nickname          -- nullable, starts as null
var any data = null
```

Types: `str`, `num`, `bool`, `obj`, `any`, plus `[]` for arrays and `?` for nullable. `int` still works but is deprecated (use `num`). `ui`, `void` and `fn` are used in function signatures.

The type can be omitted when there is an initial value:

```sinth
var count = 0          -- inferred as num
var name: str = "x"    -- colon syntax also works
```

Uninitialized variables get a default: `""` for `str`, `0` for `num`, `false` for `bool`, `[]` for arrays, `null` for everything else.

## Kinds of declarations

```sinth
var num count = 0                          -- reactive state
const str API = "https://api.example.com"  -- cannot be reassigned
computed num double = count * 2            -- recalculated from other values
persist var str theme = "dark"             -- saved in localStorage
```

- **`var`**: assigning to it updates every place in the UI that uses it. This works wherever the assignment happens in Sinth code: event handlers, functions, timers, promise callbacks and watchers. In-place changes such as `items.push(x)` or `user.name = "Ada"` count too.
- **`const`**: assigning to it is a compile error.
- **`computed`**: an expression that stays up to date. It cannot be assigned.
- **`persist var`**: survives reloads (stored in `localStorage` under `sinth:<file>:<name>`).

## Type checking

The compiler catches clear mistakes:

```sinth
var num count = "zero"        -- error E0403: cannot assign str to num
count = "1"                    -- error E0403
if count == "1" { ... }        -- error E0401: cannot compare num and str
count += "1"                   -- error E0400
```

Unknown names are errors with suggestions:

```
error[E0302]: Unknown name 'cuont'
  --> pages/index.sinth:12:20
> 12 |   Paragraph { "Count: " + cuont }
     |                           ^^^^^
  hint: Did you mean 'count'?
```

## Reserved words

JavaScript keywords (`class`, `new`, `default`, ...) and Sinth operators (`and`, `or`, `not`) cannot be used as names. Names starting with `$$` are reserved for the runtime.
