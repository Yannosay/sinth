# Sinth 5 Reference

The complete guide to the Sinth language, compiler, CLI and tooling. For a quick overview see the [README](./README.md).

- [1. Getting started](#1-getting-started)
- [2. Project structure](#2-project-structure)
- [3. Files, pages and components](#3-files-pages-and-components)
- [4. Comments](#4-comments)
- [5. Page metadata](#5-page-metadata)
- [6. Variables and types](#6-variables-and-types)
- [7. Expressions](#7-expressions)
- [8. Markup](#8-markup)
- [9. Built-in elements](#9-built-in-elements)
- [10. Attributes](#10-attributes)
- [11. Events](#11-events)
- [12. Binding forms](#12-binding-forms)
- [13. Conditionals](#13-conditionals)
- [14. Loops](#14-loops)
- [15. Functions](#15-functions)
- [16. Components](#16-components)
- [17. Slots](#17-slots)
- [18. Lifecycle and watchers](#18-lifecycle-and-watchers)
- [19. Styling](#19-styling)
- [20. Script blocks](#20-script-blocks)
- [21. Imports](#21-imports)
- [22. Shared state (stores)](#22-shared-state-stores)
- [23. The sinth:ui library](#23-the-sinthui-library)
- [24. Custom elements](#24-custom-elements)
- [25. Rendering model and performance](#25-rendering-model-and-performance)
- [26. Security](#26-security)
- [27. The CLI](#27-the-cli)
- [28. Configuration](#28-configuration)
- [29. Dev server](#29-dev-server)
- [30. Building and output](#30-building-and-output)
- [31. Deploying](#31-deploying)
- [32. Editor support](#32-editor-support)
- [33. Programmatic API](#33-programmatic-api)
- [34. Error reference](#34-error-reference)
- [35. Migrating from Sinth 4](#35-migrating-from-sinth-4)
- [36. FAQ](#36-faq)

---

## 1. Getting started

Requirements: Node.js 18.17 or newer.

```bash
npx @yannosay/sinth create my-site
cd my-site
npm install
npm run dev
```

Or install the CLI globally:

```bash
npm install -g @yannosay/sinth
sinth create my-site
```

Open `http://localhost:3000`. Edit `pages/index.sinth` and save; the page updates instantly and keeps its state.

A complete page:

```sinth
title = "Counter"

var num count = 0

Main {
  Heading(level: 1) { "Count: " + count }
  Button(onClick: count += 1) { "Increment" }
}
```

When you are ready:

```bash
npm run build     # optimized production build in dist/
npm run preview   # serve dist/ locally with production headers
npm run deploy    # deploy to Cloudflare Pages
```

## 2. Project structure

```
my-site/
├─ pages/              every .sinth file in here is a page
│  ├─ index.sinth      → /
│  ├─ about.sinth      → /about
│  ├─ 404.sinth        → 404.html (used by Cloudflare Pages and `sinth preview`)
│  ├─ blog/index.sinth → /blog
│  └─ blog/[slug].sinth → /blog/hello-world, /blog/second-post, ... (dynamic route)
├─ components/         reusable components (any folder name works)
├─ public/             copied to the output root as-is (robots.txt, favicon.ico, ...)
├─ assets/             copied to dist/assets/
├─ sinth.config.json   optional configuration
└─ package.json
```

Rules:

- Every `.sinth` file in `pages/` is a page. No keyword or boilerplate is needed.
- Files and folders whose names start with `_` are not pages (use them for drafts and page-local components: `pages/_partials/Hero.sinth`).
- A file in `pages/` that only declares components or functions (no markup, no metadata) is treated as a module, so older projects keep working.
- If there is no `pages/` folder, every `.sinth` file in the project root that contains markup or metadata is a page; `components/`, `lib/`, `styles/`, `assets/` and `public/` are skipped.
- File and folder names in `[brackets]` are [dynamic routes](#dynamic-routes).

## 3. Files, pages and components

There are two kinds of `.sinth` files.

**Pages** are the files in `pages/`. They contain metadata, state, markup and styles, and are compiled to one HTML file each (or one per path, for dynamic routes).

**Modules** (files outside `pages/`, usually in `components/`) contain components, functions and shared variables that pages import.

> Sinth 4 required pages to start with the keyword `page`. That keyword has been removed: a file that still starts with it fails with E0104. Delete the line; where a file lives decides whether it is a page.

Order inside a page is flexible, but the usual layout is:

```sinth
import { Card } from "../components/Card.sinth"   -- 1. imports

title = "Home"                                    -- 2. metadata

var str name = "World"                            -- 3. state

function greet(str who) -> str {                  -- 4. functions
  return "Hello, " + who + "!"
}

Main {                                            -- 5. markup
  Heading(level: 1) { greet(name) }
}

style {                                           -- 6. styles
  main { padding: "2rem" }
}
```

### Dynamic routes

Put a parameter name in brackets in a file or folder name to generate many pages from one file. List the values in `paths`; the parameter is then available as a `str` constant:

```sinth
-- pages/blog/[slug].sinth
import posts from "../../content/posts.json"

paths = posts.map((p) => p.slug)
const post = posts.find((p) => p.slug == slug)

title = post.title + " | Blog"
descr = post.summary

Main {
  Heading(level: 1) { post.title }
  Paragraph { post.body }
}
```

With `content/posts.json` holding two posts, the build writes `blog/hello-world.html` and `blog/second-post.html`, each prerendered with its own title and description, and both listed in the sitemap.

Several parameters work too. Then `paths` lists objects:

```sinth
-- pages/[lang]/docs/[page].sinth
paths = [
  { lang: "en", page: "intro" }
  { lang: "de", page: "intro" }
]
```

Rules:

- `paths` is evaluated at build time from literals, constants, imported JSON and functions. Each value must be a non-empty string or number without `/`, `\`, `?` or `#`, and every combination must be unique.
- Interactive dynamic pages share one JavaScript bundle; the current params are embedded as JSON and read at startup, so `slug` works in event handlers too.
- In the dev server every generated page is served at its URL and updates on save.

## 4. Comments

```sinth
-- line comment
--[
  block comment
  --[ block comments nest ]--
]--
// JavaScript-style line comments also work
/* and block comments */
```

## 5. Page metadata

Metadata is written as `key = value` at the top level of a page. Values are evaluated at build time, so they can use literals, constants, imported JSON and [route params](#dynamic-routes):

```sinth
const str site = "Acme"
title = "Pricing | " + site
descr = f"Plans for teams of every size at {site}"
```

Values that only exist in the browser (`fetch`, `localStorage`, user input) cannot be used in metadata (E0700). A value of `null` or `false` leaves the tag out.

| Key | Output |
|---|---|
| `title` | `<title>`, and `og:title` if not set |
| `descr` / `description` | `<meta name="description">`, and `og:description` if not set |
| `fav` / `favicon` | `<link rel="icon">` (type detected from the extension) |
| `lang` | `<html lang>` (default `en`) |
| `charset` | default `utf-8` |
| `viewport` | default `width=device-width, initial-scale=1` |
| `author`, `keywords`, `robots`, `generator` | `<meta name="...">` |
| `themeColor` | `<meta name="theme-color">` |
| `colorScheme` | `<meta name="color-scheme">` |
| `canonical` | `<link rel="canonical">` |
| `manifest` | `<link rel="manifest">` |
| `appleTouchIcon` | `<link rel="apple-touch-icon">` |
| `base` | `<base href>` |
| `bodyClass`, `htmlClass` | class on `<body>` / `<html>` |
| `ogImage`, `ogUrl`, `ogType`, `ogSiteName`, ... | `<meta property="og:...">` |
| `twitterCard`, `twitterSite`, `twitterImage`, ... | `<meta name="twitter:...">` |

Asset paths (`fav`, `ogImage`, `manifest`, `appleTouchIcon`) are resolved for you: `fav = "assets/logo.png"` or `fav = "./favicon.svg"` become correct root-relative URLs if the file exists in `public/` or a static folder. `twitter:card` defaults to `summary_large_image` when an `ogImage` is present.

## 6. Variables and types

```sinth
var str name = "Sinth"
var num count = 0
var bool open = false
var str[] tags = ["web", "ui"]
var num[] scores = [1, 2, 3]
var obj user = { name: "Ada", age: 36 }
var obj[] todos = [{ text: "Write docs", done: false }]
var str? nickname          -- nullable, starts as null
var any data = null
```

Types: `str`, `num`, `bool`, `obj`, `any`, plus `[]` for arrays and `?` for nullable. `int` still works but is deprecated (use `num`). `ui`, `void` and `fn` are used in function signatures.

The type can be omitted when there is an initial value:

```sinth
var count = 0          -- inferred as num
var name: str = "x"    -- colon syntax also works
```

Uninitialized variables get a default: `""` for `str`, `0` for `num`, `false` for `bool`, `[]` for arrays, `null` for everything else.

### Kinds of declarations

```sinth
var num count = 0                          -- reactive state
const str API = "https://api.example.com"  -- cannot be reassigned
computed num double = count * 2            -- recalculated from other values
persist var str theme = "dark"             -- saved in localStorage
```

- **`var`**: assigning to it updates every place in the UI that uses it.
- **`const`**: assigning to it is a compile error.
- **`computed`**: an expression that stays up to date. It cannot be assigned.
- **`persist var`**: survives reloads (stored in `localStorage` under `sinth:<file>:<name>`).

### Type checking

The compiler catches clear mistakes:

```sinth
var num count = "zero"        -- error E0403: cannot assign str to num
count = "1"                    -- error E0403
if count == "1" { ... }        -- error E0401: cannot compare num and str
count += "1"                   -- error E0400
```

Unknown names are errors with suggestions:

```
error[E0302]: Unknown name 'cuont'
  --> pages/index.sinth:12:20
> 12 |   Paragraph { "Count: " + cuont }
     |                           ^^^^^
  hint: Did you mean 'count'?
```

### Reserved words

JavaScript keywords (`class`, `new`, `default`, ...) and Sinth operators (`and`, `or`, `not`) cannot be used as names. Names starting with `$$` are reserved for the runtime.

## 7. Expressions

Sinth expressions are a safe subset of JavaScript with a few additions.

| Category | Operators |
|---|---|
| Arithmetic | `+ - * / % **` |
| Comparison | `== != < > <= >=` (always strict: `==` compiles to `===`) |
| Logic | `and`, `or`, `not` (also `&&`, `\|\|`, `!`) |
| Nullish | `??`, optional chaining `a?.b`, `a?.[0]`, `f?.()` |
| Conditional | `cond ? a : b` |
| Assignment | `= += -= *= /= %= **= ??= &&= \|\|=`, `x++`, `++x` |
| Other | `typeof`, `await`, `new Date()`, spread `...xs` |

Precedence follows mathematics and JavaScript: `2 + 3 * 4` is `14`, `(2 + 3) * 4` is `20`.

### Strings

```sinth
"double"  'single'
"escapes: \n \t é \u{1F600}"
f"Hello {name}, you have {items.length} items"
`template ${name} literal`
```

`f"..."` strings interpolate any expression in `{...}`. Escape literal braces as `\{` and `\}`.

### Collections

```sinth
[1, 2, 3]
{ name: "Ada", "data-id": 7, [key]: value, ...other }
{ name }                    -- shorthand for { name: name }
```

Objects and arrays may also be separated by newlines instead of commas.

### Calling functions

Everything from JavaScript's standard library is available: `Math.max(a, b)`, `JSON.stringify(x)`, `items.filter((t) => t.done)`, `Date.now()`, `fetch(url)`, `localStorage`, `Intl.NumberFormat`, and so on.

Arrow functions:

```sinth
(x) => x * 2
(a, b) => { return a + b }
async (url) => await fetch(url)
(num x) -> num { return x * 2 }     -- typed form
```

`range()` is built in:

```sinth
range(5)          -- [0, 1, 2, 3, 4]
range(1, 6)       -- [1, 2, 3, 4, 5]
range(10, 0, -2)  -- [10, 8, 6, 4, 2]
```

### Memoized calls

Prefix a call with `$` to cache its result for the same arguments:

```sinth
Paragraph { "fib(30) = " + $fib(30) }
```

## 8. Markup

Markup is a tree of elements. An element is a capitalized name, optional attributes in parentheses and optional children in braces:

```sinth
Main {
  Heading(level: 1) { "Welcome" }
  Paragraph(class: "lead") { "Hello, " + name }
  Hr
  Img(src: "/logo.png", alt: "Logo")
}
```

Children can be:

- **Text**: any expression. Strings, numbers and variables are rendered as text. `null`, `undefined` and `false` render nothing; arrays render as `a, b, c`.
- **Elements and components.**
- **`if`, `for`, `$slot`, local `var` declarations.**
- **Statements** such as assignments (`count = 5`) and `console.log(...)`, which run once when that part of the page is created.

Text is always escaped. To render HTML, see `RawHTML` below.

Several text children on the same line must be joined with `+`:

```sinth
Paragraph { "Hello " + name }    -- good
Paragraph { "Hello " name }      -- error: use '+' to join values
Paragraph {
  "Hello "                        -- good: one child per line
  Strong { name }
}
```

## 9. Built-in elements

Every built-in element maps to an HTML tag.

| Group | Elements |
|---|---|
| Layout | `Main Header Footer Nav Section Article Aside Div Span Search Hgroup` |
| Layout with class | `Hero` (section.hero), `Container`, `Grid`, `Flex`, `Stack`, `Row`, `Column` (div.col), `CardGrid` |
| Text | `Heading`(h1–h6 via `level`), `H1`…`H6`, `Paragraph`/`P`, `Lead`, `SubHeading`, `Small`, `Strong`, `Bold`, `Em`, `Italic`, `Underline`, `Code`, `Pre`, `Blockquote`, `Quote`, `Mark`, `Label`, `Abbr`, `Del`, `Ins`, `Sub`, `Sup`, `Time`, `Kbd`, `Samp`, `Var`, `Cite`, `Dfn`, `Address`, `Data`, `S`, `Ruby`, `Rt`, `Rp`, `Bdi`, `Bdo` |
| Interactive | `Button` (type="button"), `SubmitButton` (type="submit"), `Link`/`A`, `NavLink` (a.nav-link), `Form`, `Input`, `Textarea`, `Select`, `Option`, `Optgroup`, `Checkbox`, `Radio`, `Fieldset`, `Legend`, `Datalist`, `Details`, `Summary`, `Dialog`, `Progress`, `Meter`, `Output`, `Menu` |
| Media | `Img`/`Image`, `Logo`, `Picture`, `Source`, `Track`, `Video`, `Audio`, `Figure`, `Figcaption`, `Canvas`, `IFrame`, `Embed`, `Object`, `Map`, `Area` |
| Lists | `Ul`, `Ol`, `Li`, `List` (ul), `ListItem` (li), `Dl`, `Dt`, `Dd` |
| Tables | `Table`, `Caption`, `Thead`, `Tbody`, `Tfoot`, `Tr`, `Th`, `Td`, `Colgroup`, `Col` |
| SVG | `Svg`, `Path`, `Circle`, `Rect`, `Line`, `Polyline`, `Polygon`, `Ellipse`, `G`, `Use`, `Defs`, `Text`, `TSpan`, `LinearGradient`, `RadialGradient`, `Stop`, `Symbol`, `ClipPath`, `Mask` |
| Other | `Hr`, `Br`, `Wbr`, `Template`, `Slot`, `NoScript` |
| Special | `Fragment` (children without a wrapper), `RawHTML`/`Html` (trusted HTML) |

```sinth
RawHTML(content: "<em>trusted</em>")
Div(html: markdownToHtml(post.body))   -- same, on an element
```

`RawHTML` and `html:` insert unescaped HTML. The compiler warns (W0301) when the content is not a literal. Only use them with content you trust.

## 10. Attributes

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

### class

```sinth
Div(class: "card")                               -- string
Div(class: ["card", selected ? "active" : ""])  -- list
Div(class: { card: true, active: selected })    -- object toggles
```

### style

```sinth
Div(style: "color: red")
Div(style: { backgroundColor: color, padding: "1rem", opacity: 0.8 })
```

Common CSS properties can also be written directly as attributes:

```sinth
Paragraph(color: "gray", fontSize: "1.2rem", marginTop: "0") { "..." }
```

(`width` and `height` stay real attributes on `Img`, `Video`, `Canvas`, `IFrame`, `Svg` and `Input`.)

### Special attributes

| Attribute | Meaning |
|---|---|
| `model: x` / `bind: x` | two-way binding (see [12](#12-binding-forms)) |
| `value: x` | one-way value |
| `ref: el` | stores the DOM element in variable `el` |
| `hide: cond` | `display: none` while `cond` is true |
| `show: cond` | `display: none` while `cond` is false |
| `delay: ms` | reveals the element after `ms` milliseconds |
| `html: str` | sets trusted inner HTML |
| `level: 1..6` | heading level for `Heading` |
| `key` | reserved for loops |

Lowercase inline handlers like `onclick: "..."` are rejected (E0334); use `onClick:` with a Sinth handler.

## 11. Events

Any attribute named `on` + capital letter is an event handler: `onClick`, `onInput`, `onChange`, `onSubmit`, `onKeyDown`, `onMouseEnter`, `onScroll`, `onPointerDown`, and so on (`onDoubleClick` maps to `dblclick`).

A handler can be:

```sinth
Button(onClick: count += 1)                         -- a statement
Button(onClick: count += 1; message = "Clicked")    -- several, separated by ;
Button(onClick: reset)                              -- a function name
Button(onClick: addItem(draft))                     -- a call
Button(onClick: (e) => console.log(e.clientX))      -- an arrow function
Input(onInput: query = e.target.value)              -- `e` / `event` is the DOM event
Button(onClick: if open { open = false } else { open = true })
```

After every handler the UI updates automatically. If the handler returns a promise (an `async` function or `await`), the UI updates again when it settles.

### Modifiers

```sinth
Form(onSubmit.prevent: save())          -- preventDefault()
Button(onClick.stop: select(item))      -- stopPropagation()
Button(onClick.once: init())            -- runs once
Div(onClick.self: close())              -- only when the element itself is clicked
Div(onScroll.passive: track())          -- passive listener
Div(onClick.capture: log())             -- capture phase
Input(onKeyDown.enter: submit())        -- key filters: enter esc space tab up down left right delete
Input(onKeyDown.ctrl.enter: send())     -- system keys: ctrl shift alt meta
```

Modifiers can be combined: `onClick.prevent.stop`.

## 12. Binding forms

`model:` (or its alias `bind:`) keeps a variable and an input in sync:

```sinth
var str name = ""
var num age = 18
var bool agree = false
var str plan = "free"
var str[] toppings = []

Input(model: name, placeholder: "Name")
Input(type: "number", model: age)          -- numbers stay numbers
Input(type: "range", model: age, min: 0, max: 120)
Textarea(model: bio)
Checkbox(model: agree)
Radio(name: "plan", value: "free", model: plan)
Radio(name: "plan", value: "pro", model: plan)
Select(model: plan) {
  Option(value: "free") { "Free" }
  Option(value: "pro") { "Pro" }
}
Checkbox(value: "cheese", model: toppings)  -- array of checked values
Select(multiple: true, model: toppings) { ... }
```

Bindings also work on object fields and array items: `Checkbox(model: todo.done)`, `Input(model: rows[i].name)`.

## 13. Conditionals

```sinth
if loggedIn {
  Paragraph { "Welcome back, " + user.name }
} elif loading {
  Paragraph { "Loading..." }
} else {
  Button(onClick: login()) { "Log in" }
}
```

Parentheses around the condition are optional. `else if` and `elif` are equivalent. Only the active branch exists in the DOM.

Modifiers go between the condition and the block:

```sinth
if open persist { Settings }              -- keep the branch alive while hidden (state, scroll, focus)
if visible delay(300) { Toast }           -- remove it 300ms later (exit animations)
if visible transition("fade") { Toast }   -- adds fade-enter / fade-leave classes
```

With `transition("fade")`, the element gets `fade-enter` when it appears (removed on the next frame) and `fade-leave` before it is removed (after 200ms, or `delay`):

```sinth
style global {
  .fade-enter, .fade-leave { opacity: 0 }
  .toast { transition: "opacity 0.2s" }
}
```

Inline conditionals: `Paragraph { done ? "Done" : "Pending" }`.

## 14. Loops

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

### Keys

Sinth reuses DOM nodes when a list changes. By default object items are matched by identity and primitive items by position. Use `key` when items are replaced by new objects (for example after `fetch`):

```sinth
for user in users key user.id { UserRow(user: user) }
```

In-place changes like `items.push(x)`, `items.splice(i, 1)` or `todo.done = true` update the UI automatically.

## 15. Functions

```sinth
function add(num a, num b) -> num {
  return a + b
}

function greet(str name, str greeting = "Hello") -> str {
  return greeting + ", " + name + "!"
}

async function loadUser(num id) -> obj {
  const res = await fetch("/api/users/" + id)
  return await res.json()
}
```

- Parameters may have types and defaults. Parameter syntax `name: type` also works.
- `-> type` declares the return type; returning the wrong type is an error.
- Calling with missing or too many arguments is a compile error (E0315 / E0314).
- Arguments can be named and given in any order: `greet(greeting: "Hi", name: "Ada")`.
- Function bodies support `var`, `const`, `if`/`elif`/`else`, `for ... in`, `while`, `return`, `break`, `continue`, and single-line `if cond return x`.

Functions can change page state:

```sinth
function addTodo() {
  if draft.trim() == "" { return }
  todos.push({ text: draft.trim(), done: false })
  draft = ""
}
```

### UI functions

A function returning `ui` renders markup and can be called inside markup:

```sinth
function badge(str label, str tone = "info") -> ui {
  Span(class: "badge " + tone) { label }
}

Main {
  badge("New")
  badge("Sale", tone: "danger")
}
```

## 16. Components

```sinth
-- components/Card.sinth
component Card(str title, str? subtitle, str accent = "#7c3aed") {
  Article(class: "card") {
    Heading(level: 3) { title }
    if subtitle { Paragraph(class: "sub") { subtitle } }
    $slot
  }

  style {
    .card {
      borderLeft: "4px solid " + accent
      padding: "1rem"
    }
  }
}
```

```sinth
-- pages/index.sinth
import { Card } from "../components/Card.sinth"

Main {
  Card(title: "Hello", accent: "teal") {
    Paragraph { "Card body" }
  }
}
```

### Parameters

- `str title`: required. Leaving it out is a compile error (E0360).
- `str? subtitle`: optional, `undefined` when omitted.
- `str accent = "#7c3aed"`: optional with a default.
- Parameters are reactive: when the parent passes `title: user.name` and `user.name` changes, the card updates.
- Parameters are read-only inside the component (E0390). Copy them into a `var` if you need local state: `var num value = start`.

### Two-way parameters

Declare a parameter with `bind` to let the component write back to the caller's variable:

```sinth
component Toggle(bind checked, str label = "") {
  Label {
    Checkbox(model: checked)
    label
  }
}

var bool dark = false
Toggle(checked: dark, label: "Dark mode")
```

### Callback parameters

Pass functions down to let children notify parents:

```sinth
component TodoItem(obj todo, onRemove) {
  Li {
    Span { todo.text }
    Button(onClick: onRemove(todo)) { "Remove" }
  }
}

TodoItem(todo: t, onRemove: (x) => remove(x))
```

### Attribute fallthrough

Attributes that are not parameters (like `class`, `id`, `style`, `ariaLabel` or event handlers) are applied to the component's first root element:

```sinth
Card(title: "Hi", id: "intro", class: "wide", onClick: open = true)
```

### Local state, functions and scripts

Each instance has its own state:

```sinth
component Counter(num start = 0) {
  var num n = start

  function reset() {
    n = start
  }

  Button(onClick: n += 1) { "Clicked " + n }
  Button(onClick: reset()) { "Reset" }
}
```

### Recursion

Components can render themselves (for trees). Prerendering stops at 64 levels to protect against infinite recursion.

### Wrapping built-ins

A component may share a name with a built-in element. Inside its own body, the name refers to the HTML element, so you can wrap it:

```sinth
component Button(str variant = "primary") {
  Button(class: "btn btn-" + variant) { $slot }
}
```

## 17. Slots

```sinth
component Panel(str title) {
  Section(class: "panel") {
    Header { $slot(name: "header") { Strong { title } } }
    $slot
    Footer { $slot(name: "footer", fallback: "No footer") }
  }
}

Panel(title: "Settings") {
  Paragraph { "Main content goes to $slot" }
  slot(name: "footer") {
    Button { "Save" }
  }
}
```

- `$slot` renders the default slot (all children that are not inside a `slot(...)` block).
- `$slot(name: "x")` renders a named slot.
- Fallback content is given in braces after `$slot` or with `fallback:`.
- Slot content uses the caller's variables and styles.

## 18. Lifecycle and watchers

```sinth
onMount {
  const res = await fetch("/api/posts")
  posts = await res.json()
  loading = false
}

onDestroy {
  clearInterval(timer)
}

watch query {
  results = search(value)          -- `value` is the new value, `previous` the old one
}
```

These work at page level and inside components. `onMount` runs once after the page or component is in the DOM. `watch` runs whenever the expression's value changes (arrays and objects are compared by content).

## 19. Styling

### Style blocks

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

### Scoping

- **Page styles** apply to the whole page.
- **Component styles** are scoped: they only match elements rendered by that component. `.card` inside `Card` cannot leak into other components.
- `style global { ... }` inside a component opts out of scoping.
- `:global(.selector)` escapes scoping for one selector.
- `html`, `body` and `:root` are never scoped.

### Reactive styles

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

### CSS and SCSS

```sinth
style lang="css" { .a { color: red; } }              -- plain CSS
style lang="scss" { $gap: 1rem; .a { margin: $gap } } -- needs: npm install -D sass
import "./styles/theme.scss"                          -- SCSS files too
```

## 20. Script blocks

Script blocks contain plain JavaScript that shares the page's (or component's) variables:

```sinth
var num ticks = 0

script {
  const timer = setInterval(() => {
    ticks += 1
    sinthRender()
  }, 1000)

  function formatDate(d) {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(d)
  }
}

Paragraph { "Ticks: " + ticks + " · " + formatDate(new Date()) }
```

- Functions and variables declared in a script block can be used from Sinth code.
- Changes made from Sinth handlers update the UI automatically. Changes from timers, callbacks or third-party code need `sinthRender()` (or `sinth.update()`).
- Script syntax errors are reported with the correct `.sinth` line number (E0500).
- `import` statements belong at the top of the `.sinth` file, not inside component scripts.

## 21. Imports

```sinth
-- Sinth modules
import { Card, Badge } from "./components/ui.sinth"   -- named
import { Card as Tile } from "./components/ui.sinth"  -- renamed
import Card from "./components/Card.sinth"            -- default: the component named like the file
import * as UI from "./components/ui.sinth"           -- namespace: UI.Card { ... }
import "./components/Navbar.sinth"                    -- all components of the file
import { Button } from "sinth:ui"                     -- built-in library
import { Chart } from "charts/Chart"                  -- from a library folder (libraryPaths)
import { Map } from "sinth-maps"                      -- npm package with a "sinth" field

-- JavaScript and npm
import confetti from "canvas-confetti"                -- bundled from node_modules
import { format } from "date-fns"
import * as utils from "./utils.js"                   -- .js, .mjs, .ts, .tsx, .jsx
import "./analytics.js"                               -- side effects only

-- Styles
import "./styles/reset.css"
import css "./styles/theme.scss"
import "https://cdn.example.com/lib.css"             -- external stylesheet link

-- Data and fonts
import data from "./data.json"                        -- inlined at build time
import { posts, site } from "./content.json"
import font "Inter:400,600,800"                       -- Google Fonts (with preconnect)

-- External scripts
import "https://cdn.example.com/widget.js" { defer: true }
extern Widget                                          -- declare the global it creates
```

Rules:

- Extensions are optional for `.sinth` files (`./components/Card`).
- Paths starting with `/` are relative to the project root.
- Missing npm packages produce a clear error with the `npm install` command to run.
- Circular imports between `.sinth` files are an error (E0609).
- Importing a name that does not exist lists the available exports (E0602).

### Publishing Sinth components on npm

Add a `sinth` field pointing to your entry file:

```json
{ "name": "sinth-charts", "sinth": "index.sinth" }
```

Users can then write `import { BarChart } from "sinth-charts"`.

## 22. Shared state (stores)

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

## 23. The sinth:ui library

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

## 24. Custom elements

Any component can be exported as a standard web component that works in any HTML page, framework or CMS:

```sinth
-- components/Counter.sinth
component Counter(num start = 0, str label = "Count") as <sinth-counter> {
  var num n = start
  Button(onClick: n += 1) { label + ": " + n }
}
```

`sinth build` writes `dist/elements/sinth-counter.js`, a standalone file with the runtime and the component's CSS:

```html
<script type="module" src="/elements/sinth-counter.js"></script>
<sinth-counter start="5" label="Clicks"></sinth-counter>
```

- Attributes are converted to the parameter types (`num`, `bool`, and `obj`/arrays as JSON).
- Changing an attribute or a property (`el.label = "x"`) updates the element.
- Children of the custom element become its default slot.
- Tag names must be lowercase and contain a dash.
- The Sinth 4 syntax `custom-element Counter(export: <sinth-counter/>) { ... }` still works.

## 25. Rendering model and performance

- **Prerendering**: every page is rendered to static HTML at build time, so content is visible immediately and indexable by search engines.
- **No JavaScript when none is needed**: if a page has no events, bindings, scripts, watchers or values that can only be known in the browser, Sinth ships no JavaScript at all for it.
- **Fine-grained updates**: interactive pages mount a ~5 kB runtime. Each binding is updated only when its value actually changes. Text, attributes and keyed lists are patched in place; nothing is re-rendered with `innerHTML`.
- **Code splitting**: shared code across pages is split into cached chunks, and `<link rel="modulepreload">` tags are added automatically.
- **Static subtrees**: purely static markup inside interactive pages is created from cached templates.
- **Hashed assets**: files in `dist/_sinth/` have content hashes and are served with long-lived caching headers.

The browser runtime is exposed for interop as `window.sinth` (`sinth.update()`, `sinth.schedule()`) and `window.sinthRender()`.

## 26. Security

Sinth is designed to be safe by default.

- **No `eval`**: neither the compiler nor the runtime evaluates strings as code. Build-time prerendering uses an AST interpreter.
- **Escaped output**: all text and attribute values are escaped. Only `RawHTML`/`html:` insert HTML, and the compiler warns when that content is dynamic.
- **No inline handlers**: event handlers are attached with `addEventListener`, so pages work under a strict Content Security Policy without `'unsafe-inline'` scripts. `onclick: "..."` strings are compile errors.
- **URL sanitizing**: dynamic `href`, `src`, `action` and similar attributes that resolve to `javascript:`, `vbscript:` or HTML `data:` URLs are blocked.
- **Security headers**: builds include a `_headers` file (Cloudflare Pages and Netlify format) with a Content Security Policy, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Cross-Origin-Opener-Policy`. External scripts, styles and fonts you import are added to the CSP automatically.
- **Safe dev server**: binds to `127.0.0.1` by default, rejects path traversal and only serves your project's public and static folders.
- **Safe builds**: `sinth build` refuses to empty an output folder it did not create.
- **Safe deploys**: deployment arguments are validated and passed to Wrangler without shell interpolation.

Configure the CSP in `sinth.config.json`:

```json
{ "security": { "csp": "default-src 'self'; img-src * data:" } }
```

Set `"csp": false` to omit it, or `"headers": false` to skip the `_headers` file.

Report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

## 27. The CLI

```
sinth create [name] [--template starter|minimal|blank] [--yes] [--force]
sinth dev     [--port 3000] [--host [address]] [--open]
sinth build   [--out dist] [--no-minify] [--sourcemap]
sinth preview [--port 4000] [--host [address]] [--open]
sinth deploy  [--preview] [--branch name] [--project name] [--create] [--skip-build]
sinth check   [--json]
sinth new page <path> | sinth new component <Name>
sinth info
sinth version
sinth help [command]
```

Every command accepts `--root <dir>` to run against another folder. Aliases: `init` = `create`, `start` = `dev`, `serve` = `preview`.

| Command | What it does |
|---|---|
| `create` | Scaffolds a project. Templates: `starter` (layout, two pages, 404, sinth:ui), `minimal` (one page), `blank` (config only). |
| `dev` | Dev server with hot reload, state preservation and an error overlay. |
| `build` | Production build: prerendering, minification, code splitting, hashed assets, headers, sitemap. |
| `preview` | Serves the build with clean URLs, `_headers` and `404.html`, like Cloudflare Pages. |
| `deploy` | Builds and deploys to Cloudflare Pages through Wrangler. |
| `check` | Type-checks every page and module without writing files. `--json` prints machine-readable diagnostics. |
| `new` | Creates a page (`sinth new page blog/first-post`) or component (`sinth new component ProductCard`). |
| `info` | Prints versions and project settings, useful for bug reports. |

The CLI checks for updates at most once a day (never in CI). Disable with `SINTH_NO_UPDATE_CHECK=1`. Disable colors with `NO_COLOR=1`.

## 28. Configuration

`sinth.config.json` is optional. All options:

```json
{
  "$schema": "./node_modules/@yannosay/sinth/schema/sinth.config.schema.json",
  "outDir": "dist",
  "pagesDir": "pages",
  "publicDir": "public",
  "staticDirs": ["assets"],
  "libraryPaths": ["libraries"],
  "site": "https://example.com",
  "base": "/",
  "minify": true,
  "sourcemap": false,
  "port": 3000,
  "host": "127.0.0.1",
  "previewPort": 4000,
  "target": ["es2020", "chrome90", "firefox90", "safari15", "edge90"],
  "security": { "headers": true, "csp": true },
  "cloudflare": { "projectName": "my-site", "accountId": "…", "productionBranch": "main" },
  "development": { "sourcemap": true },
  "production": { "minify": true }
}
```

| Option | Default | Description |
|---|---|---|
| `outDir` | `dist` | Build output folder |
| `pagesDir` | `pages` | Folder containing pages |
| `publicDir` | `public` | Copied to the output root |
| `staticDirs` | `["assets"]` | Copied to `<outDir>/<name>` |
| `libraryPaths` | `["libraries"]` | Folders searched for bare imports like `"ui/Button"` |
| `site` | none | Public URL; enables `sitemap.xml` and `robots.txt` |
| `base` | `/` | URL prefix when hosting in a subfolder |
| `minify` | `true` in build | Minify JS and CSS |
| `sourcemap` | `true` in dev | Emit source maps |
| `port` / `host` | `3000` / `127.0.0.1` | Dev server address |
| `previewPort` | `4000` | Preview server port |
| `target` | modern browsers | esbuild targets for JS and CSS |
| `security.headers` | `true` | Write `_headers` |
| `security.csp` | `true` | `true` (generated), `false`, or a custom policy string |
| `cloudflare` | `{}` | Deployment settings (see [31](#31-deploying)) |
| `development` / `production` | none | Overrides per mode |

Command-line flags override the config file. Unknown keys produce a warning; wrong types produce an error. The Sinth 4 options `sharedRuntime`, `inlineJS` and `inlineCSS` are accepted and ignored, since splitting and bundling are automatic.

## 29. Dev server

`sinth dev` builds in memory and serves your site:

- **Hot module replacement**: saving a `.sinth` file swaps the page's code without a reload and **keeps your state** (variables, form inputs). CSS-only changes are applied without touching the page. Changes to metadata reload the page.
- **Error overlay**: compile errors appear in the browser with the code frame and a hint, and disappear when fixed. Runtime errors are shown too.
- **Clean URLs**: `/about`, `/about.html` and `/blog/` all work.
- **Static files** from `public/` and your static folders are served directly; changing them reloads the page.
- If the port is busy, the next free port is used.
- `--host` exposes the server on your network (e.g. to test on a phone).

Editor temp files and folders like `node_modules`, `dist` and `.git` are ignored.

## 30. Building and output

`sinth build` produces:

```
dist/
├─ index.html, about.html, blog/index.html, 404.html
├─ _sinth/
│  ├─ index-HASH.js       page entry (only for interactive pages)
│  ├─ index-HASH.css      page styles
│  ├─ chunks/…            shared code
│  └─ assets/…            images and fonts referenced from CSS
├─ elements/…             standalone custom elements
├─ _headers               security and caching headers
├─ sitemap.xml, robots.txt (when "site" is set)
└─ contents of public/ and static folders
```

The output is standard HTML, CSS and JavaScript with no server runtime, so it runs on Cloudflare Pages, Netlify, Vercel, GitHub Pages, S3, nginx or any static host. Pages are written as `about.html`; most hosts serve them at `/about` (on GitHub Pages and nginx, links to `/about.html` or a rewrite rule may be needed).

The build prints every page with its size and whether it ships JavaScript:

```
  /       index.html  2.3 kB  js 5.1 kB  css 8.3 kB
  /about  about.html  1.2 kB  no js      css 8.2 kB
```

## 31. Deploying

### Cloudflare Pages

```bash
npx wrangler@4 login          # once
sinth deploy --create         # first deploy: creates the project
sinth deploy                  # production
sinth deploy --preview        # preview URL
```

Configuration:

```json
{
  "cloudflare": {
    "projectName": "my-site",
    "productionBranch": "main",
    "accountId": "0123456789abcdef0123456789abcdef"
  }
}
```

- `projectName` defaults to your `package.json` name (lowercase letters, numbers and dashes).
- In CI, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` instead of logging in.

Example GitHub Actions workflow:

```yaml
name: Deploy
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx sinth deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### Other hosts

Run `sinth build` and upload `dist/`. On Netlify the `_headers` file is used automatically. Other hosts ignore it, so configure the headers there if you want them.

## 32. Editor support

- **VS Code**: the official extension provides syntax highlighting, completions for elements, attributes, events, modifiers, metadata keys and sinth:ui components, hover documentation, snippets, error checking with `sinth check`, and commands to run the dev server, build and check.
- **Sinth IDE**: a desktop editor with Sinth highlighting, completions, inline diagnostics on save, an integrated terminal, one-click dev/build/deploy actions and managed compiler versions.
- **Other editors**: run `sinth check --json` for diagnostics in any tool.

## 33. Programmatic API

```js
const { loadConfig, Project, buildProject, checkProject, parseSinth } = require("@yannosay/sinth");

const root = process.cwd();
const { config } = loadConfig(root, "production");
const project = new Project(root, config, false);

const result = await buildProject(project, { write: true });
console.log(result.pages.map(p => p.page.route));

const { errors, warnings } = checkProject(project);
const ast = parseSinth(source, "file.sinth");
```

Errors are `SinthError` instances with `code`, `loc` and `diagnostic`; `formatDiagnostic(diagnostic, color)` renders them like the CLI does.

## 34. Error reference

| Code | Meaning |
|---|---|
| E0001 | Invalid character, string or number |
| E0100 | Syntax error |
| E0102 | Reserved word used as a name |
| E0103 | Invalid assignment target |
| E0104 | The removed `page` keyword (delete the line) |
| E0201 | Unknown type |
| E0202 | Name declared twice in the same scope |
| E0210 | `persist` outside page or component state |
| E0301 | Unknown component or element |
| E0302 | Unknown name |
| E0310 | `$slot` outside a component |
| E0311–E0316 | Wrong function or slot arguments (unknown, duplicated, too many, missing, misordered) |
| E0320 | Invalid heading level |
| E0330–E0334 | Invalid element content or attribute (children on void elements, inline `on*` strings, ...) |
| E0340, E0341 | `model`/`ref` without a variable |
| E0350, E0351 | A non-function or a string used as event handler |
| E0360 | Missing required component parameter |
| E0370, E0371 | UI function or component used as a value |
| E0380 | Returning a value from a `void` function |
| E0390–E0394 | Assigning to a parameter, constant, computed value, function or loop variable |
| E0400–E0403 | Type errors |
| E0400 (in a style block) | Invalid style syntax |
| E0402 | SCSS compile error |
| E0500, E0501 | Script block syntax error / `import` inside a component script |
| E0600–E0609 | Import errors (file not found, unknown export, circular import, ...) |
| E0700 | Metadata value can't be computed at build time |
| E0701 | Metadata value is an object or array |
| E0710 | Dynamic route without `paths` |
| E0711 | `paths` is not an array computable at build time |
| E0712 | Invalid, missing or duplicate value in `paths` |
| E0713 | `paths` in a page that is not a dynamic route |
| E0714 | Invalid route parameter name |
| E0800 | Bundling error (e.g. missing npm package) |
| E0801 | Output folder not created by Sinth |
| E0802 | No pages found |
| E0899 | Internal compiler error (please report it) |
| E0900–E0902 | Invalid configuration |
| E1000 | No build to preview |
| E1100–E1105 | Deployment errors |
| E1200–E1202 | Invalid command-line options |
| E1300–E1305 | `new`/`create` errors |
| W0101 | Markup outside a component in a module file |
| W0201 | `int` is deprecated |
| W0301 | Unescaped dynamic HTML |
| W0310 | Unknown component parameter passed to the root element (likely typo) |
| W0401 | `null` assigned to a non-nullable variable |
| W0800 | Bundler warning |

## 35. Migrating from Sinth 4

Most Sinth 4 code compiles unchanged. Things to check:

| Sinth 4 | Sinth 5 |
|---|---|
| `page` at the top of every page | removed: delete the line (E0104). Every file in `pages/` is a page; move pages that lived elsewhere into `pages/` |
| `dist/pages/index.html` | `dist/index.html`: pages are now relative to `pages/` |
| `var int x` | `var num x` (`int` still works with a warning) |
| `==` was loose | `==` is strict: `1 == "1"` is a compile error |
| `"$title"` inside component strings | use the parameter directly: `{ title }` or `f"{title}"` |
| event handler strings like `onClick: "handler"` | `onClick: handler` or `onClick: handler()` (strings are now a compile error, E0351) |
| `for k, v in obj` (key, value) | `for value, index, key in obj` |
| `sharedRuntime`, `inlineJS`, `inlineCSS` | removed: splitting and bundling are automatic |
| `import SinthUI` (CSS only) | still works; it now also provides real components (`sinth:ui`) |
| `sinthRender()` in scripts | still works; usually unnecessary in Sinth handlers |
| `RawHTML(content: ...)` | unchanged; warns when the content is dynamic |
| `fullscreen:` attribute | removed; use `document.documentElement.requestFullscreen()` |

Run `sinth check` after upgrading. It reports every incompatibility with its location.

## 36. FAQ

**Does Sinth need a framework or runtime on the server?**
No. The output is HTML, CSS and JavaScript that any web host can serve.

**Can I use npm packages?**
Yes. Install them and import them. They are bundled and tree-shaken.

**Can I use TypeScript?**
Import `.ts` files directly; they are compiled during bundling. Sinth itself has its own type annotations.

**How do I fetch data?**
In `onMount`, an event handler or an `async function`. The UI updates when the promise settles.

**How do I share layouts?**
Make a `Layout` component with `$slot` and wrap each page in it. The starter template does this.

**Why is my page shipping JavaScript?**
It has an event, binding, script, watcher, lifecycle hook, persisted variable, JS import, or a value that can only be computed in the browser. Pages without these ship none.

**Can I host under a subfolder?**
Set `"base": "/docs/"`.

**Where do I report bugs?**
[github.com/Yannosay/sinth/issues](https://github.com/Yannosay/sinth/issues). Include the output of `sinth info`.
