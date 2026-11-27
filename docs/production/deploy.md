---
title: Deploying
description: Cloudflare Pages and Workers, Vercel, Netlify, GitHub Pages and any static host.
---

# Deploying

Set `platform` in `sinth.config.json` to where the site runs. `sinth build` then writes what that host needs, and `sinth deploy` uploads it:

```json
{ "platform": "cloudflare-workers" }
```

| `platform` | Build output | `sinth deploy` | [Server functions](../full-stack/functions.md) |
|---|---|---|---|
| `cloudflare` (default) | `dist/` with `_headers` | Cloudflare Pages via Wrangler | yes |
| `cloudflare-workers` | `dist/` and a Worker config in `.sinth/deploy/` | Cloudflare Workers via Wrangler | yes |
| `vercel` | `.vercel/output/` ([Build Output API](https://vercel.com/docs/build-output-api)) | Vercel CLI | no |
| `netlify` | `dist/` with `_headers` | Netlify CLI | no |
| `github-pages` | `dist/` with `.nojekyll` | none (use GitHub Actions) | no |
| `static` | `dist/` | none (upload `dist/`) | no |

`--platform` on `sinth build` and `sinth deploy` overrides the config for one run. `sinth deploy --preview` creates a preview deployment instead of production. On every named platform, `/about` serves `about.html` and missing pages get `404.html`. Where the host supports custom headers, the build also sends the security headers and long-term caching for `/_sinth/` assets.

Host CLIs run through `npx`, so nothing extra needs to be installed. They use your own login, or a token in CI.

## Cloudflare Pages

```bash
npx wrangler@4 login          # once
sinth deploy --create         # first deploy: creates the project
sinth deploy                  # production
sinth deploy --preview        # preview URL
```

Server routes in `functions/` are deployed together with the site as Pages Functions. Set their secrets in the Cloudflare dashboard (**Settings → Variables and Secrets**).

```json
{
  "cloudflare": {
    "projectName": "my-site",
    "productionBranch": "main",
    "accountId": "0123456789abcdef0123456789abcdef"
  }
}
```

- `projectName` defaults to your `package.json` name (lowercase letters, numbers and dashes).
- In CI, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` instead of logging in.

## Cloudflare Workers

```json
{ "platform": "cloudflare-workers", "cloudflare": { "projectName": "my-site" } }
```

```bash
npx wrangler@4 login
sinth deploy                  # wrangler deploy
sinth deploy --preview        # wrangler versions upload (preview URL)
```

The site is served with [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/). `sinth build` writes `.sinth/deploy/wrangler.json`:

- Without `functions/`, the Worker only serves files, so requests never run code.
- With `functions/`, the routes are bundled into `.sinth/deploy/worker.js`. They keep the Pages Functions conventions (`onRequestGet`, `[id]`, `[[path]]`, `_middleware`, `next()`, `env.ASSETS`), and the Worker only runs for URLs that a function can answer. Everything else is served straight from the assets.

To add bindings (KV, D1, R2, secrets, a custom domain), keep your own `wrangler.jsonc` (or `wrangler.json`/`wrangler.toml`) in the project root. `sinth deploy` uses it instead of the generated one. Point it at the build:

```jsonc
{
  "name": "my-site",
  "compatibility_date": "2025-09-01",
  "main": ".sinth/deploy/worker.js",          // only with functions/
  "assets": {
    "directory": "dist",
    "binding": "ASSETS",                        // only with functions/
    "not_found_handling": "404-page",
    "html_handling": "auto-trailing-slash"
  },
  "kv_namespaces": [{ "binding": "CACHE", "id": "…" }]
}
```

## Vercel

```json
{ "platform": "vercel" }
```

```bash
npx vercel@latest login       # once
sinth deploy                  # vercel deploy --prebuilt --prod
sinth deploy --preview        # preview deployment
```

`sinth build` writes `.vercel/output/` with the pages, clean URLs, the security headers and the 404 page. The first deploy asks which Vercel project to link. In CI, set `VERCEL_TOKEN` (plus `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`). With Vercel's Git integration, set the build command to `npx sinth build` and Vercel picks up `.vercel/output/` automatically.

## Netlify

```json
{ "platform": "netlify" }
```

```bash
npx netlify-cli login         # once
sinth deploy                  # netlify deploy --prod
sinth deploy --preview        # draft deploy
```

Netlify reads the `_headers` file and serves clean URLs and `404.html` itself. In CI, set `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`. With Netlify's Git integration, use `npx sinth build` as the build command and `dist` as the publish directory.

## GitHub Pages

```json
{ "platform": "github-pages", "base": "/my-repo/" }
```

Set `base` to `/<repository>/` for a project site (leave it at `/` for a user site or a custom domain). The build adds `.nojekyll`, without which GitHub would drop the `_sinth/` folder. Publish with GitHub Actions:

```yaml
name: Deploy
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx sinth build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```

GitHub Pages does not support custom headers, so the security headers are not sent there.

## Any other host

Run `sinth build` with `"platform": "static"` and upload `dist/` to any web server or object storage. Configure the server to serve `about.html` for `/about` (most do), to use `404.html` for missing pages and, if you want them, the headers from the [security page](security.md).

## Continuous deployment

Example GitHub Actions workflow for Cloudflare:

```yaml
name: Deploy
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx sinth deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

For Vercel or Netlify, swap the secrets for `VERCEL_TOKEN` or `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.
