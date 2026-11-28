# Changelog

## 5.3.4

### Security

- **URL sanitizing can no longer be bypassed.** Browsers ignore tabs, newlines and control characters inside a URL scheme, so a value like `"java<tab>script:alert(1)"` in `href` or `src` got past the check. Both the runtime and prerendered HTML now strip those characters before checking, and prerendered pages also block HTML `data:` URLs, as the runtime already did. Relative links that merely start with "javascript" (`javascript-guide.html`) are no longer blocked.
- **The dev and preview servers reject requests for unknown host names**, which protects them from DNS rebinding (a website you visit reaching your local server through a domain it controls). `localhost`, `*.localhost`, IP addresses and the `--host` name always work; tunnels and custom local domains go in the new `allowedHosts` option.
- Request bodies sent to `functions/` in `sinth dev` and `sinth preview` are limited to 64 MB.
- `--open` on Windows no longer passes the URL through `cmd`, which interpreted characters like `&` in it.

### Environment variables

- **`sinth:env`**: `import { PUBLIC_API_URL } from "sinth:env"` reads variables from `.env`, `.env.local`, `.env.development` / `.env.production` and the environment. Only names starting with `PUBLIC_` are available to pages, so secrets cannot reach the browser; a missing or non-public name is compile error E0607 with a suggestion. Values are inlined at build time and work in metadata and prerendered HTML.
- `functions/` get every variable on `context.env` (`.dev.vars` still wins), and `sinth dev` rebuilds when a `.env` file changes.

### Redirects and headers

- **`redirects`** in `sinth.config.json`, with `:params` and `*` splats: `{ "/blog/:slug": "/posts/:slug" }`. They apply in `sinth dev` and `sinth preview` and are written for every platform (`_redirects` on Cloudflare and Netlify, routes in the Vercel output, redirect pages on GitHub Pages).
- **`headers`** adds response headers by path pattern, on top of the security headers.
- A `_headers` file in `public/` is now merged with the generated one. Before, it replaced it, which silently dropped the security headers and CSP.

### sinth:ui

- **New components:** `Select`, `Tabs`, `Accordion`, `Tooltip`, `Table` (sortable), `Pagination`, `Breadcrumbs`, `ProgressBar`, `Skeleton`, `EmptyState`, `Dropdown`, `Kbd`, and `Toaster` with a `toast()` function you can call from anywhere.
- **`Modal`** traps focus, returns it to the element that opened it, locks page scrolling, labels itself with its title and takes `dismissible: false`.
- `Button` has `loading`; `Field` links `hint` and `error` to the control with `aria-describedby` and takes `disabled` and `autocomplete`; `Toggle` takes `disabled`. Dark mode has brighter status colors.

### AI agents

- **`sinth skill`** installs the Sinth skill from the installed package (Claude Code, or `.agents/skills/sinth` plus an `AGENTS.md` section for Codex, Cursor, Copilot, Gemini CLI and others), so it always matches your Sinth version.
- The skill teaches agents to write lean Sinth (`sinth:ui`, `computed`, `model`, `for … else` before custom code), adds a `sinth:ui` reference, covers environment variables and redirects, and has agents report results instead of narrating their steps.
- Sites with `site` set get an **`llms.txt`** listing every page with its title and description, for AI assistants and answer engines.

### CLI

- `sinth check --max-warnings 0` fails on warnings, for CI.
- `sinth create` mentions `sinth skill`, and new projects ignore `.vercel/`, `.env.local` and `.env.*.local`.

### Fixes

- `Select` with `model` shows the bound value when its options come from a loop or arrive later. Before, it showed the first option.
- A capitalized constant written as text, like `P { API_URL }`, renders its value. Before, it was reported as an unknown component, with the same name as the suggestion.
- Elements leaving with `transition(...)` are inert while they fade out, so they no longer catch clicks.
- Editing several files quickly in `sinth dev` reports the last one changed.

### Editors

- VS Code and Sinth IDE complete every `sinth:ui` component and the `sinth:env` import; the config schema knows `redirects`, `headers` and `allowedHosts`.

## 5.3.3

### Hosting

- **`platform` option** (`sinth.config.json`, or `--platform` on `sinth build` and `sinth deploy`): `cloudflare` (default), `cloudflare-workers`, `vercel`, `netlify`, `github-pages` or `static`. The build writes what the host needs and `sinth deploy` uploads to it.
- **Cloudflare Workers.** The site is served with Workers Static Assets. Routes in `functions/` are bundled into a Worker that keeps the Pages Functions conventions (`onRequestGet`, `[id]`, `[[path]]`, `_middleware`, `next()`, `env.ASSETS`) and only runs for URLs a function can answer. `sinth deploy` runs `wrangler deploy`, `--preview` uploads a preview version, and your own `wrangler.jsonc` is used when present (for KV, D1, R2 and other bindings).
- **Vercel.** The build writes `.vercel/output/` (Build Output API) with clean URLs, the security headers and the 404 page; `sinth deploy` runs `vercel deploy --prebuilt`.
- **Netlify** (`netlify deploy`) and **GitHub Pages** (adds `.nojekyll`, without which GitHub drops the `_sinth/` folder).
- A `functions/` folder on a platform that cannot run it produces warning W0810.

### Project layout

- **Optional `app/` folder**, like Nuxt: when `app/` exists and the root has no `pages/` folder or `.sinth` files, pages, components, libraries and assets are read from `app/`. `public/` and `functions/` stay in the root (`app/public/` also works). The new `srcDir` option sets the folder explicitly. Imports starting with `/` resolve inside it. `sinth new`, `sinth info` and the VS Code extension follow it.

### AI agents

- **The Sinth skill** teaches coding agents (Claude Code, Codex, Cursor, Copilot, ...) the syntax, common mistakes and a check-after-every-change workflow. Install it by pasting this prompt into your agent: `Install the Sinth skill: fetch https://sinth.yannosay.com/agents.md and follow its instructions exactly.` The skill also ships in the npm package under `skills/sinth/`.

### Fixes

- **Cleanups returned from `onMount`** now run when the component is removed. Before, they were attached to the wrong owner, so intervals and listeners started in a component's `onMount` kept running after it disappeared.
- **`Select` with `model`** shows the bound value on the first render. Before, it showed the first option until the user changed it, because the value was set before the options existed.
- **Number fields bound with `model`** can be cleared while typing. Before, the old number came back as soon as the field was empty. Text inputs no longer have their value rewritten while the user types.
- **Build output no longer contains absolute paths** of the build machine. Unminified CSS and JS had comments like `/* sinth-css:C:\Users\...\pages\index.sinth */`; module names are now relative to the project.
- **Client navigation** follows server redirects (the address bar shows the final URL), and a malformed `#hash` no longer stops the next page from starting.
- `range()` with an infinite bound throws instead of hanging, and memoized calls (`$fn(x)`) keep at most 500 results per function.
- **Clearer errors:** event handlers that are literals (`onClick: 1`) report E0352 instead of "handlers cannot be strings", likely typos in event names (`onClik`) get a suggestion (W0302), and children of void elements such as `Input { "x" }` in static markup are reported (W0331) instead of being dropped silently.
- `functions/`: a malformed URL escape falls through to the static site instead of failing the request.

### Documentation and website

- New pages: [AI agents](https://sinth.yannosay.com/docs/tooling/ai-agents), and a rewritten [Deploying](https://sinth.yannosay.com/docs/production/deploy) covering every platform. Project structure, configuration, CLI and server functions pages describe `app/`, `srcDir` and `platform`.
- The SEO example for `jsonLd` used the `title` metadata as a variable, which does not compile; it now uses a constant.
- The home page has a copyable agent prompt; `llms.txt` points agents to the skill.

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
