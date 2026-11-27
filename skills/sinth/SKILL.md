---
name: sinth
description: Build, debug and deploy websites and web apps written in Sinth, the compiled, type-checked web language (.sinth files, npm package @yannosay/sinth). Use when a project has .sinth files or a sinth.config.json, when the user mentions Sinth, or asks for a new Sinth site, page, component, server function or deploy (Cloudflare Pages or Workers, Vercel, Netlify, GitHub Pages).
---

# Sinth

Sinth compiles `.sinth` files (markup, reactive state, functions and scoped styles in one file) to prerendered HTML plus a small runtime. Full docs: https://sinth.yannosay.com/docs. All docs as one file: https://sinth.yannosay.com/llms-full.txt.

## Workflow

1. **Find the project layout.** Pages live in `pages/` (or `app/pages/` when the project uses an `app/` folder, like Nuxt). Components usually live in `components/`. Run `npx sinth info` to see the source folder, page count and output folder.
2. **New project:** `npx @yannosay/sinth create my-site --yes`, then `cd my-site && npm install`.
3. **Edit, then check.** After every change run `npx sinth check --json`. Fix every error before you continue: each diagnostic has a `code`, `message`, `loc` (file, line, col) and usually a `hint` with the fix. Error codes: https://sinth.yannosay.com/docs/reference/errors.
4. **See it run:** `npx sinth dev` (hot reload on http://localhost:3000). Use `npx sinth build` and `npx sinth preview` for the production build.
5. **Deploy** only when the user asks: `npx sinth deploy`. The target comes from `"platform"` in `sinth.config.json`. Read [references/project-and-deploy.md](references/project-and-deploy.md) first.

Prefer `npx sinth new page <path>` and `npx sinth new component <Name>` for new files.

## A page

```sinth
import { Card } from "../components/Card.sinth"

title = "Todos"                          -- metadata, evaluated at build time

var str draft = ""                       -- reactive state
var obj[] todos = []
computed num left = todos.filter((t) => not t.done).length

function add() {
  if draft.trim() == "" return
  todos.push({ text: draft.trim(), done: false })   -- in-place changes update the UI
  draft = ""
}

Main {
  Heading(level: 1) { "Todos (" + left + " left)" }
  Form(onSubmit.prevent: add()) {
    Input(model: draft, placeholder: "What needs doing?")
    Button(type: "submit") { "Add" }
  }
  Ul {
    for todo, i in todos {
      Li(class: { done: todo.done }) {
        Checkbox(model: todo.done)
        Span { " " + todo.text }
        Button(ariaLabel: "Remove", onClick: todos.splice(i, 1)) { "×" }
      }
    } else {
      Li { "Nothing to do." }
    }
  }
}

style {
  main { fontFamily: "system-ui, sans-serif"; padding: "2rem" }
  .done span { textDecoration: "line-through"; opacity: 0.6 }
}
```

## Rules that trip people up

- `--` starts a comment. Write `x -= 1`, never `x--`.
- Logic is `and`, `or`, `not` (`&&`, `||`, `!` also work). `==` is strict.
- Elements are capitalized (`Main`, `Div`, `Heading(level: 2)`, `Paragraph`, `Link(href: ...)`, `Img`). Children go in `{ }`, attributes in `( )`.
- Several text children on one line need `+`: `Paragraph { "Hi " + name }`.
- Void elements (`Input`, `Checkbox`, `Radio`, `Img`, `Hr`) take no children. Put a label next to them: `Label { Checkbox(model: ok) " I agree" }`.
- Event handlers are code, not strings: `Button(onClick: count += 1)`, `onClick: save()`, `onKeyDown.enter: send()`.
- Two-way binding is `model:` (alias `bind:`). Numbers stay numbers when the variable is `num`.
- Variables need a type or an initial value: `var num n = 0`, `var str? name`, `var obj[] rows = []`.
- Style blocks use camelCase properties and quoted values: `padding: "1rem"`. Component styles are scoped; use `style global { }` to opt out.
- Text is always escaped. Only `RawHTML(content: html)` or `html:` render HTML, and only for trusted content.
- Metadata (`title = ...`) runs at build time, so it cannot use `fetch` or browser state (E0700).
- Browser globals that Sinth does not know need `extern Name`.

Deeper syntax (components, slots, stores, loops, conditionals, forms, imports, routing): [references/language.md](references/language.md).

## Before you finish

- `npx sinth check` passes with no errors.
- `npx sinth build` succeeds; mention any warnings to the user.
- Tell the user how to see the result (`npx sinth dev`), and that deploying is one command when they want it.
