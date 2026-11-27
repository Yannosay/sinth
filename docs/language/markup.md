---
title: Markup
description: Elements, text and nesting.
---

# Markup

Markup is a tree of elements. An element is a capitalized name, optional attributes in parentheses and optional children in braces:

```sinth
Main {
  Heading(level: 1) { "Welcome" }
  Paragraph(class: "lead") { "Hello, " + name }
  Hr
  Img(src: "/logo.png", alt: "Logo")
}
```

Children can be:

- **Text**: any expression. Strings, numbers and variables are rendered as text. `null`, `undefined` and `false` render nothing; arrays render as `a, b, c`.
- **Elements and components.**
- **`if`, `for`, `$slot`, local `var` declarations.**
- **Statements** such as assignments (`count = 5`) and `console.log(...)`, which run once when that part of the page is created.

Text is always escaped. To render HTML, see `RawHTML` below.

Several text children on the same line must be joined with `+`:

```sinth
Paragraph { "Hello " + name }    -- good
Paragraph { "Hello " name }      -- error: use '+' to join values
Paragraph {
  "Hello "                        -- good: one child per line
  Strong { name }
}
```
