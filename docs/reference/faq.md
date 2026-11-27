---
title: FAQ
description: Frequently asked questions.
---

# FAQ

**Does Sinth need a framework or runtime on the server?**
No. The output is HTML, CSS and JavaScript that any web host can serve.

**Can I use npm packages?**
Yes. Install them and import them. They are bundled and tree-shaken.

**Can I use TypeScript?**
Import `.ts` files directly; they are compiled during bundling. Sinth itself has its own type annotations.

**How do I fetch data?**
In `onMount`, an event handler or an `async function`. The UI updates when the promise settles. See [Fetching data](../full-stack/data-fetching.md).

**Can Sinth do server-side code and APIs?**
Yes. Files in `functions/` are API routes that run in the dev server and on Cloudflare Pages. See [Server functions](../full-stack/functions.md).

**Can I use Sinth components on a site that is not built with Sinth?**
Yes. Declare a component `as <my-tag>` and include the built script. See [Custom elements](../components/custom-elements.md).

**How do I share layouts?**
Make a `Layout` component with `$slot` and wrap each page in it. The starter template does this.

**Why is my page shipping JavaScript?**
Every page loads the small navigation script unless `"router": false` is set. A page ships its own code when it has an event, binding, script, watcher, lifecycle hook, persisted variable, JS import, or a value that can only be computed in the browser.

**Do links reload the whole page?**
No. Links between your pages are swapped in place, with prefetching. Add `dataReload: true` to a link, or set `"router": false`, for full page loads.

**Can I host under a subfolder?**
Set `"base": "/docs/"`. The dev server and `sinth preview` serve the site under that path too.

**How does Sinth compare to React, Vue or Svelte?**
Sinth is a language and toolchain rather than a library: routing, prerendering, scoped styles, type checking, a component library and deployment are built in, and the output is plain HTML with a small runtime. Like Svelte it compiles components ahead of time; like Astro it prerenders every page; like Vue it makes state reactive without extra API calls.

**Do I have to open-source my site because Sinth is AGPL?**
No. Sinth is licensed under the AGPL-3.0 with a [runtime exception](https://github.com/Yannosay/sinth/blob/main/RUNTIME-EXCEPTION.md): the HTML, CSS and JavaScript that Sinth generates, including the runtime code bundled into it, can be used and licensed however you like. The AGPL applies when you modify or redistribute Sinth itself.

**Where do I report bugs?**
[github.com/Yannosay/sinth/issues](https://github.com/Yannosay/sinth/issues). Include the output of `sinth info`.
