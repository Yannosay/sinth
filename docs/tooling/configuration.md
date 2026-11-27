---
title: Configuration
description: All sinth.config.json options.
---

# Configuration

`sinth.config.json` is optional. All options:

```json
{
  "$schema": "./node_modules/@yannosay/sinth/schema/sinth.config.schema.json",
  "platform": "cloudflare",
  "srcDir": "app",
  "outDir": "dist",
  "pagesDir": "pages",
  "publicDir": "public",
  "staticDirs": ["assets"],
  "libraryPaths": ["libraries"],
  "site": "https://example.com",
  "base": "/",
  "minify": true,
  "sourcemap": false,
  "port": 3000,
  "host": "127.0.0.1",
  "previewPort": 4000,
  "target": ["es2020", "chrome90", "firefox90", "safari15", "edge90"],
  "router": true,
  "security": { "headers": true, "csp": true },
  "redirects": { "/old": "/new", "/blog/:slug": "/posts/:slug" },
  "headers": { "/api/*": { "Cache-Control": "no-store" } },
  "allowedHosts": [".ngrok.app"],
  "cloudflare": { "projectName": "my-site", "accountId": "…", "productionBranch": "main" },
  "development": { "sourcemap": true },
  "production": { "minify": true }
}
```

| Option | Default | Description |
|---|---|---|
| `platform` | `cloudflare` | Where the site is hosted: `cloudflare`, `cloudflare-workers`, `vercel`, `netlify`, `github-pages` or `static`. Decides the host-specific build output and what `sinth deploy` does (see [Deploying](../production/deploy.md)) |
| `srcDir` | `app` or `.` | Folder holding pages, components, libraries and assets. `app` when an `app/` folder exists and the root has no `pages/` folder or `.sinth` files, otherwise the project root (see [Project structure](../getting-started/project-structure.md#the-app-folder)) |
| `outDir` | `dist` | Build output folder (relative to the project root) |
| `pagesDir` | `pages` | Folder containing pages (relative to `srcDir`) |
| `publicDir` | `public` | Copied to the output root, including dotfiles like `.nojekyll` and `.well-known/` (relative to the project root; `app/public` is used when there is no root `public/`) |
| `staticDirs` | `["assets"]` | Folders in `srcDir` copied to `<outDir>/<name>` |
| `libraryPaths` | `["libraries"]` | Folders in `srcDir` searched for bare imports like `"ui/Button"` |
| `site` | none | Public URL; enables `sitemap.xml`, `robots.txt` and `llms.txt` |
| `base` | `/` | URL prefix when hosting in a subfolder |
| `minify` | `true` in build | Minify JS and CSS |
| `sourcemap` | `true` in dev | Emit source maps |
| `port` / `host` | `3000` / `127.0.0.1` | Dev server address |
| `previewPort` | `4000` | Preview server port |
| `target` | modern browsers | esbuild targets for JS and CSS |
| `router` | `true` | [Client-side navigation](../getting-started/pages-and-routing.md#client-side-navigation) between pages; `false` uses full page loads |
| `security.headers` | `true` | Security and caching headers (`_headers`, or the Vercel config on `platform: "vercel"`) |
| `security.csp` | `true` | `true` (generated), `false`, or a custom policy string |
| `redirects` | `{}` | [Redirects](#redirects), applied the same way in `sinth dev`, `sinth preview` and on every platform |
| `headers` | `{}` | [Custom response headers](#custom-headers) by path pattern |
| `allowedHosts` | `[]` | Host names the dev and preview servers answer to besides `localhost` and IP addresses. A leading dot allows subdomains (`".ngrok.app"`); `true` allows any host |
| `cloudflare` | `{}` | Deployment settings (see [Deploying](../production/deploy.md)) |
| `development` / `production` | none | Overrides per mode |

Command-line flags override the config file. Unknown keys produce a warning; wrong types produce an error. The Sinth 4 options `sharedRuntime`, `inlineJS` and `inlineCSS` are accepted and ignored, since splitting and bundling are automatic.

## Redirects

```json
{
  "redirects": {
    "/old-pricing": "/pricing",
    "/blog/:slug": "/posts/:slug",
    "/docs/*": { "to": "https://docs.example.com/:splat", "status": 302 }
  }
}
```

Keys are paths on your site. `:name` matches one path segment and `*` matches the rest of the path; use them in the target as `:name` and `:splat`. The status defaults to `301` (permanent); `302`, `303`, `307` and `308` are also allowed. Query strings are kept.

The build writes what each host understands: a `_redirects` file on Cloudflare (Pages and Workers), Netlify and `static`, routes in the Vercel output, and a small redirect page for each exact path on GitHub Pages, which has no server-side redirects (patterns produce warning W0811 there). A `_redirects` file in `public/` is kept and applied after these rules.

## Custom headers

```json
{
  "headers": {
    "/api/*": { "Access-Control-Allow-Origin": "https://app.example.com" },
    "/downloads/*": { "Content-Disposition": "attachment" }
  }
}
```

`*` matches any characters. These headers are added to the security headers on Cloudflare, Netlify and Vercel, and `sinth preview` serves them. A `_headers` file in `public/` is appended to the generated one, so both apply.

## Environment variables

Variables from `.env` files are available to pages through `sinth:env` when their name starts with `PUBLIC_`, and to `functions/` in full. See [Environment variables](../full-stack/environment.md).
