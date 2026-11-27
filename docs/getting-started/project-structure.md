---
title: Project structure
description: Folders, file-based routing and where files go.
---

# Project structure

```
my-site/
├─ pages/              every .sinth file in here is a page
│  ├─ index.sinth      → /
│  ├─ about.sinth      → /about
│  ├─ 404.sinth        → 404.html (used by Cloudflare Pages and `sinth preview`)
│  ├─ blog/index.sinth → /blog
│  └─ blog/[slug].sinth → /blog/hello-world, /blog/second-post, ... (dynamic route)
├─ components/         reusable components (any folder name works)
├─ public/             copied to the output root as-is (robots.txt, favicon.ico, ...)
├─ assets/             copied to dist/assets/
├─ functions/          server routes (optional, see Server functions)
├─ .env                environment variables (optional, see Environment variables)
├─ sinth.config.json   optional configuration
└─ package.json
```

Rules:

- Every `.sinth` file in `pages/` is a page. No keyword or boilerplate is needed.
- Files and folders whose names start with `_` are not pages (use them for drafts and page-local components: `pages/_partials/Hero.sinth`).
- A file in `pages/` that only declares components or functions (no markup, no metadata) is treated as a module, so older projects keep working.
- If there is no `pages/` folder, every `.sinth` file in the source folder (the project root, or `app/`) that contains markup or metadata is a page; `components/`, `lib/`, `styles/`, `assets/` and `public/` are skipped.
- File and folder names in `[brackets]` are [dynamic routes](pages-and-routing.md#dynamic-routes).

## The app folder

Like Nuxt, Sinth can keep the site's source in an `app/` folder, separate from configuration and server code:

```
my-site/
├─ app/
│  ├─ pages/           → app/pages/index.sinth is /
│  ├─ components/
│  └─ assets/          copied to dist/assets/
├─ public/             stays in the root (app/public/ works too)
├─ functions/          server routes stay in the root
├─ sinth.config.json
└─ package.json
```

Sinth uses `app/` automatically when it exists and the project root has no `pages/` folder and no `.sinth` files, so existing projects are not affected. Set `"srcDir"` in [`sinth.config.json`](../tooling/configuration.md) to pick a folder explicitly (for example `"srcDir": "src"`). Imports starting with `/` resolve inside the source folder: `import { Card } from "/components/Card.sinth"`.
