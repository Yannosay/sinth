# Sinth 5.0 - The Declarative Web UI Language

**Release Date:** October 2026  
**Status:** Stable Release

---

## What's New in Sinth 5

Sinth 5 is a complete reimagining of the language, bringing professional-grade tooling, modern developer experience, and production-ready features to the declarative web UI paradigm.

---

## Major Features

### **Full Math & Expression Support**
- All arithmetic operators (`+`, `-`, `*`, `/`, `%`) with correct precedence
- Unary plus/minus, logical operators (`and`, `or`, `not`)
- Comparison operators (`==`, `!=`, `<`, `>`, `<=`, `>=`)
- Ternary expressions (`condition ? true : false`)
- String concatenation and template literals

### **Function System**
- Strongly typed function signatures with return types
- Default parameters and optional arguments
- **Missing parameter detection** - Hard compile errors for missing required arguments
- Recursive functions with proper tail-call handling
- Native JS function integration (`Math.*`, `JSON.*`, `fetch`, `localStorage`, etc.)

### **Complete Built-in Component Library**
| Category | Components |
|----------|------------|
| **Structural** | `Main`, `Header`, `Footer`, `Nav`, `Section`, `Article`, `Aside`, `Div`, `Span`, `Hero`, `Container`, `Grid`, `Flex`, `Stack`, `Row`, `Column`, `CardGrid` |
| **Typography** | `Heading`, `Paragraph`, `Lead`, `Code`, `Pre`, `Blockquote`, `Strong`, `Em`, `Mark`, `Small`, `Time`, `Kbd`, `Samp`, `Var`, `Address` |
| **Interactive** | `Button`, `Link`, `NavLink`, `Input`, `Checkbox`, `Select`, `Textarea`, `Form`, `Fieldset`, `Legend`, `Label`, `Option`, `Optgroup` |
| **Media** | `Img`, `Video`, `Audio`, `Picture`, `Figure`, `Figcaption`, `Canvas`, `Svg`, `IFrame` |
| **Layout** | `Flex`, `Grid`, `Stack`, `Container`, `Row`, `Column`, `CardGrid` |
| **Forms** | `Form`, `Fieldset`, `Legend`, `Label`, `Textarea`, `Datalist`, `Optgroup`, `Progress`, `Meter`, `Output` |

### **State Management & Reactivity**
- **Reactive variables** - `var` declarations auto-trigger re-renders
- **Two-way binding** - `model` attribute for form inputs
- **One-way binding** - `bind` attribute for display-only
- **Computed values** - Derived state that updates automatically
- **Memoization** - `$` prefix for expensive computations (`$expensiveFn()`)

### **Control Flow**
- `if / else if / else` with `persist`, `replace`, `delay`, `hide` modifiers
- `for` loops with `key`, `index` support
- Inline ternary expressions
- Pattern matching via `if/else` chains

### **Styling System**
- **Inline styles** - Dynamic CSS properties as attributes
- **Scoped style blocks** - SCSS with nesting, variables, mixins, functions
- **Global styles** - Import CSS/SCSS files
- **CSS Variables** - Theming with custom properties
- **CSS Layers** - Modern cascade management

---

## **Developer Experience**

### **VSCode Extension** *(NEW!)*
- **Syntax highlighting** - Full TextMate grammar
- **IntelliSense** - Autocomplete for components, types, functions, native APIs
- **Real-time diagnostics** - Type checking on save/change
- **Snippets** - 20+ templates for pages, components, forms, modals, etc.
- **Commands** - Compile, Check, Dev Server from command palette
- **Hover documentation** - Component props and function signatures

```bash
code --install-extension sinth-language-5.0.0.vsix
```

### **Enhanced CLI**
- **Beautiful terminal UI** - Colorized headers, progress steps, byte sizes, durations
- **`sinth build`** - Production builds with minification, shared runtime, inlining
- **`sinth dev`** - Live reload + **Hot Module Replacement (HMR)**
- **`sinth preview`** - Preview production build locally
- **`sinth deploy`** - One-command Cloudflare Pages deployment
- **`sinth check`** - Type-check without emitting
- **`sinth init`** - Interactive project scaffolding (Basic/Full/Blank presets)
- **Config file support** - `sinth.config.json` with env-specific overrides

```json
{
  "outDir": "./dist",
  "libraryPaths": ["./libraries"],
  "minify": false,
  "sharedRuntime": false,
  "port": 3000,
  "development": { "sharedRuntime": true },
  "production": { "minify": true, "inlineJS": true },
  "cloudflare": { "accountId": "...", "projectName": "my-app" }
}
```

### **Hot Module Replacement (HMR)** *(NEW!)*
- **CSS updates** - Instant style injection without reload
- **JS updates** - Dynamic module evaluation
- **File hash tracking** - Only changed content transmitted
- **SSE-based** - Efficient server-sent events
- **Fallback** - Full reload for non-HMR changes

```bash
sinth dev  # Starts with HMR enabled
```

### **Beautiful Error Overlay**
- **Modern design** - Dark theme with animations
- **Syntax highlighted** - Code context with line numbers
- **Actionable** - Dismiss, reload, or fix in editor
- **Keyboard accessible** - Full keyboard navigation
- **Auto-dismiss on fix** - Error clears when code compiles

---

## ☁️ **Deployment**

### **Cloudflare Pages** *(One Command)*
```bash
sinth deploy
# 1. Builds production bundle
# 2. Generates wrangler.toml
# 3. Deploys to Cloudflare Pages
```

### **Any Static Host**
```bash
sinth build --prod
# Outputs to ./dist - deploy anywhere
```

---

## **Migration from Sinth 4**

### Breaking Changes
| Old | New |
|-----|-----|
| `var int` | `var num` (deprecated) |
| `# comments` | `-- comments` |
| `import "./file"` | `import "./file.sinth"` (explicit) |
| `onClick: handler()` | `onClick: handler` (no parens) |

### Migration Steps
```bash
# 1. Update CLI
npm install -g @yannosay/sinth@latest

# 2. Run migration check
sinth check

# 3. Fix reported issues (compiler guides you)
# 4. Update config if needed
# 5. Test with dev server
sinth dev
```

---

## **Documentation**

- **Getting Started** → `/docs/getting-started`
- **Language Reference** → `/docs/fundamentals`
- **Built-in Components** → `/docs/builtins`
- **State Management** → `/docs/state-management`
- **Native Functions** → `/docs/native-functions`
- **Advanced Topics** → `/docs/advanced`
- **CLI Reference** → `/docs/cli`
- **Guides** → `/docs/guides`
- **API Reference** → `/docs/reference`

---
## **Acknowledgments**

Built with <3 by Yannosay

**Special thanks to:**
- Early adopters who tested betas
- VSCode team for excellent extension APIs
- Cloudflare for Pages platform
- Open source community

---

## 📄 **License**

MIT License - Free for personal and commercial use.

---

**Ready to build the future of web UI?**

```bash
npm install -g @yannosay/sinth@latest
sinth init my-app
cd my-app
sinth dev
```

[Sinth Docs](https://sinth.yannosay.com) | [📦 NPM](https://npmjs.com/package/@yannosay/sinth) | [💻 GitHub](https://github.com/yannosay/sinth-language)