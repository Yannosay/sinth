# ![Sinth](/.github/assets/repo_cover.png)

[![npm version](https://img.shields.io/npm/v/@yannosay/sinth?color=a855f7&label=npm&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth) [![downloads](https://img.shields.io/npm/dt/@yannosay/sinth?color=c084fc&label=downloads&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth) [![CI](https://img.shields.io/github/actions/workflow/status/Yannosay/sinth/ci.yml?branch=main&label=CI&style=for-the-badge)](https://github.com/Yannosay/sinth/actions) [![license](https://img.shields.io/npm/l/@yannosay/sinth?color=a78bfa&style=for-the-badge)](./LICENSE)

**Sinth is a reactive language for building websites and web apps of any size, from a landing page to a large multi-page product.** Write pages and components in one readable syntax. The compiler type-checks your whole project and produces fast, secure HTML, CSS and JavaScript, with no framework to learn.

```sinth
title = "Counter"

var num count = 0

Main {
  Heading(level: 1) { "Count: " + count }
  Button(onClick: count += 1) { "Increment" }
}
```

## Why Sinth

- **Easy to read, easy to learn.** Markup, state, logic and styles live together in one file with no boilerplate.
- **Reactive by default.** Change a variable and exactly the affected parts of the page update.
- **Built to scale.** File-based routing with dynamic routes (`pages/blog/[slug].sinth` generates one page per post), shared layouts and components, project-wide type checking, code splitting and cached chunks. Thousands of pages build in seconds.
- **Fast by default.** Every page is rendered at build time, so it appears instantly and is fully indexable by search engines. Interactivity runs on a ~5 kB runtime with fine-grained updates, and pages that need no JavaScript load none.
- **Catches mistakes before the browser does.** Unknown names, missing arguments, wrong types and missing component props are compile errors with "did you mean" hints.
- **Secure by default.** No `eval`, escaped output, no inline handlers, strict CSP and security headers out of the box.
- **Batteries included.** Dev server with hot reload that keeps state, scoped CSS, a component library (`sinth:ui`), npm packages, SCSS, JSON imports, Google Fonts, custom elements, sitemaps and one-command Cloudflare deploys.

## Get started

```bash
npx @yannosay/sinth create my-site
cd my-site
npm install
npm run dev
```

Requires Node.js 18.17 or newer.

## A component

```sinth
-- components/TodoList.sinth
import { Button, Field } from "sinth:ui"

component TodoList(str title = "Todos") {
  var str draft = ""
  var obj[] todos = []
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

## Commands

| Command | |
|---|---|
| `sinth create [name]` | Scaffold a project |
| `sinth dev` | Dev server with hot reload and error overlay |
| `sinth build` | Production build in `dist/` |
| `sinth preview` | Serve the build locally |
| `sinth deploy` | Deploy to Cloudflare Pages |
| `sinth check` | Type-check without building |
| `sinth new page/component` | Add files |

## Documentation

- **[Full reference (DOCS.md)](./DOCS.md)**: every feature, option and error code
- [Website](https://sinth.yannosay.com)
- [Changelog](./CHANGELOG.md)
- [VS Code extension](https://github.com/Yannosay/sinth/releases/latest): download `sinth-vscode-*.vsix` from the latest release and run **Extensions: Install from VSIX**
- [Sinth IDE](https://github.com/Yannosay/sinth-ide/releases/latest): the desktop editor for Sinth (Windows, macOS, Linux)

## Community

Questions and ideas: [Discord](https://discord.gg/SUvcrafTQm) · Bugs: [GitHub issues](https://github.com/Yannosay/sinth/issues) · Security reports: [SECURITY.md](./SECURITY.md) · Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

[AGPL-3.0](./LICENSE). Everything you build with Sinth (the generated HTML, CSS and JavaScript) is yours, free of any license obligations.
