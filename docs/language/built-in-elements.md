---
title: Built-in elements
description: Every built-in element and the HTML it produces.
---

# Built-in elements

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

## When a component has an element's name

A component you define or import replaces the element of the same name in that file. Inside `component Button`, `Button(...)` still means the native element so the component can wrap it. Everywhere else, write `Html.Button(...)` to get the native element:

```sinth
component Button(str label) {
  Button(class: "brand") { label }   -- the <button> this component wraps
}

Main {
  Button(label: "Save")              -- the component
  Html.Button { "Plain" }            -- a native <button>
}
```

`Html.` takes any built-in element name; anything else is error E0303.
