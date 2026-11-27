export interface PlaygroundExample {
  id: string
  title: string
  code: string
}

export const EXAMPLES: PlaygroundExample[] = [
  {
    id: 'counter',
    title: 'Counter',
    code: `title = "Counter"

var num count = 0
computed str label = count == 1 ? "time" : "times"

Main {
  Heading(level: 1) { "Hello, Sinth!" }
  Button(onClick: count += 1) { "Clicked " + count + " " + label }
  if count >= 5 {
    Paragraph(class: "note") { "You like clicking." }
  }
}

style {
  main { fontFamily: "system-ui, sans-serif"; padding: "2rem" }
  button { font: "inherit"; padding: "0.5rem 1rem"; borderRadius: "8px"; cursor: "pointer" }
  .note { color: "#7c3aed" }
}
`
  },
  {
    id: 'todos',
    title: 'Todo list',
    code: `title = "Todos"

var str draft = ""
var obj[] todos = [{ text: "Try the playground", done: true }, { text: "Build something", done: false }]
computed num left = todos.filter((t) => not t.done).length

function add() {
  if draft.trim() == "" return
  todos.push({ text: draft.trim(), done: false })
  draft = ""
}

Main {
  Heading(level: 1) { "Todos (" + left + " left)" }
  Form(onSubmit.prevent: add()) {
    Input(model: draft, placeholder: "What needs doing?")
    Button(type: "submit") { "Add" }
  }
  Ul {
    for todo, i in todos {
      Li(class: { done: todo.done }) {
        Checkbox(model: todo.done)
        Span { " " + todo.text + " " }
        Button(ariaLabel: "Remove", onClick: todos.splice(i, 1)) { "×" }
      }
    } else {
      Li { "Nothing to do." }
    }
  }
}

style {
  main { fontFamily: "system-ui, sans-serif"; padding: "2rem"; maxWidth: "32rem" }
  ul { paddingLeft: 0; listStyle: "none" }
  li { padding: "0.25rem 0" }
  .done span { textDecoration: "line-through"; opacity: 0.6 }
}
`
  },
  {
    id: 'components',
    title: 'Components',
    code: `title = "Components"

component Rating(str label, bind value, num max = 5) {
  Div(class: "rating") {
    Span(class: "label") { label }
    for n in range(1, max + 1) {
      Button(class: { on: n <= value }, ariaLabel: n + " stars", onClick: value = n) { "★" }
    }
  }
  style {
    .rating { display: "flex"; alignItems: "center"; gap: "0.25rem" }
    .label { width: "6rem" }
    button { border: "none"; background: "none"; fontSize: "1.5rem"; color: "#d4d4d8"; cursor: "pointer" }
    .on { color: "#f59e0b" }
  }
}

var num taste = 4
var num price = 2

Main {
  Heading(level: 1) { "Rate the pizza" }
  Rating(label: "Taste", value: taste)
  Rating(label: "Price", value: price)
  Paragraph { "Average: " + ((taste + price) / 2) }
}

style {
  main { fontFamily: "system-ui, sans-serif"; padding: "2rem" }
}
`
  },
  {
    id: 'sinth-ui',
    title: 'sinth:ui library',
    code: `import { Button, Card, Columns, Field, Badge, Alert, Modal } from "sinth:ui"

title = "sinth:ui"

var str name = ""
var bool open = false

Main(class: "page") {
  Badge(tone: "accent") { "sinth:ui" }
  Heading(level: 1) { name.trim() ? "Hello, " + name.trim() + "!" : "Hello!" }
  Columns(min: "14rem") {
    Card(title: "Two-way binding") {
      Field(label: "Your name", value: name, placeholder: "Ada Lovelace")
    }
    Card(title: "Dialogs") {
      Button(onClick: open = true) { "Open modal" }
    }
  }
  Alert(tone: "info", title: "Tip") { "Change the theme with CSS variables like --ui-accent." }
  Modal(open: open, title: "Hi " + (name || "there")) {
    Paragraph { "Press Escape or click outside to close." }
  }
}

style {
  .page { padding: "2rem"; maxWidth: "48rem"; margin: "0 auto" }
}
`
  },
  {
    id: 'fetch',
    title: 'Fetching data',
    code: `title = "Users"

var obj[] users = []
var str query = ""
var bool loading = true
var str? error

computed obj[] shown = users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase()))

onMount {
  try {
    const res = await fetch("https://jsonplaceholder.typicode.com/users")
    users = await res.json()
  } catch (e) {
    error = "Could not load users: " + e.message
  }
  loading = false
}

Main {
  Heading(level: 1) { "Users" }
  Input(model: query, placeholder: "Filter by name")
  if loading {
    Paragraph { "Loading..." }
  } elif error {
    Paragraph(class: "error") { error }
  } else {
    Ul {
      for user in shown key user.id {
        Li { Strong { user.name } " · " + user.email }
      } else {
        Li { "No match." }
      }
    }
  }
}

style {
  main { fontFamily: "system-ui, sans-serif"; padding: "2rem" }
  .error { color: "crimson" }
}
`
  },
  {
    id: 'styling',
    title: 'Reactive styles',
    code: `title = "Styles"

var num hue = 265
var num radius = 16
var bool dark = false

Main(class: { dark: dark }) {
  Heading(level: 1) { "Reactive styles" }
  Label { "Hue " Input(type: "range", min: 0, max: 360, model: hue) }
  Label { "Radius " Input(type: "range", min: 0, max: 48, model: radius) }
  Label { Checkbox(model: dark) " Dark" }
  Div(class: "box") { "hsl(" + hue + ", 80%, 60%)" }
}

style {
  main {
    fontFamily: "system-ui, sans-serif"
    padding: "2rem"
    display: "grid"
    gap: "0.75rem"
    minHeight: "100vh"
    boxSizing: "border-box"
  }
  .dark { background: "#111"; color: "#eee" }
  .box {
    padding: "2rem"
    color: "white"
    background: "hsl(" + hue + ", 80%, 60%)"
    borderRadius: radius + "px"
    transition: "border-radius 0.2s"
  }
}
`
  }
]
