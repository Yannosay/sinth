export interface ElementDoc {
  name: string;
  tag: string;
  note?: string;
}

const el = (name: string, tag: string, note?: string): ElementDoc => ({ name, tag, note });

export const ELEMENTS: readonly ElementDoc[] = [
  el("Main", "main"), el("Header", "header"), el("Footer", "footer"), el("Nav", "nav"), el("Section", "section"),
  el("Article", "article"), el("Aside", "aside"), el("Div", "div"), el("Span", "span"), el("Search", "search"),
  el("Hero", "section", "class \"hero\""), el("Container", "div", "class \"container\""), el("Grid", "div", "class \"grid\""),
  el("Flex", "div", "class \"flex\""), el("Stack", "div", "class \"stack\""), el("Row", "div", "class \"row\""),
  el("Column", "div", "class \"col\""), el("CardGrid", "div", "class \"card-grid\""),
  el("Heading", "h1-h6", "set level: 1..6"), el("H1", "h1"), el("H2", "h2"), el("H3", "h3"), el("H4", "h4"), el("H5", "h5"), el("H6", "h6"),
  el("Paragraph", "p"), el("P", "p"), el("Lead", "p", "class \"lead\""), el("SubHeading", "p", "class \"subheading\""),
  el("Small", "small"), el("Strong", "strong"), el("Bold", "b"), el("Em", "em"), el("Italic", "i"), el("Underline", "u"),
  el("Code", "code"), el("Pre", "pre"), el("Blockquote", "blockquote"), el("Quote", "q"), el("Mark", "mark"), el("Label", "label"),
  el("Abbr", "abbr"), el("Del", "del"), el("Ins", "ins"), el("Sub", "sub"), el("Sup", "sup"), el("Time", "time"), el("Kbd", "kbd"),
  el("Samp", "samp"), el("Var", "var"), el("Cite", "cite"), el("Address", "address"),
  el("Button", "button", "type=\"button\" by default"), el("SubmitButton", "button", "type=\"submit\""), el("Link", "a"), el("A", "a"),
  el("NavLink", "a", "class \"nav-link\""), el("Form", "form"), el("Input", "input"), el("Textarea", "textarea"), el("Select", "select"),
  el("Option", "option"), el("Optgroup", "optgroup"), el("Checkbox", "input", "type=\"checkbox\""), el("Radio", "input", "type=\"radio\""),
  el("Fieldset", "fieldset"), el("Legend", "legend"), el("Datalist", "datalist"), el("Details", "details"), el("Summary", "summary"),
  el("Dialog", "dialog"), el("Progress", "progress"), el("Meter", "meter"), el("Output", "output"), el("Menu", "menu"),
  el("Img", "img"), el("Image", "img"), el("Logo", "img", "class \"logo\""), el("Picture", "picture"), el("Source", "source"),
  el("Track", "track"), el("Video", "video"), el("Audio", "audio"), el("Figure", "figure"), el("Figcaption", "figcaption"),
  el("Canvas", "canvas"), el("IFrame", "iframe"), el("Embed", "embed"), el("Object", "object"),
  el("Svg", "svg"), el("Path", "path"), el("Circle", "circle"), el("Rect", "rect"), el("Line", "line"), el("Polyline", "polyline"),
  el("Polygon", "polygon"), el("Ellipse", "ellipse"), el("G", "g"), el("Use", "use"), el("Defs", "defs"), el("Text", "text"),
  el("Ul", "ul"), el("Ol", "ol"), el("Li", "li"), el("List", "ul"), el("ListItem", "li"), el("Dl", "dl"), el("Dt", "dt"), el("Dd", "dd"),
  el("Table", "table"), el("Caption", "caption"), el("Thead", "thead"), el("Tbody", "tbody"), el("Tfoot", "tfoot"), el("Tr", "tr"),
  el("Th", "th"), el("Td", "td"), el("Colgroup", "colgroup"), el("Col", "col"),
  el("Hr", "hr"), el("Br", "br"), el("Wbr", "wbr"), el("Template", "template"), el("NoScript", "noscript"),
  el("Fragment", "(none)", "groups children without a wrapper element"),
  el("RawHTML", "(raw HTML)", "renders trusted HTML from content: (unescaped)"),
];

export interface UiComponent {
  params: string[];
  doc: string;
}

export const SINTH_UI: Readonly<Record<string, UiComponent>> = {
  Button: { params: ["variant", "size", "href", "disabled", "type", "block"], doc: "variant: primary | secondary | ghost | danger · size: sm | md | lg · href renders a link" },
  Card: { params: ["title", "subtitle", "interactive"], doc: "Card with optional title and a `footer` slot" },
  Badge: { params: ["tone"], doc: "tone: neutral | accent | success | warning | danger" },
  Alert: { params: ["tone", "title"], doc: "tone: info | success | warning | danger" },
  Content: { params: ["width"], doc: "Centered column. width: sm | md | lg | full" },
  Columns: { params: ["min", "gap"], doc: "Responsive grid; min is the minimum column width" },
  Inline: { params: ["gap", "align", "justify", "wrap"], doc: "Horizontal flex row" },
  VStack: { params: ["gap", "align"], doc: "Vertical stack" },
  Field: { params: ["label", "value", "type", "placeholder", "hint", "error", "required", "name"], doc: "Labeled input. `value` is two-way bound" },
  Toggle: { params: ["checked", "label"], doc: "Switch. `checked` is two-way bound" },
  Modal: { params: ["open", "title", "width"], doc: "Dialog. `open` is two-way bound; closes on backdrop click and Escape" },
  Avatar: { params: ["name", "src", "size"], doc: "Image or initials" },
  Spinner: { params: ["size", "label"], doc: "Loading indicator" },
  Navbar: { params: ["brand", "brandHref"], doc: "Sticky navigation bar; links go in the children" },
  Divider: { params: ["label"], doc: "Horizontal rule, optionally labeled" },
};

export const TYPES: readonly string[] = ["str", "num", "bool", "obj", "any", "ui", "void", "fn"];

export const KEYWORD_DOCS: Readonly<Record<string, string>> = {
  page: "Optional since Sinth 5: every file in pages/ is already a page. Still accepted, and forces a page anywhere.",
  import: "Imports components, stores, npm packages, CSS, JSON or fonts.\n\n`import { Card } from \"./components/Card.sinth\"`",
  from: "Source of an import.",
  extern: "Declares a browser global created by an external script: `extern Chart`.",
  var: "Reactive variable: `var num count = 0`. Changing it updates the UI.",
  const: "Constant: `const str API = \"https://...\"`.",
  computed: "Derived value that stays up to date: `computed num total = price * qty`.",
  persist: "Saves a variable in localStorage: `persist var str theme = \"dark\"`.",
  component: "Reusable UI: `component Card(str title) { ... }`.",
  function: "Typed function: `function add(num a, num b) -> num { return a + b }`.",
  async: "Marks a function as asynchronous so it can use `await`.",
  await: "Waits for a promise. The UI updates when it settles.",
  if: "Conditional markup or statement. Modifiers: `persist`, `delay(ms)`, `transition(\"name\")`.",
  elif: "Else-if branch.",
  else: "Else branch, also usable after `for` for an empty state.",
  for: "Loop: `for item, index, key in list key item.id if item.visible { ... }`.",
  in: "Separates loop variables from the list.",
  key: "Identity of loop items: `for u in users key u.id { ... }`.",
  watch: "Runs when a value changes: `watch query { results = search(value) }`.",
  onMount: "Runs once after the page or component is shown.",
  onDestroy: "Runs when the component is removed.",
  bind: "In component parameters, `bind value` makes the parameter two-way bindable.",
  return: "Returns a value from a function.",
  style: "Style block. `style global { }` disables scoping, `style lang=\"scss\" { }` enables SCSS.",
  script: "Plain JavaScript that shares the page's variables.",
  and: "Logical AND.",
  or: "Logical OR.",
  not: "Logical NOT.",
};

export const META_KEYS: Readonly<Record<string, string>> = {
  title: "Page title (also og:title)",
  descr: "Meta description (also og:description)",
  fav: "Favicon path, resolved from public/ or assets/",
  lang: "Document language (default \"en\")",
  author: "Meta author",
  keywords: "Meta keywords",
  robots: "Meta robots, e.g. \"noindex\"",
  themeColor: "Browser theme color",
  colorScheme: "Supported color schemes",
  canonical: "Canonical URL",
  manifest: "Web app manifest",
  appleTouchIcon: "Apple touch icon",
  ogImage: "Social preview image",
  ogUrl: "Canonical URL for social previews",
  twitterSite: "Twitter/X handle of the site",
  bodyClass: "Class added to <body>",
  htmlClass: "Class added to <html>",
  viewport: "Viewport meta (has a sensible default)",
  base: "<base href>",
  paths: "Dynamic routes only (pages/blog/[slug].sinth): the values to generate, e.g. paths = posts.map((p) => p.slug)",
};

export const DIRECTIVES: Readonly<Record<string, string>> = {
  model: "Two-way binding to a variable, object field or array item",
  bind: "Two-way binding (alias of model)",
  value: "One-way value",
  ref: "Stores the DOM element in a variable",
  hide: "Hides the element while the expression is true",
  show: "Shows the element only while the expression is true",
  html: "Renders trusted HTML (unescaped)",
  delay: "Reveals the element after N milliseconds",
  class: "String, list, or { name: condition } object",
  style: "CSS string or { camelCaseProperty: value } object",
  id: "Element id",
  level: "Heading level 1-6",
};

export const COMMON_ATTRS: readonly string[] = [
  "href", "src", "alt", "type", "placeholder", "name", "title", "disabled", "required", "readonly", "checked", "target",
  "rel", "min", "max", "step", "width", "height", "loading", "autocomplete", "tabindex", "role", "ariaLabel", "ariaHidden",
];

export const EVENTS: readonly string[] = [
  "onClick", "onDoubleClick", "onInput", "onChange", "onSubmit", "onKeyDown", "onKeyUp", "onFocus", "onBlur",
  "onMouseEnter", "onMouseLeave", "onMouseMove", "onPointerDown", "onPointerUp", "onScroll", "onWheel", "onLoad", "onError",
];

export const EVENT_MODIFIERS: Readonly<Record<string, string>> = {
  prevent: "Calls event.preventDefault()",
  stop: "Calls event.stopPropagation()",
  once: "Runs the handler only once",
  self: "Only when the event target is the element itself",
  capture: "Listens in the capture phase",
  passive: "Passive listener (better scroll performance)",
  enter: "Only for the Enter key", esc: "Only for the Escape key", space: "Only for the Space key", tab: "Only for the Tab key",
  up: "Only for ArrowUp", down: "Only for ArrowDown", left: "Only for ArrowLeft", right: "Only for ArrowRight", delete: "Only for Delete/Backspace",
  ctrl: "Requires Ctrl", shift: "Requires Shift", alt: "Requires Alt", meta: "Requires Meta/Cmd",
};
