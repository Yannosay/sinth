---
title: Shared state (stores)
description: State shared between pages and components.
---

# Shared state (stores)

Top-level variables and functions in a module file are shared by every page and component that imports them:

```sinth
-- stores/cart.sinth
var obj[] items = []
computed num count = items.length

function add(obj product) {
  items.push(product)
}
```

```sinth
import { items, count, add } from "../stores/cart.sinth"

Button(onClick: add({ name: "Shirt" })) { "Add (" + count + ")" }
```

Assignments like `items = []` from the importing file work too.
