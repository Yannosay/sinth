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
| `site` | none | Public URL; enables `sitemap.xml` and `robots.txt` |
| `base` | `/` | URL prefix when hosting in a subfolder |
| `minify` | `true` in build | Minify JS and CSS |
| `sourcemap` | `true` in dev | Emit source maps |
| `port` / `host` | `3000` / `127.0.0.1` | Dev server address |
| `previewPort` | `4000` | Preview server port |
| `target` | modern browsers | esbuild targets for JS and CSS |
| `router` | `true` | [Client-side navigation](../getting-started/pages-and-routing.md#client-side-navigation) between pages; `false` uses full page loads |
| `security.headers` | `true` | Security and caching headers (`_headers`, or the Vercel config on `platform: "vercel"`) |
| `security.csp` | `true` | `true` (generated), `false`, or a custom policy string |
| `cloudflare` | `{}` | Deployment settings (see [Deploying](../production/deploy.md)) |
| `development` / `production` | none | Overrides per mode |

Command-line flags override the config file. Unknown keys produce a warning; wrong types produce an error. The Sinth 4 options `sharedRuntime`, `inlineJS` and `inlineCSS` are accepted and ignored, since splitting and bundling are automatic.
