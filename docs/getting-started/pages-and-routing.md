---
title: Pages and routing
description: Pages, modules, dynamic routes and client-side navigation.
---

# Pages and routing

There are two kinds of `.sinth` files.

**Pages** are the files in `pages/`. They contain metadata, state, markup and styles, and are compiled to one HTML file each (or one per path, for dynamic routes).

**Modules** (files outside `pages/`, usually in `components/`) contain components, functions and shared variables that pages import.

> Sinth 4 required pages to start with the keyword `page`. That keyword has been removed: a file that still starts with it fails with E0104. Delete the line; where a file lives decides whether it is a page.

Order inside a page is flexible, but the usual layout is:

```sinth
import { Card } from "../components/Card.sinth"   -- 1. imports

title = "Home"                                    -- 2. metadata

var str name = "World"                            -- 3. state

function greet(str who) -> str {                  -- 4. functions
  return "Hello, " + who + "!"
}

Main {                                            -- 5. markup
  Heading(level: 1) { greet(name) }
}

style {                                           -- 6. styles
  main { padding: "2rem" }
}
```

## Dynamic routes

Put a parameter name in brackets in a file or folder name to generate many pages from one file. List the values in `paths`; the parameter is then available as a `str` constant:

```sinth
-- pages/blog/[slug].sinth
import posts from "../../content/posts.json"

paths = posts.map((p) => p.slug)
const post = posts.find((p) => p.slug == slug)

title = post.title + " | Blog"
descr = post.summary

Main {
  Heading(level: 1) { post.title }
  Paragraph { post.body }
}
```

With `content/posts.json` holding two posts, the build writes `blog/hello-world.html` and `blog/second-post.html`, each prerendered with its own title and description, and both listed in the sitemap.

Several parameters work too. Then `paths` lists objects:

```sinth
-- pages/[lang]/docs/[page].sinth
paths = [
  { lang: "en", page: "intro" }
  { lang: "de", page: "intro" }
]
```

Rules:

- `paths` is evaluated at build time from literals, constants, imported JSON and functions. Each value must be a non-empty string or number without `/`, `\`, `?` or `#`, and every combination must be unique.
- Interactive dynamic pages share one JavaScript bundle; the current params are embedded as JSON and read at startup, so `slug` works in event handlers too.
- In the dev server every generated page is served at its URL and updates on save.

## File-based routes

| File | URL |
|---|---|
| `pages/index.sinth` | `/` |
| `pages/about.sinth` | `/about` |
| `pages/blog/index.sinth` | `/blog` |
| `pages/blog/[slug].sinth` | `/blog/hello-world`, ... |
| `pages/404.sinth` | shown for unknown URLs |
| `pages/_draft.sinth` | not a page (leading underscore) |

## Layouts

A layout is a component with a `$slot`. Wrap each page in it:

```sinth
-- components/Layout.sinth
component Layout(str current = "/") {
  Header {
    Nav {
      Link(href: "/", ariaCurrent: current == "/" ? "page" : null) { "Home" }
      Link(href: "/about", ariaCurrent: current == "/about" ? "page" : null) { "About" }
    }
  }
  Main { $slot }
  Footer { Small { "Built with Sinth" } }
}
```

```sinth
-- pages/about.sinth
import { Layout } from "../components/Layout.sinth"

title = "About"

Layout(current: "/about") {
  Heading(level: 1) { "About" }
}
```

## Client-side navigation

Links between pages of your site load without a full page reload. When a visitor clicks a link, Sinth fetches the next page's prerendered HTML, updates the title, meta tags and stylesheets, swaps the content and starts the page's interactive code. Pages are prefetched when a link is hovered or focused, so most navigations feel instant.

- Back and forward buttons, scroll positions and `#anchors` work as expected.
- Every page stays a real HTML file: search engines, link previews and visitors without JavaScript get the full page.
- Each page starts with fresh state. State in shared modules ([stores](../components/stores.md)) is kept across pages.
- Links to other origins, links with `target`, `download` or `rel="external"`, and file downloads are left to the browser.

Opt out for one link with `data-reload`, or for the whole site in `sinth.config.json`:

```sinth
Link(href: "/legacy", dataReload: true) { "Old page" }
```

```json
{ "router": false }
```

With `"router": false`, pages without interactivity ship no JavaScript at all.

After each navigation Sinth dispatches a `sinth:navigate` event on `window`, for example for analytics:

```sinth
onMount {
  window.addEventListener("sinth:navigate", (e) => console.log("now at", e.detail.url))
}
```
