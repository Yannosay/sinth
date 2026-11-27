---
title: Deploying
description: Cloudflare Pages, Netlify, Vercel and any static host.
---

# Deploying

## Cloudflare Pages

```bash
npx wrangler@4 login          # once
sinth deploy --create         # first deploy: creates the project
sinth deploy                  # production
sinth deploy --preview        # preview URL
```

Server routes in [`functions/`](../full-stack/functions.md) are deployed together with the site as Pages Functions. Set their secrets in the Cloudflare dashboard (**Settings → Variables and Secrets**).

Configuration:

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

Example GitHub Actions workflow:

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

## Other hosts

Run `sinth build` and upload `dist/`. On Netlify the `_headers` file is used automatically. Other hosts ignore it, so configure the headers there if you want them.
