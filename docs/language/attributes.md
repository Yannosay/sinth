---
title: Attributes
description: Attributes, classes, styles and directives.
---

# Attributes

```sinth
Link(href: "/about", target: "_blank", rel: "noopener") { "About" }
Input(type: "email", required, placeholder: "you@example.com")
```

- Values are expressions: `disabled: not valid`, `href: "/users/" + user.id`.
- An attribute without a value is `true`: `Input(required)`.
- `false`, `null` and `undefined` remove the attribute.
- Commas between attributes are optional when each is on its own line.
- `ariaLabel` becomes `aria-label`, `dataId` becomes `data-id`; `"aria-label": ...` also works.
- `className` → `class`, `htmlFor` → `for`, `tabIndex` → `tabindex`, and similar React-style names are converted.

## class

```sinth
Div(class: "card")                               -- string
Div(class: ["card", selected ? "active" : ""])  -- list
Div(class: { card: true, active: selected })    -- object toggles
```

## style

```sinth
Div(style: "color: red")
Div(style: { backgroundColor: color, padding: "1rem", opacity: 0.8 })
```

Common CSS properties can also be written directly as attributes:

```sinth
Paragraph(color: "gray", fontSize: "1.2rem", marginTop: "0") { "..." }
```

(`width` and `height` stay real attributes on `Img`, `Video`, `Canvas`, `IFrame`, `Svg` and `Input`.)

## Special attributes

| Attribute | Meaning |
|---|---|
| `model: x` / `bind: x` | two-way binding (see [Binding forms](forms.md)) |
| `value: x` | one-way value |
| `ref: el` | stores the DOM element in variable `el` |
| `hide: cond` | `display: none` while `cond` is true |
| `show: cond` | `display: none` while `cond` is false |
| `delay: ms` | reveals the element after `ms` milliseconds |
| `html: str` | sets trusted inner HTML |
| `level: 1..6` | heading level for `Heading` |
| `key` | reserved for loops |

Lowercase inline handlers like `onclick: "..."` are rejected (E0334); use `onClick:` with a Sinth handler.
