# ![Sinth Repo Cover](/.github/assets/sinth_repo_cover.png)

[![npm version](https://img.shields.io/npm/v/@yannosay/sinth?color=6366f1&label=&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth)
[![npm downloads](https://img.shields.io/npm/dw/@yannosay/sinth?color=818cf8&label=&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth)
[![license](https://img.shields.io/npm/l/@yannosay/sinth?color=a78bfa&label=&style=for-the-badge)](https://github.com/yannosay/sinth/blob/main/LICENSE)

<br>

[![Commits](https://img.shields.io/github/commit-activity/m/yannosay/sinth?color=a78bfa&style=for-the-badge)](https://github.com/yannosay/sinth/commits)
[![PRs](https://img.shields.io/github/issues-pr-raw/yannosay/sinth?color=818cf8&style=for-the-badge)](https://github.com/yannosay/sinth/pulls)

The language that makes HTML feel SO easy. Declarative. Reactive. Compiles to pure HTML.


* Introduction: https://www.youtube.com/watch?v=W0tOMTiIF0Q
* Discord: [Join here!](https://discord.gg/SUvcrafTQm)
* Documentation: [sinth.yannosay.com/docs](https://sinth.yannosay.com/docs) (HIGHLY WIP, not yet finished at all!)

#### Try out Sinth directly in Web! (BETA. Uses an older version of Sinth.)

```html
<div id="app"></div>
<script src="https://lib.yannosay.com/sinth.js/sinth.js"></script>
<script type="text/sinth">
page
title = "Counter"
var int count = 0

Main {
  Heading(level: 1) {count}
  Button(onClick: count = count + 1) {"Increment"}
}

$entry-point("app")
</script>
```


## Why Sinth?

#### Reactive forms in one line.
```ts
Input(bind: userName, placeholder: "Enter your name")
Paragraph { "Hello, " + userName }
```

No useState, onChange or e.target.value.

```ts
page
title = "Counter"

var int count = 0

Main {
  Heading(level: 1) {count}
  Button(onClick: count += 1) {"Increment"}
}
```

#### Declare your own HTML tags

```ts
custom MyCounter(export: <awesome-counter />) {
  var int count = 0
  Button(onClick: count += 1) { count }
}
```

then you can use it in non-sinth HTML projects

```html
<awesome-counter />
<script src="awesome-counter.js"></script>
```

#### Logic and UI live together.
```ts
if user.isAdmin {
Button(onClick: "deletePost()") { "Delete" }
}
```

No JSX ternaries or v-if or separate script tags. Mixed logic there where you need it.

#### Sinth Language Syntax Reference

| Syntax                                          | Description                                    |
|-------------------------------------------------|------------------------------------------------|
| `--` or --[Hello]--                             | Comment                                        |
| `page`                                          | Declares a full Sinth page                     |
| `title = "..."`                                 | Sets the page title                            |
| `function myFunction`                           | Creates a reusable & reactive function         |
| `var str myVar = ""`                            | Declares a string variable                     |
| `var int myVar`                                 | Declares an integer variable                   |
| `var bool myVar`                                | Declares a boolean variable                    |
| `var str[] myVar`                               | Declares a string array                        |
| `var obj myVar`                                 | Declares an object variable                    |
| `import "./file.sinth"`                         | Imports another Sinth file                     |
| `import css "./file.css"`                       | Imports a CSS file                             |
| `import js "./file.js"`                         | Imports a JS file                              |
| `Heading(level: 1) { "..." }`                   | Renders a heading (h1-h6)                      |
| `Paragraph { "..." }`                           | Renders a paragraph                            |
| `Button(onClick: fn) { "..." }`                 | Renders a clickable button                     |
| `Input(bind: myVar)`                            | Renders a bound input field                    |
| `Checkbox(checked: myBool)`                     | Renders a checkbox                             |
| `if condition { ... }`                          | Conditional rendering                          |
| `if condition { ... } else { ... }`             | Conditional with else branch                   |
| `for item in array { ... }`                     | Loops over an array                            |
| `for item, index in array { ... }`              | Loops with index                               |
| `delay: ms`                                     | Delays rendering of an element                 |
| `hide: bool`                                    | Conditionally hides an element                 |
| `style { ... }`                                 | Defines scoped CSS styles                      |
| `script { ... }`                                | Defines page-level JavaScript                  |
| `component MyComp { ... }`                      | Defines a reusable component                   |
| `custom el "my-tag" { ... }`                    | Defines a custom element                       |
| `custom MyCounter(export: <awesome-counter />)` | Exports a custom element tag                   |
| `$myFunction()` (e.g. `$alert("displayed once")`)| Indicator for Memorization - Useful for functions that should only show once |


#### Functions - easy as you know it
```ts
page

title = "Functions"

var str userName = "Sinth User"

function greet(str name) -> str {
  "Hello, " + name
}

function renderHeading(str label) -> ui {
  Heading(level: 2) {
    (label)
  }
}

Div {
  greet(userName) + " - welcome back!"
}

renderHeading(userName)
renderHeading("This renders!")
```
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

Checkbox(checked: isAdmin label: "Admin mode?")

Paragraph {
  "Admin mode is " + getStatus() + "!"
}
```
#### Code what you need
```ts
page
title = "For Loop Variable Test"

var obj historyList = []
var int kickCount = 0
var str userName = ""
var obj newList = []
var int i = 0

function kickUser() {
    if userName != "" {
        historyList.push(userName)
        kickCount = kickCount + 1
        userName = ""
    }
}

function removeUser(index) {
    newList = []
    i = 0
    for user in historyList {
        if i != index {
            newList.push(user)
        }
        i = i + 1
    }
    historyList = newList
    kickCount = kickCount - 1
}

Main {
    Heading(level: 1) { "For Loop Test" }
    
    Input(bind: userName, placeholder: "Enter username to kick")
    Button(onClick: kickUser()) { "Add User" }
    
    Paragraph { "Count: " + kickCount }
    
    Heading(level: 2) { "Users:" }
    for kickedUser, index in historyList {
        Paragraph { kickedUser }
        Button(onClick: removeUser(index)) { "Remove" }
    }
}
```


#### Fullscreen activation + if-else inside Component

```ts
page
title = "Fullscreen"

var bool isFullscreen = false
var str userName = ""

Main {
    Button(onClick: isFullscreen = !isFullscreen, fullscreen: isFullscreen) {
        if isFullscreen {
            "Exit Fullscreen"
        } else {
            "Enter Fullscreen"
        }
    }
    Input(bind: userName)
    Paragraph {
        if userName == "Sinth" {
            "Oh, welcome back!"
        } else {
            "Hello, " + userName + "!"
        }
    }
}
```

#### Fullscreen Sync

Opt-in Escape key handling. `fullscreenSync` keeps your variable in sync with the browser's fullscreen state.

```ts
Button(onClick: isFullscreen = !isFullscreen, fullscreen: isFullscreen, fullscreenSync: isFullscreen) {
    if isFullscreen { "Exit Fullscreen" } else { "Enter Fullscreen" }
}
```
Without fullscreenSync, pressing Escape exits fullscreen but the variable stays true.
With it, Escape resets the variable to false and the button text updates automatically.

#### Opt-in DOM Diffing

Skip re-executing expressions when their variables haven't changed. Perfect for expensive calculations or side effects you only want to fire once. No one

```ts
page
domdiffing = true  -- enables expression memoization

var int count = 0

Main {
  Heading(level: 1) { count }
  (alert("Fires only once!"))  -- no dependencies, runs once and never again
  Button(onClick: count += 1) { "Increment" }
}
```
Count updates every click because count changed. The alert fires only on page load — zero dependencies means it's cached forever. Just a meta flag.

#### Animations that make sense.
```ts
page

var str[] items = ["First", "Second", "Third", "Fourth", "Fifth"]

for item, index in items {
  Paragraph(delay: (index + 1) * 1000) { item }
}
```

Staggered animations. One expression. No useEffect. No setTimeout chains.

#### Multiple actions, single handler.
```ts
Button(onClick: show = not show; deleted = true) { "Toggle & Delete" }
Chain statements with ;. No wrapper functions. No script blocks.
```

```ts
page

title = "Remove Test"

var bool show = true
var bool deleted = false

Main {
  Button(onClick: show = not show) {
    if show { "Hide Box" } else { "Show Box" }
  }
  
  Button(onClick: remove("my-box"); deleted = true) {
    "Delete Box Forever"
  }
  
  if show and not deleted {
    Div(id: "my-box") {
      Paragraph { "I'm a box!" }
    }
  }
}

```
Delete elements. Easy.

Compiles to pure HTML.

#### Reactivity at its finest
```ts
page
title = "Reactivity but easy"

var str begForFullscreen = ""
var bool doFullscreen = false

Main {
    Input(bind: begForFullscreen, fullscreen: doFullscreen) 
    if begForFullscreen == "do fullscreen pls!!" {
        doFullscreen = true
    } else {
        doFullscreen = false
    }
}
```



```ts
page
title = "Counter Demo"

var int count = 0
var int addVar = 1
var int stepSize = 1

Main {
  Heading(level: 1) {count}
  
  Paragraph {"Increment by:"}
  Input(bind: addVar, step: stepSize)
  
  Br()
  Button(onClick: count = count + addVar) {"Increment"}
  
  Br()
  Br()
  Paragraph {"Step size for arrows:"}
  Input(bind: stepSize, step: 1)
}
```
##### NEW! (0.14.0): 
Sinth now supports Reactivity in Functions!
```ts
page
title = "Reactive Counter"

var int apples = 1
var int bananas = 2
var int oranges = -6

function Counter(int value) -> ui {
  Heading(level: 1) {"Count is at: " + (value) + "!"}
  Button(onClick: value = value + 1) {"Increment"}
}

Main {
  Counter(apples)
  Counter(bananas)
  Counter(oranges)
}
```

## Use in real life
```ts
page

title = "Kick Users Admin Panel"

var str userName = "test username"
var int count = 0

style lang= "scss"{
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  
  * {
    font-family: 'Inter', sans-serif;
  }
}

Main {
  Div(display: "flex", flexDirection: "column", gap: "16px", alignItems: "center", padding: "40px", fontFamily: "Inter") {
    Heading(level: 1, fontSize: "28px", color: "#000000", fontWeight: "700") {
      "Kick Counter: " + count
    }
    Div(display: "flex", gap: "12px", alignItems: "center") {
      Input(
        bind: userName,
        padding: "10px 14px",
        fontSize: "16px",
        borderRadius: "8px",
        border: "2px solid #6366f1",
        outline: "none",
        width: "250px",
        backgroundColor: "#1e1b4b",
        color: "#e0e7ff",
        fontWeight: "400"
      )
Button(
  onClick: alert("Kicked: " + userName); console.log("User kicked"); count += 1,
  padding: "10px 20px",
  fontSize: "16px",
  fontWeight: "600",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#6366f1",
  color: "#ffffff",
  cursor: "pointer",
  minWidth: "180px",
  textAlign: "left"
) {
  "Kick " + userName
}
    }
    Paragraph(fontSize: "14px", color: "#a5b4fc", fontWeight: "400") {
      "Total kicks: " + count
    }
  }
}
```

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


Main {
   var str nameVar = "User"
   Heading(level: 1) { "Hello, " + nameVar }
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
- Website: [Sinth](https://sinth.yannosay.com) (Note: Deep in development; documentation and various other aspects are not yet finalized.)
- Discord: [Join here!](https://discord.gg/SUvcrafTQm)
- VS Code Extension: [Download here](https://marketplace.visualstudio.com/items?itemName=YannosayProductions.sinth-vscode)



## License

AGPL-3.0 (Just the compiler, the generated Output is 100% yours)