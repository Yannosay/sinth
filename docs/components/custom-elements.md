---
title: Custom elements
description: Use Sinth components in any HTML page as web components.
---

# Custom elements

Any component can be exported as a standard web component that works in any HTML page, framework or CMS:

```sinth
-- components/Counter.sinth
component Counter(num start = 0, str label = "Count") as <sinth-counter> {
  var num n = start
  Button(onClick: n += 1) { label + ": " + n }
}
```

`sinth build` writes `dist/elements/sinth-counter.js`, a standalone file with the runtime and the component's CSS, and `dist/elements/index.js`, which registers every element of the project at once:

```html
<script type="module" src="/elements/sinth-counter.js"></script>
<sinth-counter start="5" label="Clicks"></sinth-counter>
```

## Using Sinth in existing HTML sites

Custom elements are the bridge between Sinth and any other website: a static HTML page, a CMS template, a server-rendered app or another framework. Build your components once and use them as plain tags.

A project does not need pages for this. A folder with only components builds just the elements:

```
widgets/
├─ components/
│  └─ Widgets.sinth        component PriceTag(...) as <price-tag> { ... }
└─ package.json
```

```bash
npx sinth build            # writes dist/elements/price-tag.js and dist/elements/index.js
```

Copy `dist/elements/` to the other site (or serve it from a CDN) and load it:

```html
<script type="module" src="/elements/index.js"></script>

<price-tag amount="19.90" currency="EUR"></price-tag>
<price-tag amount="5"></price-tag>
```

In `sinth dev`, elements are served at `/elements/<tag>.js` too, so you can test them in a page in `public/`.

## Behavior

- Attributes are converted to the parameter types (`num`, `bool`, and `obj`/arrays as JSON).
- Changing an attribute or a property (`el.label = "x"`) updates the element.
- Children of the custom element become its default slot.
- Tag names must be lowercase and contain a dash.
- Component styles are injected once per page and stay scoped to the element.
- Each file is standalone; when several elements are used on one page, load `index.js` to share one runtime.
- The Sinth 4 syntax `custom-element Counter(export: <sinth-counter/>) { ... }` still works.
