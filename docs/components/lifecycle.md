---
title: Lifecycle and watchers
description: onMount, onDestroy and watch.
---

# Lifecycle and watchers

```sinth
onMount {
  const res = await fetch("/api/posts")
  posts = await res.json()
  loading = false
}

onDestroy {
  clearInterval(timer)
}

watch query {
  results = search(value)          -- `value` is the new value, `previous` the old one
}
```

These work at page level and inside components. `onMount` runs once after the page or component is in the DOM. `watch` runs whenever the expression's value changes (arrays and objects are compared by content).
