# Changelog

## 5.3.2

- **`for … else` empty state.** The `else` content of a loop is removed once the list gets items. Before, it stayed on the page after the first item was added to an empty list.
- **Reactive page styles.** Expressions in a page's `style` block (for example `background: "hsl(" + hue + ", 80%, 60%)"`) now update when the variables change. Prerendered pages also include their initial values, so the page is styled before its script runs. Component styles were not affected.

## 5.3.1

- **Runtime exception.** Sinth is now licensed under the AGPL-3.0 with an additional permission ([RUNTIME-EXCEPTION.md](./RUNTIME-EXCEPTION.md)): sites built with Sinth, including the runtime code bundled into them, can be licensed however you like. Sinth itself stays under the AGPL. The exception covers all versions of Sinth.
- README and docs state measured output sizes instead of approximations.

## 5.3.0

### Instant navigation

- Links between pages no longer reload the whole page. Sinth fetches the next page's prerendered HTML, updates the head, swaps the content and starts the page's code. Pages are prefetched on hover and focus. Back/forward, scroll positions and `#anchors` work as before, and every page is still a complete HTML file.
- Each page starts with fresh state; shared stores keep theirs across pages. A `sinth:navigate` event fires after each navigation.
- Opt out per link with `dataReload: true`, or for the whole site with `"router": false` (static pages then ship no JavaScript at all).

### Server functions

- Files in `functions/` are API routes, following the Cloudflare Pages Functions conventions: `onRequest` / `onRequestGet` / ... handlers, `[param]` and `[[catchall]]` segments, `_middleware` files, `env` from `.dev.vars`, and `next()` / `env.ASSETS`.
- They run in `sinth dev` (reloaded on save) and `sinth preview`, and deploy with `sinth deploy` unchanged.

### Language

- State changed from timers, promise callbacks and other callbacks in Sinth code now updates the page, e.g. `setInterval(() => { seconds += 1 }, 1000)` in `onMount`. Before, only event handlers triggered updates. Updates are batched, and code in `script` blocks still calls `sinthRender()`.
- `try` / `catch` / `finally` and `throw` in functions, handlers and lifecycle blocks.
- `x--` reports that `--` starts a comment and suggests `x -= 1`, instead of a confusing syntax error.
- `jsonLd` page metadata writes schema.org structured data.
- Pages include `<meta name="generator" content="Sinth">` (override with `generator`).

### Custom elements

- `dist/elements/index.js` registers every element of the project at once.
- A project with only components (no pages) builds just its elements, for use in any HTML site.
- Elements are also served by the dev server.

### Compiler API and playground

- `compileFiles()` compiles in-memory sources without a file system or bundler.
- A browser build of the compiler ships at `dist/browser/sinth.js`; it powers the new playground at sinth.yannosay.com/playground.

### Fixes

- `"base"` (hosting in a subfolder) now works in `sinth dev` and `sinth preview`: pages, assets and hot reload are served under the base path.
- Rebuilding a site without interactive pages failed with E0801, because Sinth did not recognize its own output folder.
- `public/` dotfiles such as `.nojekyll` and `.htaccess` are copied; OS junk files (`.DS_Store`, `Thumbs.db`, `desktop.ini`) are skipped.
- The dev and preview servers accept POST, PUT, PATCH and DELETE requests for function routes.

### Documentation

- The documentation moved into this repository (`docs/`) and was rewritten, with a tutorial and new pages for data fetching, server functions, SEO and client-side navigation. Runnable examples are compiled in CI. `DOCS.md` was replaced by it.

## 5.2.3

- `script { }` and `style { }` blocks are now recognized on the line after a statement that ends in `)` or `]`, such as `var data = JSON.parse(text)`. Before, this failed with a confusing syntax error.

## 5.2.2

- Documentation: clearer README and package description, working links for the VS Code extension and Sinth IDE.

## 5.2.1

- The E0104 hint now covers projects without a `pages/` folder, where root files are pages.

## 5.2.0

- **The `page` keyword is removed.** A file that starts with `page` now fails with E0104 and a hint to delete the line. Every `.sinth` file in `pages/` is a page, and files outside it are modules. `page` can still be used as a variable name.
- Editors no longer suggest or highlight `page` as a keyword.

## 5.1.1

- Dynamic routes and page detection now work when the project path contains a symlink or junction (macOS temp folders, linked workspaces).
- Dev server logs use forward slashes on Windows.

## 5.1.0

### Routing

- **No more `page` keyword.** Every `.sinth` file in `pages/` is a page. Files and folders starting with `_` are skipped, and files that only declare components or functions are treated as modules. Without a `pages/` folder, root files with markup are pages. `page` is still accepted.
- **Dynamic routes.** `pages/blog/[slug].sinth` with `paths = posts.map((p) => p.slug)` generates one prerendered page per item, with route params available as constants, in metadata and at runtime. Several params per route are supported (`pages/[lang]/[page].sinth`).
- **Computed metadata.** `title`, `descr` and other metadata can be expressions evaluated at build time (constants, imported JSON, route params).
- Clearer `E0802` message when no pages are found, and new errors E0701 and E0710 to E0714 for metadata and dynamic routes.

### CLI

- `sinth build` lists at most 30 pages on large sites; `--verbose` lists all.

### Editors

- Templates, snippets and the VS Code extension no longer add `page`; `paths` has completions and hover docs.

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
