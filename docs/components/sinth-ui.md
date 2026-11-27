---
title: The sinth:ui library
description: The built-in component library.
---

# The sinth:ui library

A small, accessible component library that ships with Sinth. It supports light and dark mode automatically.

```sinth
import { Button, Card, Field, Modal } from "sinth:ui"
```

| Component | Parameters |
|---|---|
| `Button` | `variant` (`primary` `secondary` `ghost` `danger`), `size` (`sm` `md` `lg`), `href` (renders a link), `disabled`, `type`, `block` |
| `Card` | `title`, `subtitle`, `interactive`; slot `footer` |
| `Badge` | `tone` (`neutral` `accent` `success` `warning` `danger`) |
| `Alert` | `tone` (`info` `success` `warning` `danger`), `title` |
| `Content` | `width` (`sm` `md` `lg` `full`): centered page column |
| `Columns` | `min` (minimum column width), `gap`: responsive grid |
| `Inline` | `gap`, `align`, `justify`, `wrap`: horizontal row |
| `VStack` | `gap`, `align`: vertical stack |
| `Field` | `label`, `bind value`, `type` (any input type or `textarea`), `placeholder`, `hint`, `error`, `required`, `name` |
| `Toggle` | `bind checked`, `label` |
| `Modal` | `bind open`, `title`, `width`; slot `footer`. Closes on backdrop click and Escape |
| `Avatar` | `name`, `src`, `size`; shows initials without `src` |
| `Spinner` | `size`, `label` |
| `Navbar` | `brand`, `brandHref`; links as children |
| `Divider` | `label` |

Theme it by overriding custom properties:

```sinth
style {
  :root {
    --ui-accent: "#0ea5e9"
    --ui-radius: "6px"
    --ui-font: "'Inter', system-ui, sans-serif"
  }
}
```

Variables: `--ui-bg --ui-surface --ui-surface-2 --ui-text --ui-muted --ui-border --ui-accent --ui-accent-hover --ui-accent-text --ui-success --ui-warning --ui-danger --ui-info --ui-radius --ui-radius-lg --ui-shadow --ui-font --ui-mono`.

The library also sets a light base style for `body`, links and focus rings. The legacy `import SinthUI` imports the whole library.
