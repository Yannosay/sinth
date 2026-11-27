---
title: Introduction
description: What Sinth is, what it is good at and how it works.
---

# Introduction

Sinth is a compiled language for building websites and web apps. You write pages and components in one readable syntax that combines markup, state, logic and styles. The compiler type-checks the whole project and turns it into plain HTML, CSS and JavaScript that any host can serve.

```sinth live
var num count = 0
computed str label = count == 1 ? "time" : "times"

Main {
  Heading(level: 1) { "Hello, Sinth" }
  Button(onClick: count += 1) { "Clicked " + count + " " + label }
}

style {
  main { fontFamily: "system-ui, sans-serif"; padding: "2rem" }
  button { font: "inherit"; padding: "0.5rem 1rem" }
}
```

## What you get

- **One file per page or component.** Markup, state, functions and scoped styles live together, without boilerplate or a virtual DOM.
- **Reactivity built into the language.** Assigning to a `var` updates exactly the parts of the page that use it.
- **Compile-time checks.** Unknown names, wrong argument counts, type mismatches and missing component parameters are errors with a code frame and a "did you mean" hint, before anything reaches the browser.
- **Prerendered pages.** Every page is rendered to HTML at build time, so it shows instantly and is fully indexable. Interactive parts are made live by a small runtime.
- **Instant navigation.** Links between pages load without a full page reload, while every page stays a real HTML file.
- **Full stack when you need it.** API routes in `functions/` run in the dev server and deploy to Cloudflare Pages Functions unchanged.
- **Works with the web platform.** npm packages, TypeScript files, CSS and SCSS, JSON, Google Fonts and standard web components.

## How it works

1. `sinth dev` compiles your project in memory and serves it with hot reload that keeps your state.
2. `sinth build` parses every `.sinth` file, type-checks it, prerenders each page to HTML and bundles the interactive parts with esbuild.
3. The output in `dist/` is static files plus optional `functions/`. Deploy it with `sinth deploy` or upload it anywhere.

## When to use Sinth

Sinth fits marketing sites, documentation, blogs, dashboards, internal tools and multi-page apps of any size. It is a good choice when you want prerendered pages and reactive UI without assembling a framework, a router, a bundler and a CSS solution yourself.

## Next steps

- [Install Sinth](installation.md) and create a project
- Follow the [tutorial](tutorial.md) to build a small app
- Try the [playground](https://sinth.yannosay.com/playground) in your browser
