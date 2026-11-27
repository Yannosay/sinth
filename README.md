# ![Sinth](/.github/assets/repo_cover.png)

[![npm version](https://img.shields.io/npm/v/@yannosay/sinth?color=a855f7&label=npm&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth) [![downloads](https://img.shields.io/npm/dt/@yannosay/sinth?color=c084fc&label=downloads&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth) [![CI](https://img.shields.io/github/actions/workflow/status/Yannosay/sinth/ci.yml?branch=main&label=CI&style=for-the-badge)](https://github.com/Yannosay/sinth/actions) [![license](https://img.shields.io/npm/l/@yannosay/sinth?color=a78bfa&style=for-the-badge)](./LICENSE)

Sinth is a language for building websites. A `.sinth` file holds a page's markup, state, functions and styles. The compiler checks the project, prerenders every page to HTML and bundles the interactive parts into plain JavaScript.

```sinth
title = "Counter"

var num count = 0

Main {
  Heading(level: 1) { "Count: " + count }
  Button(onClick: count += 1) { "Increment" }
}
```

This page builds to a 0.5 kB HTML file and 3.5 kB of gzipped JavaScript (runtime and router included).

[Playground](https://sinth.yannosay.com/playground) · [Documentation](https://sinth.yannosay.com/docs) · [Tutorial](https://sinth.yannosay.com/docs/getting-started/tutorial)

## Get started

```bash
npx @yannosay/sinth create my-site
cd my-site
npm install
npm run dev
```

Requires Node.js 18.17 or newer.

## Features

- **Reactive state.** Assigning to a `var`, or changing an array or object in place, updates the parts of the page that use it.
- **Compile-time checks.** Unknown names, wrong argument counts, missing component parameters and type mismatches the compiler can detect are errors with a code frame and a suggestion.
- **Prerendered pages.** Every page is rendered to HTML at build time. Interactive pages then load their code: the runtime is 5.4 kB gzipped at most and only the parts a page uses are bundled.
- **Routing.** Files in `pages/` are routes, `pages/blog/[slug].sinth` generates one page per item, and links between pages load without a full reload (2 kB gzipped; `"router": false` turns it off).
- **API routes.** Files in `functions/` handle requests with the standard Fetch API in `sinth dev` and `sinth preview`, and deploy to Cloudflare Pages Functions.
- **Components.** Parameters, two-way bindings, slots and scoped styles, plus a built-in component library (`sinth:ui`). Components can be exported as web components for use on other sites.
- **Tooling.** Hot reload that keeps state, npm packages, TypeScript and SCSS imports, security headers and a Content Security Policy without inline scripts, and `sinth deploy` for Cloudflare Pages. The output is static files, so other hosts work too.

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

  Section {
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
| `sinth dev` | Dev server with hot reload |
| `sinth build` | Production build in `dist/` |
| `sinth preview` | Serve the build and `functions/` locally |
| `sinth deploy` | Deploy to Cloudflare Pages |
| `sinth check` | Check the project without building (`--json` for tools) |
| `sinth new page/component` | Add files |

## Editors

- VS Code: download `sinth-vscode-*.vsix` from the [latest release](https://github.com/Yannosay/sinth/releases/latest) and run **Extensions: Install from VSIX**.
- [Sinth IDE](https://github.com/Yannosay/sinth-ide/releases/latest): a desktop editor for Sinth (Windows, macOS, Linux). Early development.

## Links

Documentation source: [docs/](./docs) · [Changelog](./CHANGELOG.md) · [Discord](https://discord.gg/SUvcrafTQm) · [Issues](https://github.com/Yannosay/sinth/issues) · [Security](./SECURITY.md) · [Contributing](./CONTRIBUTING.md)

## License

[AGPL-3.0](./LICENSE).
