---
title: Error reference
description: Every error and warning code.
---

# Error reference

| Code | Meaning |
|---|---|
| E0001 | Invalid character, string or number |
| E0100 | Syntax error |
| E0102 | Reserved word used as a name |
| E0103 | Invalid assignment target |
| E0104 | The removed `page` keyword (delete the line) |
| E0201 | Unknown type |
| E0202 | Name declared twice in the same scope |
| E0210 | `persist` outside page or component state |
| E0301 | Unknown component or element |
| E0302 | Unknown name |
| E0310 | `$slot` outside a component |
| E0311–E0316 | Wrong function or slot arguments (unknown, duplicated, too many, missing, misordered) |
| E0320 | Invalid heading level |
| E0330–E0334 | Invalid element content or attribute (children on void elements, inline `on*` strings, ...) |
| E0340, E0341 | `model`/`ref` without a variable |
| E0350–E0352 | A non-function, a string or another literal used as event handler |
| E0360 | Missing required component parameter |
| E0370, E0371 | UI function or component used as a value |
| E0380 | Returning a value from a `void` function |
| E0390–E0394 | Assigning to a parameter, constant, computed value, function or loop variable |
| E0400–E0403 | Type errors |
| E0400 (in a style block) | Invalid style syntax |
| E0402 | SCSS compile error |
| E0500, E0501 | Script block syntax error / `import` inside a component script |
| E0600–E0609 | Import errors (file not found, unknown export, circular import, ...) |
| E0700 | Metadata value can't be computed at build time |
| E0701 | Metadata value is an object or array |
| E0710 | Dynamic route without `paths` |
| E0711 | `paths` is not an array computable at build time |
| E0712 | Invalid, missing or duplicate value in `paths` |
| E0713 | `paths` in a page that is not a dynamic route |
| E0714 | Invalid route parameter name |
| E0800 | Bundling error (e.g. missing npm package) |
| E0801 | Output folder not created by Sinth |
| E0802 | No pages or custom elements found |
| E0803 | A file in `functions/` failed to build |
| E0899 | Internal compiler error (please report it) |
| E0900–E0903 | Invalid configuration (including an unknown `platform` or a missing `srcDir`) |
| E1000 | No build to preview |
| E1100–E1106 | Deployment errors (E1106: the platform has no `sinth deploy` upload, e.g. GitHub Pages) |
| E1200–E1202 | Invalid command-line options |
| E1300–E1305 | `new`/`create` errors |
| W0101 | Markup outside a component in a module file |
| W0201 | `int` is deprecated |
| W0301 | Unescaped dynamic HTML |
| W0302 | Unknown event name such as `onClik` (likely typo; other names listen for custom events) |
| W0331 | Children of a void element such as `Input` in static markup (ignored; in dynamic markup this is E0331) |
| W0310 | Unknown component parameter passed to the root element (likely typo) |
| W0401 | `null` assigned to a non-nullable variable |
| W0800 | Bundler warning |
| W0810 | `functions/` exists but the `platform` cannot run server functions |
