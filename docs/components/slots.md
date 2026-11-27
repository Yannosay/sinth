---
title: Slots
description: Passing content into components.
---

# Slots

```sinth
component Panel(str title) {
  Section(class: "panel") {
    Header { $slot(name: "header") { Strong { title } } }
    $slot
    Footer { $slot(name: "footer", fallback: "No footer") }
  }
}

Panel(title: "Settings") {
  Paragraph { "Main content goes to $slot" }
  slot(name: "footer") {
    Button { "Save" }
  }
}
```

- `$slot` renders the default slot (all children that are not inside a `slot(...)` block).
- `$slot(name: "x")` renders a named slot.
- Fallback content is given in braces after `$slot` or with `fallback:`.
- Slot content uses the caller's variables and styles.
