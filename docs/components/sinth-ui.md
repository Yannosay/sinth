---
title: The sinth:ui library
description: The built-in component library.
---

# The sinth:ui library

`sinth:ui` ships with Sinth: 28 components and a `toast()` function for forms, overlays, data and layout, written in Sinth itself. Import only what a file uses: `import { Button, Field, Modal } from "sinth:ui"`. Every component is keyboard accessible, follows the WAI-ARIA pattern for its role, and supports light and dark mode. Theme with custom properties instead of new CSS:

```sinth
style {
  :root { --ui-accent: "#0ea5e9"; --ui-radius: "6px"; --ui-font: "'Inter', system-ui, sans-serif" }
}
```

Tokens: `--ui-bg --ui-surface --ui-surface-2 --ui-text --ui-muted --ui-border --ui-accent --ui-accent-hover --ui-accent-text --ui-success --ui-warning --ui-danger --ui-info --ui-radius --ui-radius-lg --ui-shadow --ui-font --ui-mono`.

## Actions and feedback

| Component | Parameters |
|---|---|
| `Button` | `variant` (`primary` `secondary` `ghost` `danger`), `size` (`sm` `md` `lg`), `href` (renders a link), `disabled`, `loading` (spinner, disabled, `aria-busy`), `type`, `block` |
| `Dropdown` | `label`, `variant`, `align` (`start` `end`); slot: `Button`/`Link` items. Arrow keys, Escape and outside clicks work |
| `Alert` | `tone` (`info` `success` `warning` `danger`), `title` |
| `Badge` | `tone` (`neutral` `accent` `success` `warning` `danger`) |
| `toast(message, tone, duration)` | function: shows a notification; `duration` 0 keeps it open. Needs one `Toaster(position)` (`bottom-end` `bottom-start` `top-end` `top-start`) |
| `Tooltip` | `text`, `placement` (`top` `bottom`); slot: the trigger |
| `Spinner` | `size`, `label` |
| `ProgressBar` | `value` (omit for indeterminate), `max`, `label` |
| `Skeleton` | `width`, `height`, `radius` |
| `EmptyState` | `title`, `description`; slot: actions |

## Forms

| Component | Parameters |
|---|---|
| `Field` | `label`, `bind value`, `type` (any input type or `textarea`), `placeholder`, `hint`, `error`, `required`, `disabled`, `name`, `autocomplete` |
| `Select` | `label`, `bind value`, `options` (strings or `{ value, label }`), `placeholder`, `hint`, `error`, `required`, `disabled`, `name` |
| `Toggle` | `bind checked`, `label`, `disabled` |

`hint` and `error` are linked to the control with `aria-describedby`; `error` also sets `aria-invalid`.

## Overlays and disclosure

| Component | Parameters |
|---|---|
| `Modal` | `bind open`, `title`, `width`, `dismissible` (default true); slot `footer`. Traps focus, restores it on close, locks page scroll, closes on Escape and backdrop click |
| `Tabs` | `tabs` (labels), `bind selected` (index); slot: one element per tab, in order. Arrow keys, Home and End |
| `Accordion` | `title`, `open`; built on `<details>`, works without JavaScript |

## Data and navigation

| Component | Parameters |
|---|---|
| `Table` | `columns` (`{ key, label, align: "end" }`), `rows`, `caption`, `sortable`, `empty`, `striped` |
| `Pagination` | `bind page` (1-based), `total`, `label` |
| `Breadcrumbs` | `items` (`{ label, href }`, the last is the current page) |
| `Navbar` | `brand`, `brandHref`; links as children, slot `brand` |
| `Avatar` | `name`, `src`, `size`; initials without `src` |
| `Kbd` | keyboard key, e.g. `Kbd { "Ctrl" }` |

## Layout

| Component | Parameters |
|---|---|
| `Content` | `width` (`sm` `md` `lg` `full`): centered page column |
| `Columns` | `min` (minimum column width), `gap`: responsive grid |
| `Inline` | `gap`, `align`, `justify`, `wrap`: horizontal row |
| `VStack` | `gap`, `align`: vertical stack |
| `Card` | `title`, `subtitle`, `interactive`; slot `footer` |
| `Divider` | `label` |

## Example: a settings page

```sinth live
import { Button, Content, Field, Select, Toggle, Modal, Toaster, toast } from "sinth:ui"

var str name = ""
var str plan = "free"
var bool newsletter = true
var bool confirm = false

Content(width: "sm") {
  Heading(level: 1) { "Settings" }
  Form(onSubmit.prevent: toast("Saved", "success")) {
    Field(label: "Name", value: name, required: true)
    Select(label: "Plan", value: plan, options: [{ value: "free", label: "Free" }, { value: "pro", label: "Pro" }])
    Toggle(checked: newsletter, label: "Product updates by email")
    Button(type: "submit") { "Save" }
    Button(variant: "danger", onClick: confirm = true) { "Delete account" }
  }
  Modal(open: confirm, title: "Delete account?") {
    Paragraph { "This cannot be undone." }
    slot(name: "footer") {
      Button(variant: "danger", onClick: confirm = false) { "Delete" }
    }
  }
  Toaster()
}
```

## Size

Components a page does not use are removed from its JavaScript: a page with one `Button` adds 1.5 kB gzipped, a page using every component 7.7 kB. The stylesheet is 3.8 kB gzipped, shared and cached across pages.

The library also sets a light base style for `body`, links and focus rings. The legacy `import SinthUI` imports the whole library.
