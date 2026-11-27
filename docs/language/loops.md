---
title: Loops
description: for loops, keys, filters and empty states.
---

# Loops

```sinth
for fruit in fruits {
  Li { fruit }
}

for (todo, i in todos) key todo.id {
  Li { (i + 1) + ". " + todo.text }
}

for item in items if item.visible {     -- inline filter
  Card(title: item.title)
} else {                                 -- shown when nothing is rendered
  Paragraph { "Nothing here yet." }
}

for n in range(1, 11) { Span { n } }
for value, i, key in settings { Dt { key } Dd { value } }   -- objects and Maps
```

A loop declares up to three names: **item**, **index** and **key**. For arrays the key equals the index; for objects it is the property name; for `Map`s it is the map key.

## Keys

Sinth reuses DOM nodes when a list changes. By default object items are matched by identity and primitive items by position. Use `key` when items are replaced by new objects (for example after `fetch`):

```sinth
for user in users key user.id { UserRow(user: user) }
```

In-place changes like `items.push(x)`, `items.splice(i, 1)` or `todo.done = true` update the UI automatically.
