# Sinth projects, configuration and deployment

## Layout

```
my-site/
├─ pages/              every .sinth file is a page (index.sinth is /)
├─ components/         reusable components
├─ assets/             copied to dist/assets/
├─ public/             copied to the output root (robots.txt, favicon.ico)
├─ functions/          server routes (Cloudflare Pages Functions conventions)
├─ sinth.config.json   optional
└─ package.json
```

**Nuxt-style `app/` folder.** When `app/` exists and the root has no `pages/` folder and no `.sinth` files, Sinth reads pages, components, libraries and assets from `app/` (`app/pages/`, `app/components/`, ...). `public/` and `functions/` stay in the project root (`app/public/` also works). Set `"srcDir"` in `sinth.config.json` to choose the folder explicitly. In imports, `/components/Card.sinth` means the source folder.

Without a `pages/` folder, every `.sinth` file with markup in the source folder is a page.

## CLI

```
npx sinth dev                 dev server with hot reload (http://localhost:3000)
npx sinth check [--json]      type-check everything, no output files
npx sinth build [--platform name]
npx sinth preview             serve the production build locally
npx sinth deploy [--platform name] [--preview] [--create] [--project name]
npx sinth new page blog/first-post
npx sinth new component ProductCard
npx sinth info
```

## sinth.config.json

```json
{
  "platform": "cloudflare",
  "site": "https://example.com",
  "cloudflare": { "projectName": "my-site" }
}
```

Other options: `srcDir`, `outDir` (default `dist`), `pagesDir`, `publicDir`, `staticDirs`, `base`, `minify`, `router`, `security.headers`, `security.csp`. Full list: https://sinth.yannosay.com/docs/tooling/configuration

## Platforms

| `platform` | Build output | `sinth deploy` | Server functions |
|---|---|---|---|
| `cloudflare` (default) | `dist/` with `_headers` | Cloudflare Pages via Wrangler | yes (Pages Functions) |
| `cloudflare-workers` | `dist/` plus `.sinth/deploy/wrangler.json` (and a Worker when `functions/` exists) | `wrangler deploy` | yes (bundled into the Worker) |
| `vercel` | `.vercel/output/` (Build Output API: clean URLs, headers, 404) | `vercel deploy --prebuilt` | no |
| `netlify` | `dist/` with `_headers` | `netlify deploy` | no |
| `github-pages` | `dist/` with `.nojekyll` | none: publish with GitHub Actions | no |
| `static` | `dist/` | none: upload `dist/` anywhere | no |

- Deploying needs the user's own login for the host (`npx wrangler@4 login`, `npx vercel login`, `npx netlify-cli login`) or a CI token (`CLOUDFLARE_API_TOKEN` plus `CLOUDFLARE_ACCOUNT_ID`, `VERCEL_TOKEN`, `NETLIFY_AUTH_TOKEN` plus `NETLIFY_SITE_ID`). Never ask the user to paste tokens into the chat.
- `sinth deploy --preview` makes a preview deployment instead of production.
- On GitHub Pages under a repository path, set `"base": "/repo-name/"`.
- With your own `wrangler.json`/`wrangler.jsonc`/`wrangler.toml` in the root, `sinth deploy` uses it. Point `assets.directory` at `dist`, and for functions set `"main": ".sinth/deploy/worker.js"` and `"assets": { "binding": "ASSETS" }`.

## Server functions

```ts
// functions/api/hello.ts  ->  /api/hello
export const onRequestGet = ({ request, env }) => {
  const name = new URL(request.url).searchParams.get("name") ?? "world";
  return Response.json({ message: `Hello, ${name}!` });
};
```

`[id].ts` gives `params.id`, `[[path]].ts` catches the rest as an array, `_middleware.ts` runs before routes below its folder and calls `next()`. Secrets for local development go in `.dev.vars`. Functions run in `sinth dev` and `sinth preview` too.
