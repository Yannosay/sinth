---
title: Editor support
description: VS Code extension, Sinth IDE, the online playground and other editors.
---

# Editor support

## VS Code

The official extension provides syntax highlighting, completions for elements, attributes, events, modifiers, metadata keys, your own components and `sinth:ui` (with auto-import), hover documentation, go to definition, snippets, error checking with `sinth check`, and commands to run the dev server, build, preview and deploy.

Download `sinth-vscode-*.vsix` from the [latest release](https://github.com/Yannosay/sinth/releases/latest) and run **Extensions: Install from VSIX**.

## Sinth IDE

A desktop editor for Windows, macOS and Linux built for Sinth:

- Sinth highlighting, completions and hover docs
- inline diagnostics on save and a Problems list
- one-click **Run**, **Build**, **Preview** and **Deploy**; Run opens the site in your browser and turns into **Stop** while the server runs
- an integrated terminal where links open with Ctrl+click
- managed compiler versions and signed automatic updates

Download it from [Sinth IDE releases](https://github.com/Yannosay/sinth-ide/releases/latest).

## Playground

The [playground](https://sinth.yannosay.com/playground) runs the real Sinth compiler in your browser. Edit a page, see the result instantly, inspect the generated HTML, JavaScript and CSS, and share a link to your code. Examples in this documentation marked **Try it** open there.

## Other editors

Run `sinth check --json` for machine-readable diagnostics in any tool:

```json
{ "version": 1, "errors": [{ "code": "E0302", "message": "Unknown name 'cuont'", "loc": { "file": "...", "line": 12, "col": 20 } }], "warnings": [] }
```
