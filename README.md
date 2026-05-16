# Sinth 

The language that fixes HTML. Declarative. Reactive. Compiles to pure HTML.

Find out more: https://www.youtube.com/watch?v=W0tOMTiIF0Q
Discord: [Join here!](https://discord.gg/SUvcrafTQm)


[![npm version](https://img.shields.io/npm/v/@yannosay/sinth)](https://www.npmjs.com/package/@yannosay/sinth)
[![npm downloads](https://img.shields.io/npm/dw/@yannosay/sinth)](https://www.npmjs.com/package/@yannosay/sinth)
[![license](https://img.shields.io/npm/l/@yannosay/sinth)](https://github.com/Yannosay/sinth/blob/main/LICENSE)

## Why Sinth?

#### Reactive forms in one line.
```ts
Input(bind: userName, placeholder: "Enter your name")
Paragraph { "Hello, " + userName }
```

No useState. No onChange. No e.target.value.

```ts
page
title = "Counter"

var int count = 0

Main {
  Heading(level: 1) {count}
  Button(onClick: count = count + 1) {"Increment"}
}
```

#### Logic and UI live together.
```ts
if user.isAdmin {
Button(onClick: "deletePost()") { "Delete" }
}
```

No JSX ternaries. No v-if. No separate script tags. Mixed logic. Clean.

#### Functions - easy as you know it
```ts
page

title = "Full Test"

var str userName = "Sinths User"

function greet(str name) -> str {
  "Hello, " + name
}

function renderHeading(str label) -> ui {
  Heading(level: 2) {
    (label)
  }
}

Div {
  (greet(userName)) + " — welcome back!"
}

(renderHeading(userName))
(renderHeading("This renders!"))
```
or

```ts
page

title = "Checkbox Test"

var bool isAdmin = false

function toggleAdmin() {
  isAdmin = not isAdmin
}

function getStatus() -> str {
  if (isAdmin) {
    return "ON"
  }
  return "OFF"
}

Checkbox(checked: isAdmin, onChange: toggleAdmin(), label: "Admin mode?")

Paragraph {
  "Admin mode is " + (getStatus()) + "! :D"
}
```


#### Animations that make sense.
```ts
for item, index in items {
Paragraph(delay: index * 300) { item.name }
}
```

Staggered animations. One expression. No useEffect. No setTimeout chains.

#### Multiple actions, single handler.
```ts
Button(onClick: show = not show; deleted = true) { "Toggle & Delete" }
Chain statements with ;. No wrapper functions. No script blocks.
```

```ts
if done == true {
    remove "myElement"
}
```
Delete elements for good. No virtual DOM diffing.

Compiles to pure HTML.

#### Ready to upload wherever you want.


# Install
npm install -g @yannosay/sinth





## Quick Start
`sinth init`

`sinth dev pages/index.sinth`



Open your browser. Edit your .sinth file. Watch it update live.


## Your First Sinth File
```ts
page
title = "My Sinth Project"

var str name = "World"

Main {
   var str name = "User"
   Heading(level: 1) { "Hello, " + name }
   Paragraph { "Welcome to Sinth." }
}
```





## Features

- Mixed logic — if, for, and expressions right in your UI
- Two-way binding — Input(bind: variable) in one line
- Reactivity
- Import own Components
- Expression-based delays ("delay: index * 300") for staggered animations
- Object support: var obj with dot notation (user.name)
- Object iteration: for key, value, index in object
- SCSS support: style blocks with scoped CSS
- Tree-shaken output: static pages get zero JS, reactive apps get only what they need
- VS Code extension: full syntax highlighting (search "Sinth" in the marketplace)
- Live reload dev server: sinth dev watches your files
- Self-contained HTML
- \+ more!

###### Nothing you like? Give us feedback on our [Discord Server](https://discord.gg/SUvcrafTQm)!

## Shared Runtime

For multi-page projects, extract helpers into a cached file:
`sinth build --shared-runtime`


This creates a `sinth-runtime.js` file shared across all pages. Each page shrinks to ~25 lines of render logic. The browser caches the helpers once.

Helpful when working on big projects.

## Security

Sinth's reactive runtime does not use eval(). Every expression is pre-compiled into optimized JavaScript functions at build time. No code injection possible. No runtime string evaluation. The most secure way to power reactive UI.

###### Don't trust? -> Ctrl+F "eval(" returns nothing!

## Commands

- sinth init — scaffold a new project
- sinth dev [file] — start dev server with live reload
- sinth build — compile to static files
- sinth build --shared-runtime — build with shared runtime (useful when using a heavier runtime)
- sinth check — lint without output
- sinth version — print version

## Imports

Importing made easy!

```ts
page

import components/MyComponent.sinth as Navbar


Navbar

Main {

}
```

## Links

- GitHub: [Official Sinth Repo](https://github.com/yannosay/sinth)
- Website: [Sinth](https://sinth.yannosay.com) (not active at this moment)
- Discord: [Join here!](https://discord.gg/SUvcrafTQm)
- VS Code Extension: [Download here](https://marketplace.visualstudio.com/items?itemName=YannosayProductions.sinth-vscode)



## License

AGPL-3.0