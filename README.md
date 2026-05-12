# Sinth

The language that fixes HTML. Declarative. Reactive. Compiles to pure HTML.



## Why Sinth?

#### Reactive forms in one line.
```
Input(bind: userName, placeholder: "Enter your name")
Paragraph { "Hello, " + userName }
```

No useState. No onChange. No e.target.value. Just bind.

#### Logic and UI live together.
```TS
if user.isAdmin {
Button(onClick: "deletePost()") { "Delete" }
}
```

No JSX ternaries. No v-if. No separate script tags. Mixed logic. Clean.

#### Animations that make sense.
```ts
for item, index in items {
Paragraph(delay: index * 300) { item.name }
}
```

Staggered animations. One expression. No useEffect. No setTimeout chains.

#### Compiles to pure HTML.
Ready to upload wherever you want.





# Install
npm install -g @yannosay/sinth





## Quick Start
sinth init
sinth dev pages/index.sinth



Open your browser. Edit your .sinth file. Watch it update live.


## Your First Sinth File
```TS
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

## Security

Sinth's reactive runtime does not use eval(). Every expression is pre-compiled into optimized JavaScript functions at build time. No code injection possible. No runtime string evaluation. The most secure way to power reactive UI.

###### Don't trust? -> Ctrl+F "eval(" returns nothing!

## Commands

- sinth init — scaffold a new project
- sinth dev [file] — start dev server with live reload
- sinth build — compile to static files
- sinth check — lint without output
- sinth version — print version



## Links

- GitHub: [Official Sinth Repo](https://github.com/yannosay/sinth)
- Website: [Sinth](https://sinth.yannosay.com) (not active at this moment)
- Discord: [Join here!](https://discord.gg/SUvcrafTQm)



## License

AGPL-3.0