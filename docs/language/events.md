---
title: Events
description: Event handlers and modifiers.
---

# Events

Any attribute named `on` + capital letter is an event handler: `onClick`, `onInput`, `onChange`, `onSubmit`, `onKeyDown`, `onMouseEnter`, `onScroll`, `onPointerDown`, and so on (`onDoubleClick` maps to `dblclick`).

A handler can be:

```sinth
Button(onClick: count += 1)                         -- a statement
Button(onClick: count += 1; message = "Clicked")    -- several, separated by ;
Button(onClick: reset)                              -- a function name
Button(onClick: addItem(draft))                     -- a call
Button(onClick: (e) => console.log(e.clientX))      -- an arrow function
Input(onInput: query = e.target.value)              -- `e` / `event` is the DOM event
Button(onClick: if open { open = false } else { open = true })
```

After every handler the UI updates automatically. If the handler returns a promise (an `async` function or `await`), the UI updates again when it settles.

## Modifiers

```sinth
Form(onSubmit.prevent: save())          -- preventDefault()
Button(onClick.stop: select(item))      -- stopPropagation()
Button(onClick.once: init())            -- runs once
Div(onClick.self: close())              -- only when the element itself is clicked
Div(onScroll.passive: track())          -- passive listener
Div(onClick.capture: log())             -- capture phase
Input(onKeyDown.enter: submit())        -- key filters: enter esc space tab up down left right delete
Input(onKeyDown.ctrl.enter: send())     -- system keys: ctrl shift alt meta
```

Modifiers can be combined: `onClick.prevent.stop`.
