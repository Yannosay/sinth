---
title: Environment variables
description: Public build-time variables for pages and secrets for server functions.
---

# Environment variables

Sinth reads variables from `.env` files in the project root and from the environment of the process that runs it. Pages only see variables that start with `PUBLIC_`, so a secret can never end up in the browser by accident.

```text
my-site/
├─ .env                    shared defaults
├─ .env.local              your machine only (keep out of git)
├─ .env.development        sinth dev
├─ .env.production         sinth build, sinth preview, sinth deploy
└─ .dev.vars               secrets for functions/ (Wrangler's file)
```

Later files override earlier ones, and variables set in the environment (for example in CI) override all files.

## In pages and components

Import public variables from `sinth:env`:

```sinth
import { PUBLIC_API_URL, PUBLIC_SITE_NAME } from "sinth:env"

title = PUBLIC_SITE_NAME

var obj[] items = []

onMount {
  const res = await fetch(PUBLIC_API_URL + "/items")
  items = await res.json()
}

Main {
  Heading(level: 1) { PUBLIC_SITE_NAME }
  for item in items { Paragraph { item.name } }
}
```

```text
# .env
PUBLIC_API_URL=https://api.example.com
PUBLIC_SITE_NAME="Acme Tools"
```

The values are inlined when the page is built, so they work in metadata (`title`, `canonical`, ...) and in prerendered HTML. Rebuild to pick up a changed value; `sinth dev` reloads when a `.env` file changes.

Importing a variable that is not set is a compile error (E0607), with a suggestion when the name is close to an existing one. Importing a name without the `PUBLIC_` prefix is also an error: rename the variable if it is safe to publish, or read it in a [server function](./functions.md) instead.

`import env from "sinth:env"` gives an object with every `PUBLIC_` variable.

## In server functions

Files in `functions/` receive every variable, including secrets, on `context.env`:

```ts
// functions/api/subscribe.ts
export async function onRequestPost({ request, env }) {
  const { email } = await request.json();
  const res = await fetch("https://api.mailprovider.com/subscribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MAIL_API_KEY}` },
    body: JSON.stringify({ email }),
  });
  return new Response(null, { status: res.ok ? 204 : 502 });
}
```

Locally, `env` holds the variables from `.dev.vars` and the `.env` files (`.dev.vars` wins). In production, set them in your host's dashboard (Cloudflare, Netlify, Vercel) or with Wrangler; they appear on `env` with the same names.

## Keep secrets out of git

```text
# .gitignore
.env.local
.env.*.local
.dev.vars
```

Commit `.env` only if it holds nothing secret, such as public URLs.
