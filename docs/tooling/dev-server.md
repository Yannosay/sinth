---
title: Dev server
description: Hot reload, error overlay and functions in development.
---

# Dev server

`sinth dev` builds in memory and serves your site:

- **Hot module replacement**: saving a `.sinth` file swaps the page's code without a reload and **keeps your state** (variables, form inputs). CSS-only changes are applied without touching the page. Changes to metadata reload the page.
- **Error overlay**: compile errors appear in the browser with the code frame and a hint, and disappear when fixed. Runtime errors are shown too.
- **Clean URLs**: `/about`, `/about.html` and `/blog/` all work.
- **Static files** from `public/` and your static folders are served directly; changing them reloads the page.
- **Client-side navigation** works the same as in production.
- **Server functions** in `functions/` handle `/api/...` and other routes, reload on save and read secrets from `.dev.vars`. See [Server functions](../full-stack/functions.md).
- **Custom elements** are served at `/elements/<tag>.js` and `/elements/index.js`.
- **Subfolder hosting**: with `"base": "/docs/"` the site is served under `/docs/`, like in production.
- If the port is busy, the next free port is used.
- `--host` exposes the server on your network (e.g. to test on a phone).

Editor temp files and folders like `node_modules`, `dist` and `.git` are ignored.
