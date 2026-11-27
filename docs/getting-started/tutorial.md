---
title: Tutorial
description: Build a small todo app and learn the core of Sinth along the way.
---

# Tutorial: a todo app

This tutorial builds a todo list with filtering, persistence and a reusable component. It takes about fifteen minutes. Each step can be pasted into `pages/index.sinth` of a `minimal` project, or tried in the [playground](https://sinth.yannosay.com/playground).

```bash
npx @yannosay/sinth create todos --template minimal --yes
cd todos && npm install && npm run dev
```

## 1. State and markup

A page is a list of declarations followed by markup. `var` declares reactive state; markup is a tree of capitalized elements.

```sinth live
title = "Todos"

var str[] todos = ["Learn Sinth", "Build something"]

Main {
  Heading(level: 1) { "Todos" }
  Ul {
    for todo in todos {
      Li { todo }
    }
  }
}
```

Text children are expressions, so `todo` renders the current item. Text is always HTML-escaped.

## 2. Handling input

`model:` binds an input to a variable in both directions. Event handlers are written inline or call a function. Any change to state inside a handler updates the page.

```sinth live
title = "Todos"

var str draft = ""
var str[] todos = ["Learn Sinth"]

function add() {
  if draft.trim() == "" return
  todos.push(draft.trim())
  draft = ""
}

Main {
  Heading(level: 1) { "Todos" }
  Form(onSubmit.prevent: add()) {
    Input(model: draft, placeholder: "What needs doing?")
    Button(type: "submit") { "Add" }
  }
  Ul {
    for todo in todos {
      Li { todo }
    }
  }
}
```

`onSubmit.prevent` calls `preventDefault()` for you. `todos.push(...)` updates the list in place; there is no `setState`.

## 3. Objects, computed values and empty states

Todos need a `done` flag. `computed` declares a value derived from other state, and a loop's `else` block renders when the list is empty.

```sinth live
title = "Todos"

var str draft = ""
var obj[] todos = [{ text: "Learn Sinth", done: true }, { text: "Build something", done: false }]
computed num left = todos.filter((t) => not t.done).length

function add() {
  if draft.trim() == "" return
  todos.push({ text: draft.trim(), done: false })
  draft = ""
}

Main {
  Heading(level: 1) { "Todos (" + left + " left)" }
  Form(onSubmit.prevent: add()) {
    Input(model: draft, placeholder: "What needs doing?")
    Button(type: "submit") { "Add" }
  }
  Ul {
    for todo in todos {
      Li(class: { done: todo.done }) {
        Checkbox(model: todo.done)
        " " + todo.text
      }
    } else {
      Li { "Nothing to do." }
    }
  }
}

style {
  .done { textDecoration: "line-through"; opacity: 0.6 }
}
```

`class: { done: todo.done }` toggles a class. Styles use camelCase properties and quoted values.

## 4. Filters and persistence

`persist var` stores a variable in `localStorage`, so todos survive a reload. A loop can filter inline with `if`.

```sinth live
title = "Todos"

var str draft = ""
persist var obj[] todos = []
var str filter = "all"

function add() {
  if draft.trim() == "" return
  todos.push({ text: draft.trim(), done: false })
  draft = ""
}

function visible(obj todo) -> bool {
  if filter == "open" return not todo.done
  if filter == "done" return todo.done
  return true
}

Main {
  Heading(level: 1) { "Todos" }
  Form(onSubmit.prevent: add()) {
    Input(model: draft, placeholder: "What needs doing?")
    Button(type: "submit") { "Add" }
  }
  Nav {
    for f in ["all", "open", "done"] {
      Button(class: { active: filter == f }, onClick: filter = f) { f }
    }
  }
  Ul {
    for todo, i in todos if visible(todo) {
      Li {
        Checkbox(model: todo.done)
        " " + todo.text + " "
        Button(onClick: todos.splice(i, 1)) { "×" }
      }
    } else {
      Li { "Nothing here." }
    }
  }
}

style {
  .active { fontWeight: 700 }
}
```

## 5. A reusable component

Move the list item into a component with parameters. `bind` lets the component write back to the caller's variable, and callback parameters notify the parent.

```sinth
-- components/TodoItem.sinth
component TodoItem(obj todo, onRemove) {
  Li(class: { done: todo.done }) {
    Checkbox(model: todo.done)
    Span { " " + todo.text + " " }
    Button(ariaLabel: "Remove", onClick: onRemove()) { "×" }
  }

  style {
    .done { textDecoration: "line-through"; opacity: 0.6 }
  }
}
```

```sinth
-- pages/index.sinth
import { TodoItem } from "../components/TodoItem.sinth"

persist var obj[] todos = []

Main {
  Ul {
    for todo, i in todos {
      TodoItem(todo: todo, onRemove: () => todos.splice(i, 1))
    }
  }
}
```

Component styles are scoped: `.done` here does not affect other components.

## 6. Build and deploy

```bash
npm run check     # type-check everything
npm run build     # writes dist/
npm run deploy    # deploys to Cloudflare Pages (or Workers, Vercel, Netlify)
```

The build prerenders the page, so the list markup is already in the HTML, and ships a small bundle for the interactive parts.

## Where to go next

- [Pages and routing](pages-and-routing.md) for multi-page sites and dynamic routes
- [Components](../components/components.md) and [slots](../components/slots.md)
- [Server functions](../full-stack/functions.md) to add an API
- [The sinth:ui library](../components/sinth-ui.md) for ready-made components
