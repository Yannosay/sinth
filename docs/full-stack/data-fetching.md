---
title: Fetching data
description: Load data at build time, in the browser, or from your own API.
---

# Fetching data

A Sinth page can get its data at three points. Use the earliest one that has the data.

## At build time

Import JSON, or compute values from constants. The result is part of the prerendered HTML, needs no JavaScript and is indexed by search engines.

```sinth
import posts from "../content/posts.json"

const recent = posts.slice(0, 5)

Main {
  for post in recent {
    Article {
      Heading(level: 2) { post.title }
      Paragraph { post.summary }
    }
  }
}
```

[Dynamic routes](../getting-started/pages-and-routing.md#dynamic-routes) generate one page per item from the same data.

## In the browser

Load data in `onMount`, in an event handler or in an `async function`. The page updates when the promise settles.

```sinth live
var obj[] users = []
var bool loading = true
var str? error

onMount {
  try {
    const res = await fetch("https://jsonplaceholder.typicode.com/users")
    users = await res.json()
  } catch (e) {
    error = "Could not load users"
  }
  loading = false
}

Main {
  if loading {
    Paragraph { "Loading..." }
  } elif error {
    Paragraph(role: "alert") { error }
  } else {
    Ul {
      for user in users key user.id {
        Li { user.name }
      }
    }
  }
}
```

Use `key` when a list is replaced by new objects, so Sinth can reuse the existing elements.

## From your own API

Put server code in [`functions/`](functions.md) and call it with `fetch("/api/...")`. Secrets stay on the server, and the same code runs locally and on Cloudflare Pages.

```sinth
var str draft = ""
var obj[] todos = []

onMount {
  todos = await (await fetch("/api/todos")).json()
}

async function add() {
  const res = await fetch("/api/todos", {
    method: "POST"
    headers: { "content-type": "application/json" }
    body: JSON.stringify({ text: draft })
  })
  todos.push(await res.json())
  draft = ""
}

Main {
  Form(onSubmit.prevent: add()) {
    Input(model: draft)
    Button(type: "submit") { "Add" }
  }
  Ul {
    for todo in todos key todo.id {
      Li { todo.text }
    }
  }
}
```

## Sharing loaded data

Data loaded in a [store](../components/stores.md) module is shared by every page and component that imports it, and is kept during client-side navigation between pages.
