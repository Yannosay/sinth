---
title: The sinth:ui library
description: The built-in component library.
---

# The sinth:ui library

`sinth:ui` ships with Sinth: 28 components and a `toast()` function for forms, overlays, data and layout, written in Sinth itself. Import only what a file uses: `import { Button, Field, Modal } from "sinth:ui"`. Every component is keyboard accessible, follows the WAI-ARIA pattern for its role, follows the system light or dark mode, and shares one set of sizes, so a page built only from `sinth:ui` looks finished without custom CSS. Theme it with custom properties instead of new CSS:

```sinth
style {
  :root { --ui-accent: "#0ea5e9"; --ui-radius: "6px"; --ui-font: "'Inter', system-ui, sans-serif" }
}
```

Tokens:

| Group | Tokens |
|---|---|
| Color | `--ui-bg --ui-surface --ui-surface-2 --ui-elevated --ui-text --ui-muted --ui-border --ui-border-strong` |
| Accent and status | `--ui-accent --ui-accent-hover --ui-accent-text --ui-success --ui-warning --ui-danger --ui-info` |
| Shape and depth | `--ui-radius --ui-radius-lg --ui-control` (control height) `--ui-ring` (focus ring) `--ui-shadow --ui-shadow-lg` |
| Type and motion | `--ui-font --ui-mono --ui-ease` |

Set them on `:root` for the whole site, or on any element to theme just that part.

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

Inside a `Form`, every field, select and toggle takes its own row with even spacing, and buttons line up side by side after them. No layout wrapper is needed.

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
      Button(variant: "secondary", onClick: confirm = false) { "Cancel" }
      Button(variant: "danger", onClick: confirm = false) { "Delete" }
    }
  }
  Toaster()
}
```

## Size

Components a page does not use are removed from its JavaScript. A `Button` adds almost nothing over a plain button; a page that uses all 28 components, markup included, ships about 11 kB of gzipped JavaScript. The stylesheet is 5.2 kB gzipped and is built once as a shared, content-hashed file (`_sinth/lib-<hash>.css`), so a site downloads it once no matter how many pages use the library. Pages that do not import `sinth:ui` do not load it.

## Using a plain element inside a component

A component named after an element, like a `component Button` in your own library, replaces that element everywhere in its file. Write `Html.Button(...)` when you need the native element anyway; `Html.` works with every built-in element.

The library also sets a light base style for `body`, links and focus rings. The legacy `import SinthUI` imports the whole library.
