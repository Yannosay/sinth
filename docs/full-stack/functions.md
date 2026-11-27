---
title: Server functions
description: API routes and server code in functions/, from development to Cloudflare Pages.
---

# Server functions

Files in `functions/` are server routes. They run in `sinth dev` and `sinth preview`, and deploy to [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/) with `sinth deploy`, unchanged. They use the standard Fetch API (`Request`, `Response`, `URL`, `Headers`), so there is nothing Sinth-specific to learn.

```
my-site/
├─ pages/
├─ functions/
│  ├─ api/
│  │  ├─ hello.ts          → /api/hello
│  │  ├─ todos/index.ts    → /api/todos
│  │  └─ todos/[id].ts     → /api/todos/42
│  ├─ files/[[path]].ts    → /files/a/b/c
│  └─ _middleware.ts       → runs before every request
└─ .dev.vars               secrets for local development
```

## A first route

```ts
// functions/api/hello.ts
export const onRequestGet = ({ request }) => {
  const name = new URL(request.url).searchParams.get("name") ?? "world";
  return Response.json({ message: `Hello, ${name}!` });
};
```

Call it from a page:

```sinth
var str message = "Loading..."

onMount {
  const res = await fetch("/api/hello?name=Sinth")
  message = (await res.json()).message
}

Main { Paragraph { message } }
```

## Handlers

Export `onRequest` to handle every method, or one handler per method: `onRequestGet`, `onRequestPost`, `onRequestPut`, `onRequestPatch`, `onRequestDelete`, `onRequestHead`, `onRequestOptions`. A method-specific handler wins over `onRequest`. When a route has no handler for the method, the request falls through to the static site.

Every handler receives a context and returns a `Response` (or a promise of one):

| Field | |
|---|---|
| `request` | the incoming `Request` |
| `params` | route parameters: `[id]` gives a string, `[[path]]` an array of segments |
| `env` | environment variables and bindings; `env.ASSETS.fetch(request)` serves a static file |
| `data` | an object shared between middleware and the route |
| `next()` | continues with the next middleware, the route or the static site |
| `waitUntil(promise)` | lets work finish after the response is sent |

```ts
// functions/api/todos/[id].ts
const todos = new Map([["1", { id: "1", text: "Ship it", done: false }]]);

export const onRequestGet = ({ params }) => {
  const todo = todos.get(params.id);
  return todo ? Response.json(todo) : new Response("Not found", { status: 404 });
};

export const onRequestPatch = async ({ params, request }) => {
  const todo = todos.get(params.id);
  if (!todo) return new Response("Not found", { status: 404 });
  Object.assign(todo, await request.json());
  return Response.json(todo);
};
```

In-memory data like this map resets when the server restarts. For persistent data, use a database binding such as Cloudflare D1 or KV through `env`, or any HTTP API.

## Routing rules

- `index.ts` handles the folder's own path.
- `[name]` matches one path segment, `[[name]]` one or more.
- Static segments win over `[name]`, which wins over `[[name]]`.
- Function routes take precedence over pages and static files with the same path.
- `.ts`, `.js`, `.mjs`, `.tsx` and `.jsx` files are routes; `*.test.*`, `*.spec.*` and `*.d.ts` files are ignored.

## Middleware

`_middleware.ts` runs before every route in its folder and below, and before static pages. Call `next()` to continue:

```ts
// functions/_middleware.ts
export const onRequest = async ({ next }) => {
  const started = Date.now();
  const response = await next();
  const out = new Response(response.body, response);
  out.headers.set("Server-Timing", `total;dur=${Date.now() - started}`);
  return out;
};
```

## Secrets and environment variables

Locally, `env` contains the variables in `.dev.vars` (and `.env`), written as `KEY=value` lines. Keep these files out of git. In production, set variables and bindings (KV, D1, R2, ...) in the Cloudflare dashboard or with Wrangler; they appear on `env` with the same names.

```
# .dev.vars
API_KEY=dev-key-123
```

```ts
export const onRequest = ({ env }) => Response.json({ hasKey: Boolean(env.API_KEY) });
```

## Types

For editor types, install `@cloudflare/workers-types` and annotate handlers with `PagesFunction`:

```ts
import type { PagesFunction } from "@cloudflare/workers-types";

interface Env { API_KEY: string }

export const onRequestGet: PagesFunction<Env> = ({ env }) => new Response(env.API_KEY ? "ok" : "missing");
```

## Development and deployment

- `sinth dev` bundles functions with esbuild on the first request and reloads them when a file changes. Errors are shown in the terminal and in the response.
- `sinth preview` serves the production build together with `functions/`.
- `sinth deploy` uploads `dist/`, and Wrangler compiles `functions/` into Pages Functions.

Functions need a host that runs them. Cloudflare Pages runs them as they are. On purely static hosts (GitHub Pages, S3, nginx), deploy the API separately and call it by its URL.
