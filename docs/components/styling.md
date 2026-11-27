---
title: Styling
description: Scoped styles, nesting, media queries and reactive values.
---

# Styling

## Style blocks

```sinth
style {
  main {
    maxWidth: "960px"
    margin: "0 auto"
    padding: "2rem"
  }

  Paragraph {                      -- element names become tags: p
    lineHeight: 1.7
    color: "#333"
  }

  .card {
    padding: "1rem"
    onHover { transform: "translateY(-2px)" }   -- &:hover
    before { content: "'→'" }                    -- &::before
    & + & { marginTop: "1rem" }                  -- nesting with &
    .title { fontWeight: 700 }                   -- descendant
  }

  media(maxWidth: "640px") {
    main { padding: "1rem" }
  }

  dark {                           -- @media (prefers-color-scheme: dark)
    body { background: "#0a0a0b"; color: "#f5f5f6" }
  }
}
```

Rules:

- Property names are camelCase (`backgroundColor` → `background-color`, `WebkitUserSelect` → `-webkit-user-select`). Plain CSS names also work.
- Values in quotes are unquoted (`padding: "1rem"` → `padding: 1rem`). For `content`, write the CSS string inside the quotes: `content: "'→'"`.
- Declarations end at a newline or `;`.
- `--` starts a comment, but `--name:` is a CSS custom property.
- Pseudo shorthands: `onHover onFocus onActive onVisited onChecked onDisabled onEnabled onRequired onOptional onValid onInvalid onPlaceholderShown onFocusWithin onFocusVisible onFirst onLast onFirstOfType onLastOfType onEmpty onTarget onLink onOpen`.
- Pseudo-element shorthands: `before after placeholder selection firstLine firstLetter marker backdrop`.
- Media shorthands: `dark light reducedMotion print mobile tablet desktop`, and `media(minWidth: "800px", orientation: "landscape")`.
- All CSS at-rules work: `@keyframes`, `@font-face`, `@supports`, `@container`, `@layer`.

## Scoping

- **Page styles** apply to the whole page.
- **Component styles** are scoped: they only match elements rendered by that component. `.card` inside `Card` cannot leak into other components.
- `style global { ... }` inside a component opts out of scoping.
- `:global(.selector)` escapes scoping for one selector.
- `html`, `body` and `:root` are never scoped.

## Reactive styles

A style value that uses a parameter or variable updates automatically (it compiles to a CSS custom property):

```sinth
component Bar(num percent, str color = "teal") {
  Div(class: "bar") { Div(class: "fill") }
  style {
    .fill {
      width: percent + "%"
      background: color
    }
  }
}
```

## CSS and SCSS

```sinth
style lang="css" { .a { color: red; } }              -- plain CSS
style lang="scss" { $gap: 1rem; .a { margin: $gap } } -- needs: npm install -D sass
import "./styles/theme.scss"                          -- SCSS files too
```
