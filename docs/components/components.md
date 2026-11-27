---
title: Components
description: Reusable components with parameters and local state.
---

# Components

```sinth
-- components/Card.sinth
component Card(str title, str? subtitle, str accent = "#7c3aed") {
  Article(class: "card") {
    Heading(level: 3) { title }
    if subtitle { Paragraph(class: "sub") { subtitle } }
    $slot
  }

  style {
    .card {
      borderLeft: "4px solid " + accent
      padding: "1rem"
    }
  }
}
```

```sinth
-- pages/index.sinth
import { Card } from "../components/Card.sinth"

Main {
  Card(title: "Hello", accent: "teal") {
    Paragraph { "Card body" }
  }
}
```

## Parameters

- `str title`: required. Leaving it out is a compile error (E0360).
- `str? subtitle`: optional, `undefined` when omitted.
- `str accent = "#7c3aed"`: optional with a default.
- Parameters are reactive: when the parent passes `title: user.name` and `user.name` changes, the card updates.
- Parameters are read-only inside the component (E0390). Copy them into a `var` if you need local state: `var num value = start`.

## Two-way parameters

Declare a parameter with `bind` to let the component write back to the caller's variable:

```sinth
component Toggle(bind checked, str label = "") {
  Label {
    Checkbox(model: checked)
    label
  }
}

var bool dark = false
Toggle(checked: dark, label: "Dark mode")
```

## Callback parameters

Pass functions down to let children notify parents:

```sinth
component TodoItem(obj todo, onRemove) {
  Li {
    Span { todo.text }
    Button(onClick: onRemove(todo)) { "Remove" }
  }
}

TodoItem(todo: t, onRemove: (x) => remove(x))
```

## Attribute fallthrough

Attributes that are not parameters (like `class`, `id`, `style`, `ariaLabel` or event handlers) are applied to the component's first root element:

```sinth
Card(title: "Hi", id: "intro", class: "wide", onClick: open = true)
```

## Local state, functions and scripts

Each instance has its own state:

```sinth
component Counter(num start = 0) {
  var num n = start

  function reset() {
    n = start
  }

  Button(onClick: n += 1) { "Clicked " + n }
  Button(onClick: reset()) { "Reset" }
}
```

## Recursion

Components can render themselves (for trees). Prerendering stops at 64 levels to protect against infinite recursion.

## Wrapping built-ins

A component may share a name with a built-in element. Inside its own body, the name refers to the HTML element, so you can wrap it:

```sinth
component Button(str variant = "primary") {
  Button(class: "btn btn-" + variant) { $slot }
}
```
