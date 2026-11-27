---
name: sinth
description: Build, debug and deploy websites and web apps written in Sinth, the compiled, type-checked web language (.sinth files, npm package @yannosay/sinth). Use when a project has .sinth files or a sinth.config.json, when the user mentions Sinth, or asks for a new Sinth site, page, component, form, dashboard, server function, redirect, environment variable or deploy (Cloudflare Pages or Workers, Vercel, Netlify, GitHub Pages).
---

# Sinth

Sinth compiles `.sinth` files (markup, reactive state, functions and scoped styles in one file) to prerendered HTML and a small runtime. The compiler type-checks the whole project, so most mistakes surface in `sinth check` before anything runs.

Docs: https://sinth.yannosay.com/docs · All docs in one file: https://sinth.yannosay.com/llms-full.txt

## Workflow

1. **Orient.** Pages live in `pages/` (or `app/pages/` when the project uses an `app/` folder). `npx sinth info` prints the source folder, page count and output folder.
2. **New project:** `npx @yannosay/sinth create my-site --yes`, then `npm install` in it.
3. **Edit, then check.** After each change run `npx sinth check --json` and fix every error before moving on. Each diagnostic has a `code`, `message`, `loc` (file, line, col) and usually a `hint` with the fix. Codes: https://sinth.yannosay.com/docs/reference/errors
4. **Run it:** `npx sinth dev` serves http://localhost:3000 with hot reload. `npx sinth build` and `npx sinth preview` show the production build.
5. **Deploy only when asked:** `npx sinth deploy` (target from `"platform"` in `sinth.config.json`). Read [references/project-and-deploy.md](references/project-and-deploy.md) first.

New files: `npx sinth new page <path>`, `npx sinth new component <Name>`.

## Write lean Sinth

Sinth code is short when it uses the language instead of working around it. Before adding code, check whether Sinth already does it:

| Need | Use | Not |
|---|---|---|
| Buttons, form fields, selects, modals, tabs, tables, toasts, pagination, menus | `import { ... } from "sinth:ui"` ([references/ui.md](references/ui.md)) | hand-written markup plus CSS for the same thing |
| A value derived from state | `computed num total = items.length` | a `watch` that copies state into another `var` |
| Form input | `model: name` | `onInput` handlers that assign `e.target.value` |
| Empty list message | `for item in items { ... } else { ... }` | a separate `if items.length == 0` |
| State shared across pages | a module file with top-level `var`s (a store) | passing values through many components |
| Navigation | files in `pages/` and `Link(href: ...)` | a router package or `onClick` + `location` |
| Config values for the browser | `import { PUBLIC_API } from "sinth:env"` | hard-coded URLs |
| Redirects and response headers | `"redirects"` / `"headers"` in `sinth.config.json` | `_redirects` files per host or JS redirects |

Also:

- Make a component only when markup is reused or a page gets hard to read. Keep one-off markup in the page.
- Theme `sinth:ui` with `--ui-*` custom properties instead of overriding its classes.
- Add no wrapper `Div`s without a reason; `Main`, `Section`, `Header`, `Nav` and `Footer` exist.
- No `script` blocks or npm packages for what the standard library or `sinth:ui` already does.
- Match the existing project's naming, structure and style.

## A page

```sinth
import { Button, Field, toast } from "sinth:ui"

title = "Todos"                          -- metadata, evaluated at build time

var str draft = ""                       -- reactive state
persist var obj[] todos = []             -- saved in localStorage
computed num left = todos.filter((t) => not t.done).length

function add() {
  if draft.trim() == "" return
  todos.push({ text: draft.trim(), done: false })   -- in-place changes update the UI
  draft = ""
  toast("Added")
}

Main {
  Heading(level: 1) { "Todos (" + left + " left)" }
  Form(onSubmit.prevent: add()) {
    Field(label: "New todo", value: draft)
    Button(type: "submit") { "Add" }
  }
  Ul {
    for todo, i in todos {
      Li(class: { done: todo.done }) {
        Label { Checkbox(model: todo.done) " " + todo.text }
        Button(variant: "ghost", size: "sm", ariaLabel: "Remove", onClick: todos.splice(i, 1)) { "×" }
      }
    } else {
      Li { "Nothing to do." }
    }
  }
}

style {
  main { maxWidth: "40rem"; margin: "0 auto"; padding: "2rem" }
  .done { textDecoration: "line-through"; opacity: 0.6 }
}
```

`toast()` needs one `Toaster()` on the page or in the layout.

## Rules that trip people up

- `--` starts a comment. Write `x -= 1`, never `x--`.
- Logic is `and`, `or`, `not` (`&&`, `||`, `!` also work). `==` is strict.
- Elements and components are capitalized (`Main`, `Div`, `Heading(level: 2)`, `Paragraph`, `Link(href: ...)`, `Img`). Children go in `{ }`, attributes in `( )`.
- Several text children on one line need `+`: `Paragraph { "Hi " + name }`.
- Void elements (`Input`, `Checkbox`, `Radio`, `Img`, `Hr`) take no children. Put the label next to them: `Label { Checkbox(model: ok) " I agree" }`.
- Event handlers are code, not strings: `onClick: count += 1`, `onClick: save()`, `onKeyDown.enter: send()`. The event is `e`.
- Two-way binding is `model:` (alias `bind:`). Numbers stay numbers when the variable is `num`.
- Variables need a type or an initial value: `var num n = 0`, `var str? name`, `var obj[] rows = []`.
- Style blocks use camelCase properties and quoted values: `padding: "1rem"`. Component styles are scoped; `style global { }` opts out.
- Text is always escaped. Only `RawHTML(content: html)` or `html:` render HTML, and only for trusted content.
- Metadata (`title = ...`) runs at build time, so it cannot use `fetch` or browser state (E0700).
- Browser globals that Sinth does not know need `extern Name`.
- Pages only see environment variables that start with `PUBLIC_` (E0607). Secrets belong in `functions/`.

Full syntax (components, slots, stores, loops, conditionals, forms, imports, routing): [references/language.md](references/language.md).

## Before you finish

- `npx sinth check` reports no errors. Fix warnings you introduced.
- `npx sinth build` succeeds when you changed config, routes or dependencies.
- Do not deploy, commit or install global tools unless the user asked.

## Reporting back

Lead with the result, not the process. The user wants to know what works now and what they can do with it, not which commands you ran or which files of this skill you read.

Use this shape, kept short:

> **Added a contact form to the home page.** Name, email and message fields with validation; submissions go to `functions/api/contact.ts`.
>
> - See it: `npm run dev` → http://localhost:3000
> - Changed: `pages/index.sinth`, `functions/api/contact.ts`
> - Next: set `MAIL_API_KEY` in `.dev.vars` to send real email, or ask me to deploy it.

Mention warnings or anything left for the user (a secret to set, a login for deploy) in one line each. After a deploy, give the live URL first.
