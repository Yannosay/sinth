---
title: Building and output
description: Production builds and the output folder.
---

# Building and output

`sinth build` produces:

```
dist/
├─ index.html, about.html, blog/index.html, 404.html
├─ _sinth/
│  ├─ index-HASH.js       page entry (interactive code, or only the router)
│  ├─ index-HASH.css      page styles
│  ├─ chunks/…            shared code
│  └─ assets/…            images and fonts referenced from CSS
├─ elements/…             custom elements: <tag>.js each, plus index.js
├─ _headers               security and caching headers
├─ sitemap.xml, robots.txt (when "site" is set)
└─ contents of public/ and static folders
```

The output is standard HTML, CSS and JavaScript with no server runtime, so it runs on Cloudflare Pages, Netlify, Vercel, GitHub Pages, S3, nginx or any static host. Pages are written as `about.html`; most hosts serve them at `/about` (on GitHub Pages and nginx, links to `/about.html` or a rewrite rule may be needed).

The build prints every page with its size and whether it ships JavaScript:

```
  /       index.html  2.3 kB  js 5.1 kB     css 8.3 kB
  /about  about.html  1.2 kB  router 42 B  css 8.2 kB
```

`router` means the page has no interactive code of its own and only loads the shared navigation script.

Every page includes `<meta name="generator" content="Sinth">` unless you set `generator` yourself. Sinth uses it to recognize its own output folder, so a rebuild never deletes files it did not write.

## Server functions

`functions/` is not copied into `dist/`. Cloudflare Pages compiles it during `sinth deploy`, `platform: "cloudflare-workers"` bundles it into a Worker during the build, and `sinth preview` runs it next to the build. Host-specific output (`.vercel/output/`, `.sinth/deploy/`, `.nojekyll`) depends on the [`platform`](deploy.md). See [Server functions](../full-stack/functions.md).
