# Changelog

## 5.0.0

Sinth 5 is a ground-up rewrite of the compiler, runtime and toolchain. Most Sinth 4 code compiles unchanged; see [Migrating from Sinth 4](./DOCS.md#35-migrating-from-sinth-4).

### Language

- New parser with full operator precedence (`**`, `??`, `?.`, compound assignment, `typeof`, `await`, `new`), arrow functions, spread, f-strings and template literals.
- Compile-time checks: unknown names and components (with suggestions), missing or extra function arguments, named arguments, type mismatches, num/str comparisons, read-only parameters/constants/computed values, missing required component parameters, reserved words, circular imports.
- `computed`, `const` and `persist var` declarations.
- `watch`, `onMount` and `onDestroy`.
- Typed functions with defaults, named arguments, `async`, and `-> ui` functions that render markup.
- Components with reactive parameters, `bind` (two-way) parameters, callback parameters, attribute fallthrough, named slots with fallbacks, local state and functions.
- Loops with index, key, inline filters, `key` expressions and `else` blocks; objects and Maps; `range()`.
- `if` modifiers: `persist`, `delay(ms)`, `transition("name")`.
- Event modifiers: `prevent`, `stop`, `once`, `self`, `capture`, `passive`, key and system-key filters.
- `ref`, `show`, `hide`, `delay`, `html`, object/array `class` and object `style` attributes.
- Shared stores: top-level variables and functions in modules are shared between pages.
- `extern` declarations for browser globals.

### Styling

- New style compiler: camelCase properties, nesting with `&`, element-name selectors, pseudo shorthands, `media(...)` and `dark`/`mobile`/... shorthands, all CSS at-rules.
- Component styles are scoped automatically; `style global` and `:global()` opt out.
- Style values can use parameters and variables and update reactively.
- SCSS support for style blocks and imported files.

### Imports

- Named, default, namespace and side-effect imports for `.sinth` modules.
- npm packages, local JS/TS modules, CSS/SCSS, JSON, Google Fonts and external scripts.
- `sinth:ui`: a built-in, themeable component library (Button, Card, Badge, Alert, Content, Columns, Inline, VStack, Field, Toggle, Modal, Avatar, Spinner, Navbar, Divider).
- npm packages can ship Sinth components via a `"sinth"` field.

### Runtime and output

- Fine-grained DOM updates with keyed list reconciliation; no `innerHTML` re-rendering.
- Build-time prerendering of every page; static pages ship no JavaScript.
- esbuild-powered bundling with code splitting, hashed assets, module preloading and minification.
- Standalone custom element bundles (`dist/elements/<tag>.js`).
- `_headers` with Content Security Policy and caching rules, `sitemap.xml` and `robots.txt`.
- Automatic SEO tags (Open Graph, Twitter) from page metadata.

### Tooling

- New CLI: `create`, `dev`, `build`, `preview`, `deploy`, `check` (with `--json`), `new`, `info`.
- Dev server with hot module replacement that preserves state, CSS hot swapping and an error overlay.
- Cloudflare Pages deployment via Wrangler, with project creation and preview deployments.
- Clear diagnostics with codes, code frames and hints.
- JSON schema for `sinth.config.json`.

### Security

- Fixed a path traversal in the dev server that exposed files outside the project.
- Fixed unescaped compiler errors in the dev error page.
- Fixed shell command injection through `cloudflare.projectName` in `sinth deploy`.
- Event handlers no longer use inline attributes; strict CSP is supported.
- Dynamic URLs are sanitized; dynamic text is never interpreted as HTML.
- The dev server binds to localhost by default.
- `sinth build` no longer deletes output folders it did not create.

### Removed

- `sharedRuntime`, `inlineJS` and `inlineCSS` options (accepted and ignored).
- The `fullscreen` and `fullscreenSync` attributes.
