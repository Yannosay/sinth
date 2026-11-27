---
title: Migrating from Sinth 4
description: Upgrading from Sinth 4.
---

# Migrating from Sinth 4

Most Sinth 4 code compiles unchanged. Things to check:

| Sinth 4 | Sinth 5 |
|---|---|
| `page` at the top of every page | removed: delete the line (E0104). Every file in `pages/` is a page; move pages that lived elsewhere into `pages/` |
| `dist/pages/index.html` | `dist/index.html`: pages are now relative to `pages/` |
| `var int x` | `var num x` (`int` still works with a warning) |
| `==` was loose | `==` is strict: `1 == "1"` is a compile error |
| `"$title"` inside component strings | use the parameter directly: `{ title }` or `f"{title}"` |
| event handler strings like `onClick: "handler"` | `onClick: handler` or `onClick: handler()` (strings are now a compile error, E0351) |
| `for k, v in obj` (key, value) | `for value, index, key in obj` |
| `sharedRuntime`, `inlineJS`, `inlineCSS` | removed: splitting and bundling are automatic |
| `import SinthUI` (CSS only) | still works; it now also provides real components (`sinth:ui`) |
| `sinthRender()` in scripts | still works; usually unnecessary in Sinth handlers |
| `RawHTML(content: ...)` | unchanged; warns when the content is dynamic |
| `fullscreen:` attribute | removed; use `document.documentElement.requestFullscreen()` |

Run `sinth check` after upgrading. It reports every incompatibility with its location.
