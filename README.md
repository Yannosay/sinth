# ![Sinth](/.github/assets/repo_cover.png)

[![npm version](https://img.shields.io/npm/v/@yannosay/sinth?color=a855f7&label=npm&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth) [![downloads](https://img.shields.io/npm/dt/@yannosay/sinth?color=c084fc&label=downloads&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth) [![CI](https://img.shields.io/github/actions/workflow/status/Yannosay/sinth/ci.yml?branch=main&label=CI&style=for-the-badge)](https://github.com/Yannosay/sinth/actions) [![license](https://img.shields.io/npm/l/@yannosay/sinth?color=a78bfa&style=for-the-badge)](./LICENSE)

**Sinth is a compiled, type-checked language for websites and web apps.** Write pages and components in one readable syntax; the compiler checks the whole project and produces prerendered HTML, scoped CSS and a small amount of JavaScript. Routing, instant navigation, API routes, a component library and deployment are built in.

```sinth
title = "Counter"

var num count = 0

Main {
  Heading(level: 1) { "Count: " + count }
  Button(onClick: count += 1) { "Increment" }
}
```

**[Try it in the playground](https://sinth.yannosay.com/playground)** · **[Documentation](https://sinth.yannosay.com/docs)** · **[Tutorial](https://sinth.yannosay.com/docs/getting-started/tutorial)**

## Get started

```bash
npx @yannosay/sinth create my-site
cd my-site
npm install
npm run dev
```

Requires Node.js 18.17 or newer.

## Why Sinth

- **One file, everything in it.** Markup, state, functions and scoped styles live together, without boilerplate, hooks or a virtual DOM.
- **Reactive by design.** Assign to a variable and exactly the affected parts of the page update. Arrays and objects can be changed in place.
- **Errors before the browser sees them.** Unknown names, wrong types, missing arguments and missing component props are compile errors with a code frame and a "did you mean" hint.
- **Fast pages by default.** Every page is prerendered to HTML at build time. Interactive parts run on a ~5 kB runtime with fine-grained updates; static pages ship no framework code.
- **Instant navigation.** Links between pages are prefetched and swapped in place, without full reloads, while every page stays a real, indexable HTML file.
- **Full stack.** API routes in `functions/` use the standard Fetch API, run in the dev server and deploy to Cloudflare Pages Functions unchanged.
- **Scales to large sites.** File-based and dynamic routes (`pages/blog/[slug].sinth`), layouts, shared stores, code splitting and hashed assets.
- **Works with everything else.** npm packages, TypeScript files, CSS and SCSS, JSON, Google Fonts, and components exported as standard web components for any HTML page.
- **Secure by default.** No `eval`, escaped output, no inline handlers, a strict Content Security Policy and security headers.

## A component

```sinth
-- components/TodoList.sinth
import { Button, Field } from "sinth:ui"

component TodoList(str title = "Todos") {
  persist var obj[] todos = []
  var str draft = ""
  computed num left = todos.filter((t) => not t.done).length

  function add() {
    if draft.trim() == "" return
    todos.push({ text: draft.trim(), done: false })
    draft = ""
  }

  Section(class: "todos") {
    Heading(level: 2) { title + " (" + left + " left)" }
    Form(onSubmit.prevent: add()) {
      Field(label: "New todo", value: draft)
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
}
```

## An API route

```ts
// functions/api/hello.ts
export const onRequestGet = () => Response.json({ message: "Hello from the server" });
```

```sinth
var str message = ""
onMount { message = (await (await fetch("/api/hello")).json()).message }
Main { Paragraph { message } }
```

## Commands

| Command | |
|---|---|
| `sinth create [name]` | Scaffold a project |
| `sinth dev` | Dev server with hot reload that keeps state, and an error overlay |
| `sinth build` | Production build in `dist/` |
| `sinth preview` | Serve the build and `functions/` locally |
| `sinth deploy` | Deploy to Cloudflare Pages |
| `sinth check` | Type-check without building (`--json` for tools) |
| `sinth new page/component` | Add files |

## Tools

- [VS Code extension](https://github.com/Yannosay/sinth/releases/latest): download `sinth-vscode-*.vsix` from the latest release and run **Extensions: Install from VSIX**
- [Sinth IDE](https://github.com/Yannosay/sinth-ide/releases/latest): a desktop editor for Sinth (Windows, macOS, Linux)
- [Playground](https://sinth.yannosay.com/playground): the real compiler, in your browser

## Documentation

The documentation lives in [docs/](./docs) and is published at [sinth.yannosay.com/docs](https://sinth.yannosay.com/docs). See also the [changelog](./CHANGELOG.md).

## Community

Questions and ideas: [Discord](https://discord.gg/SUvcrafTQm) · Bugs: [GitHub issues](https://github.com/Yannosay/sinth/issues) · Security reports: [SECURITY.md](./SECURITY.md) · Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

[AGPL-3.0](./LICENSE). Everything you build with Sinth (the generated HTML, CSS and JavaScript) is yours, free of any license obligations.
