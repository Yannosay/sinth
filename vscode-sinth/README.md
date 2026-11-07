# Sinth for Visual Studio Code

Official language support for [Sinth 5](https://github.com/Yannosay/sinth), the small reactive language for websites and web apps.

## Features

- **Syntax highlighting** for markup, expressions, f-strings, `style` blocks (Sinth style syntax, CSS and SCSS) and `script` blocks (JavaScript).
- **IntelliSense**
  - Built-in elements, your own components (from the whole workspace) and the `sinth:ui` library
  - Component parameters inside `Card(...)`, with required parameters first
  - Attributes, directives (`model`, `ref`, `show`, ...), events and event modifiers (`onClick.prevent`)
  - Page metadata keys, keywords, types, and the variables and functions of the current file
  - **Auto-import**: picking a component from another file adds the `import` line
- **Diagnostics** from the real compiler (`sinth check`) on open and save, with error codes linking to the reference.
- **Hover documentation** for elements, components, keywords, directives and metadata.
- **Go to definition** for components, functions and variables.
- **Signature help** for functions and components.
- **Outline** of components, functions and variables.
- **Formatter** (Format Document).
- **Snippets** for pages, components, loops, forms, data fetching and more.
- **Commands**: `Sinth: Start Dev Server`, `Build for Production`, `Preview Production Build`, `Check Project for Errors`, `Deploy to Cloudflare Pages`, `New Page`, `New Component`, `Open Documentation`.
- **Validation** for `sinth.config.json`.

## Requirements

Diagnostics and commands use the Sinth compiler. Install it in your project (recommended):

```bash
npm install -D @yannosay/sinth
```

or globally with `npm install -g @yannosay/sinth`. New projects created with `npx @yannosay/sinth create my-site` already include it.

## Settings

| Setting | Default | Description |
|---|---|---|
| `sinth.diagnostics.enabled` | `true` | Run `sinth check` on open and save |
| `sinth.compilerPath` | `""` | Path to `bin/sinth.js` or a `sinth` executable. Empty: project install, then global |

## Links

[Documentation](https://github.com/Yannosay/sinth/blob/main/DOCS.md) · [Issues](https://github.com/Yannosay/sinth/issues) · [Discord](https://discord.gg/SUvcrafTQm)
