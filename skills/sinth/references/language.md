# Sinth language reference (condensed)

Complete docs: https://sinth.yannosay.com/llms-full.txt

## Declarations

```sinth
var num count = 0                 -- reactive state; assigning updates the UI
const str API = "/api"            -- cannot be reassigned
computed num double = count * 2   -- derived, read-only
persist var str theme = "dark"    -- saved in localStorage
var str? nickname                 -- nullable, starts as null
```

Types: `str`, `num`, `bool`, `obj`, `any`, arrays with `[]` (`str[]`, `obj[]`), nullable with `?`. The type may be omitted when there is an initial value.

## Expressions

JavaScript expressions with `and`/`or`/`not`, strict `==`, `f"Hello {name}"` strings, `range(1, 6)`, arrow functions `(x) => x * 2`, and everything in the JS standard library (`fetch`, `Math`, `JSON`, `Intl`, array methods). `$fn(x)` memoizes a call.

## Functions

```sinth
function greet(str name, str greeting = "Hello") -> str {
  return greeting + ", " + name + "!"
}

async function load() {
  try {
    const res = await fetch("/api/items")
    items = await res.json()
  } catch (e) {
    error = e.message
  }
}
```

Calls are checked: missing or extra arguments are compile errors. Named arguments work: `greet(name: "Ada")`.

## Markup

```sinth
Main {
  Heading(level: 1) { "Welcome" }
  Paragraph(class: "lead") { "Hello, " + name }
  Link(href: "/about") { "About" }
  Img(src: "/logo.png", alt: "Logo")
}
```

Attributes: `class` accepts a string, a list or `{ active: on }`; `style` a string or object; CSS properties can be attributes (`color: "gray"`). Special: `model`/`bind`, `ref: el`, `show: cond`, `hide: cond`, `html: trusted`, `key`.

## Events

`onClick: count += 1`, `onClick: save()`, `onClick: (e) => log(e)`, `onInput: q = e.target.value`. Modifiers: `.prevent .stop .once .self .passive .capture`, keys `.enter .esc .space .tab .up .down .left .right .delete`, system keys `.ctrl .shift .alt .meta`.

## Conditionals and loops

```sinth
if loggedIn { Paragraph { "Hi" } } elif loading { Spinner() } else { LoginButton() }
if open persist { Settings() }            -- keep state while hidden
if visible transition("fade") { Toast() } -- fade-enter / fade-leave classes

for item, i in items key item.id { Li { (i + 1) + ". " + item.name } }
for item in items if item.visible { Card(title: item.title) } else { Paragraph { "Nothing here." } }
for n in range(1, 11) { Span { n } }
for value, i, key in settings { Dt { key } Dd { value } }
```

Use `key` when list items are replaced by new objects (for example after a fetch).

## Forms

```sinth
Input(model: name)
Input(type: "number", model: age)
Textarea(model: bio)
Checkbox(model: agree)
Checkbox(value: "cheese", model: toppings)   -- str[] of checked values
Radio(name: "plan", value: "pro", model: plan)
Select(model: plan) { Option(value: "free") { "Free" } Option(value: "pro") { "Pro" } }
```

## Components

```sinth
-- components/Card.sinth
component Card(str title, str? subtitle, str accent = "#7c3aed") {
  Article(class: "card") {
    Heading(level: 3) { title }
    if subtitle { Paragraph { subtitle } }
    $slot
  }
  style {
    .card { borderLeft: "4px solid " + accent; padding: "1rem" }
  }
}

component Toggle(bind checked, str label = "") {   -- bind: writes back to the caller
  Label { Checkbox(model: checked) " " + label }
}
```

Use: `Card(title: "Hello") { Paragraph { "Body" } }`, `Toggle(checked: dark, label: "Dark")`. Parameters are read-only inside the component; copy into a `var` for local state. Named slots: `$slot(name: "footer")` in the component (fallback in braces after it, or `fallback: "..."`), `slot(name: "footer") { ... }` at the call site.

## Lifecycle and watchers

```sinth
onMount {
  const id = setInterval(() => { seconds += 1 }, 1000)
  return () => clearInterval(id)        -- runs when the component is removed
}
onDestroy { console.log("gone") }
watch query { results = search(value) } -- `value` and `previous`
```

## Shared state (stores)

Top-level `var`s and functions in a module file are shared by everything that imports them:

```sinth
-- stores/cart.sinth
var obj[] items = []
computed num count = items.length
function add(obj product) { items.push(product) }
```

## Imports

```sinth
import { Card } from "../components/Card.sinth"
import Card from "/components/Card.sinth"     -- "/" = the source folder (project root or app/)
import { Button, Modal } from "sinth:ui"       -- built-in component library
import confetti from "canvas-confetti"         -- npm packages are bundled
import data from "./data.json"                 -- inlined at build time
import "./styles/reset.css"
import font "Inter:400,600"                     -- Google Fonts
extern Chart                                   -- a global from an external script
```

## Styles

```sinth
style {
  main { maxWidth: "960px"; margin: "0 auto" }
  .card {
    padding: "1rem"
    onHover { transform: "translateY(-2px)" }
    .title { fontWeight: 700 }
  }
  media(maxWidth: "640px") { main { padding: "1rem" } }
  dark { body { background: "#0a0a0b" } }
  .box { background: "hsl(" + hue + ", 80%, 60%)" }   -- reactive values work
}
```

## Metadata

`title`, `descr`, `favicon`, `lang`, `canonical`, `ogImage`, `themeColor`, `robots`, `jsonLd`, ... as `key = value` at the top of a page. Evaluated at build time.

## Routing

Every `.sinth` file in `pages/` is a page: `pages/about.sinth` is `/about`, `pages/blog/index.sinth` is `/blog`, `pages/404.sinth` is the 404 page. Files and folders starting with `_` are not pages. Dynamic routes use brackets and list their values:

```sinth
-- pages/blog/[slug].sinth
import posts from "../../content/posts.json"
paths = posts.map((p) => p.slug)
const post = posts.find((p) => p.slug == slug)
title = post.title
Main { Heading(level: 1) { post.title } }
```

Links between pages navigate instantly (no full reload). Add `dataReload: true` to a link to opt out.
