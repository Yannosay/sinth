---
title: Conditionals
description: if, else and rendering options.
---

# Conditionals

```sinth
if loggedIn {
  Paragraph { "Welcome back, " + user.name }
} elif loading {
  Paragraph { "Loading..." }
} else {
  Button(onClick: login()) { "Log in" }
}
```

Parentheses around the condition are optional. `else if` and `elif` are equivalent. Only the active branch exists in the DOM.

Modifiers go between the condition and the block:

```sinth
if open persist { Settings }              -- keep the branch alive while hidden (state, scroll, focus)
if visible delay(300) { Toast }           -- remove it 300ms later (exit animations)
if visible transition("fade") { Toast }   -- adds fade-enter / fade-leave classes
```

With `transition("fade")`, the element gets `fade-enter` when it appears (removed on the next frame) and `fade-leave` before it is removed (after 200ms, or `delay`):

```sinth
style global {
  .fade-enter, .fade-leave { opacity: 0 }
  .toast { transition: "opacity 0.2s" }
}
```

Inline conditionals: `Paragraph { done ? "Done" : "Pending" }`.
