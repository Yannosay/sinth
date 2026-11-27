---
title: Configuration
description: All sinth.config.json options.
---

# Configuration

`sinth.config.json` is optional. All options:

```json
{
  "$schema": "./node_modules/@yannosay/sinth/schema/sinth.config.schema.json",
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
| `outDir` | `dist` | Build output folder |
| `pagesDir` | `pages` | Folder containing pages |
| `publicDir` | `public` | Copied to the output root, including dotfiles like `.nojekyll` and `.well-known/` |
| `staticDirs` | `["assets"]` | Copied to `<outDir>/<name>` |
| `libraryPaths` | `["libraries"]` | Folders searched for bare imports like `"ui/Button"` |
| `site` | none | Public URL; enables `sitemap.xml` and `robots.txt` |
| `base` | `/` | URL prefix when hosting in a subfolder |
| `minify` | `true` in build | Minify JS and CSS |
| `sourcemap` | `true` in dev | Emit source maps |
| `port` / `host` | `3000` / `127.0.0.1` | Dev server address |
| `previewPort` | `4000` | Preview server port |
| `target` | modern browsers | esbuild targets for JS and CSS |
| `router` | `true` | [Client-side navigation](../getting-started/pages-and-routing.md#client-side-navigation) between pages; `false` uses full page loads |
| `security.headers` | `true` | Write `_headers` |
| `security.csp` | `true` | `true` (generated), `false`, or a custom policy string |
| `cloudflare` | `{}` | Deployment settings (see [Deploying](../production/deploy.md)) |
| `development` / `production` | none | Overrides per mode |

Command-line flags override the config file. Unknown keys produce a warning; wrong types produce an error. The Sinth 4 options `sharedRuntime`, `inlineJS` and `inlineCSS` are accepted and ignored, since splitting and bundling are automatic.
