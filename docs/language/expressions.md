---
title: Expressions
description: Operators, strings, collections and function calls.
---

# Expressions

Sinth expressions are a safe subset of JavaScript with a few additions.

| Category | Operators |
|---|---|
| Arithmetic | `+ - * / % **` |
| Comparison | `== != < > <= >=` (always strict: `==` compiles to `===`) |
| Logic | `and`, `or`, `not` (also `&&`, `\|\|`, `!`) |
| Nullish | `??`, optional chaining `a?.b`, `a?.[0]`, `f?.()` |
| Conditional | `cond ? a : b` |
| Assignment | `= += -= *= /= %= **= ??= &&= \|\|=`, `x++`, `++x` |
| Other | `typeof`, `await`, `new Date()`, spread `...xs` |

Precedence follows mathematics and JavaScript: `2 + 3 * 4` is `14`, `(2 + 3) * 4` is `20`.

## Strings

```sinth
"double"  'single'
"escapes: \n \t é \u{1F600}"
f"Hello {name}, you have {items.length} items"
`template ${name} literal`
```

`f"..."` strings interpolate any expression in `{...}`. Escape literal braces as `\{` and `\}`.

## Collections

```sinth
[1, 2, 3]
{ name: "Ada", "data-id": 7, [key]: value, ...other }
{ name }                    -- shorthand for { name: name }
```

Objects and arrays may also be separated by newlines instead of commas.

## Calling functions

Everything from JavaScript's standard library is available: `Math.max(a, b)`, `JSON.stringify(x)`, `items.filter((t) => t.done)`, `Date.now()`, `fetch(url)`, `localStorage`, `Intl.NumberFormat`, and so on.

Arrow functions:

```sinth
(x) => x * 2
(a, b) => { return a + b }
async (url) => await fetch(url)
(num x) -> num { return x * 2 }     -- typed form
```

`range()` is built in:

```sinth
range(5)          -- [0, 1, 2, 3, 4]
range(1, 6)       -- [1, 2, 3, 4, 5]
range(10, 0, -2)  -- [10, 8, 6, 4, 2]
```

## Memoized calls

Prefix a call with `$` to cache its result for the same arguments:

```sinth
Paragraph { "fib(30) = " + $fib(30) }
```
