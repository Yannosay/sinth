---
title: Installation
description: Install Sinth, create a project and run the dev server.
---

# Installation

Sinth needs [Node.js](https://nodejs.org) 18.17 or newer.

## Create a project

```bash
npx @yannosay/sinth create my-site
cd my-site
npm install
npm run dev
```

Open `http://localhost:3000`, edit `pages/index.sinth` and save. The page updates instantly and keeps its state.

`create` asks for a template:

| Template | Contents |
|---|---|
| `starter` | A layout component, two pages, a 404 page and the `sinth:ui` library |
| `minimal` | One page with a counter |
| `blank` | Configuration and empty folders |

Pass `--template minimal --yes` to skip the questions.

## Install the CLI globally

```bash
npm install -g @yannosay/sinth
sinth create my-site
```

Inside a project, the scripts in `package.json` use the project's own Sinth version, so every developer and CI run builds with the same compiler.

## Editor setup

- **VS Code**: install the extension from the [latest release](https://github.com/Yannosay/sinth/releases/latest) (`sinth-vscode-*.vsix`, then **Extensions: Install from VSIX**). It adds highlighting, completions, hover docs, go to definition and inline errors.
- **Sinth IDE**: a desktop editor built for Sinth, with one-click Run, Build, Preview and Deploy. Download it from [Sinth IDE releases](https://github.com/Yannosay/sinth-ide/releases/latest).

See [Editor support](../tooling/editors.md) for details.

## Scripts

```bash
npm run dev       # dev server with hot reload
npm run build     # production build in dist/
npm run preview   # serve dist/ locally with production headers
npm run check     # type-check without building
npm run deploy    # deploy to Cloudflare Pages
```

## Next steps

Follow the [tutorial](tutorial.md), or read how [pages and routing](pages-and-routing.md) work.
