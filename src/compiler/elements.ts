export interface ElementInfo {
  tag: string;
  className?: string;
  attrs?: Record<string, string>;
  void?: boolean;
  svg?: boolean;
}

const e = (tag: string, extra: Omit<ElementInfo, "tag"> = {}): ElementInfo => ({ tag, ...extra });

export const ELEMENTS: Record<string, ElementInfo> = {
  Main: e("main"), Header: e("header"), Footer: e("footer"), Nav: e("nav"), Section: e("section"), Article: e("article"),
  Aside: e("aside"), Div: e("div"), Span: e("span"), Search: e("search"), Hgroup: e("hgroup"),
  Hero: e("section", { className: "hero" }), Container: e("div", { className: "container" }), Grid: e("div", { className: "grid" }),
  Flex: e("div", { className: "flex" }), Stack: e("div", { className: "stack" }), Row: e("div", { className: "row" }),
  Column: e("div", { className: "col" }), CardGrid: e("div", { className: "card-grid" }),
  Heading: e("h1"), H1: e("h1"), H2: e("h2"), H3: e("h3"), H4: e("h4"), H5: e("h5"), H6: e("h6"),
  SubHeading: e("p", { className: "subheading" }), Paragraph: e("p"), P: e("p"), Lead: e("p", { className: "lead" }),
  Small: e("small"), Strong: e("strong"), Bold: e("b"), Em: e("em"), Italic: e("i"), Underline: e("u"), Code: e("code"),
  Pre: e("pre"), Blockquote: e("blockquote"), Quote: e("q"), Mark: e("mark"), Label: e("label"), Abbr: e("abbr"),
  Del: e("del"), Ins: e("ins"), Sub: e("sub"), Sup: e("sup"), Data: e("data"), Time: e("time"), Bdi: e("bdi"), Bdo: e("bdo"),
  Cite: e("cite"), Dfn: e("dfn"), Kbd: e("kbd"), Samp: e("samp"), Var: e("var"), Address: e("address"), Ruby: e("ruby"),
  Rt: e("rt"), Rp: e("rp"), S: e("s"),
  Button: e("button", { attrs: { type: "button" } }), SubmitButton: e("button", { attrs: { type: "submit" } }),
  Link: e("a"), NavLink: e("a", { className: "nav-link" }), A: e("a"),
  Select: e("select"), Form: e("form"), Fieldset: e("fieldset"), Legend: e("legend"), Details: e("details"),
  Summary: e("summary"), Dialog: e("dialog"), Textarea: e("textarea"), TextArea: e("textarea"), Datalist: e("datalist"),
  Optgroup: e("optgroup"), Option: e("option"), Progress: e("progress"), Meter: e("meter"), Output: e("output"),
  Menu: e("menu"),
  Picture: e("picture"), Video: e("video"), Audio: e("audio"), Figure: e("figure"), Figcaption: e("figcaption"),
  Canvas: e("canvas"), IFrame: e("iframe"), Iframe: e("iframe"), Object: e("object"), Map: e("map"),
  Img: e("img", { void: true }), Image: e("img", { void: true }), Logo: e("img", { void: true, className: "logo" }),
  Input: e("input", { void: true }), Checkbox: e("input", { void: true, attrs: { type: "checkbox" } }),
  Radio: e("input", { void: true, attrs: { type: "radio" } }), Hr: e("hr", { void: true }), Br: e("br", { void: true }),
  Wbr: e("wbr", { void: true }), Source: e("source", { void: true }), Track: e("track", { void: true }),
  Embed: e("embed", { void: true }), Col: e("col", { void: true }), Area: e("area", { void: true }),
  Ul: e("ul"), Ol: e("ol"), Li: e("li"), ListItem: e("li"), List: e("ul"), Dl: e("dl"), Dt: e("dt"), Dd: e("dd"),
  Table: e("table"), Caption: e("caption"), Thead: e("thead"), Tbody: e("tbody"), Tfoot: e("tfoot"), Tr: e("tr"),
  Th: e("th"), Td: e("td"), Colgroup: e("colgroup"),
  Template: e("template"), Slot: e("slot"), NoScript: e("noscript"),
  Svg: e("svg", { svg: true }), Path: e("path", { svg: true }), Circle: e("circle", { svg: true }),
  Rect: e("rect", { svg: true }), Line: e("line", { svg: true }), Polyline: e("polyline", { svg: true }),
  Polygon: e("polygon", { svg: true }), Ellipse: e("ellipse", { svg: true }), G: e("g", { svg: true }),
  Use: e("use", { svg: true }), Defs: e("defs", { svg: true }), Text: e("text", { svg: true }),
  LinearGradient: e("linearGradient", { svg: true }), RadialGradient: e("radialGradient", { svg: true }),
  Stop: e("stop", { svg: true }), Symbol: e("symbol", { svg: true }), ClipPath: e("clipPath", { svg: true }),
  Mask: e("mask", { svg: true }), TSpan: e("tspan", { svg: true }),
};

export const SPECIAL_ELEMENTS: ReadonlySet<string> = new Set(["RawHTML", "Html", "Fragment", "Head", "Portal"]);

export const VOID_TAGS: ReadonlySet<string> = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

export const INLINE_STYLE_PROPS: ReadonlySet<string> = new Set([
  "color", "backgroundColor", "background", "backgroundImage", "backgroundSize", "backgroundPosition",
  "fontSize", "fontWeight", "fontFamily", "fontStyle", "lineHeight", "letterSpacing", "textAlign", "textDecoration",
  "textTransform", "whiteSpace", "wordBreak", "textOverflow", "margin", "marginTop", "marginBottom", "marginLeft",
  "marginRight", "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "width", "height", "minWidth",
  "maxWidth", "minHeight", "maxHeight", "display", "flexDirection", "flexWrap", "flex", "flexGrow", "flexShrink",
  "flexBasis", "justifyContent", "alignItems", "alignContent", "alignSelf", "gap", "rowGap", "columnGap",
  "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow", "gridArea", "position", "top", "right", "bottom",
  "left", "zIndex", "border", "borderTop", "borderBottom", "borderLeft", "borderRight", "borderWidth", "borderStyle",
  "borderColor", "borderRadius", "outline", "boxShadow", "textShadow", "opacity", "visibility", "overflow", "overflowX",
  "overflowY", "objectFit", "objectPosition", "cursor", "userSelect", "pointerEvents", "transform", "transition",
  "animation", "aspectRatio", "inset", "filter", "backdropFilter",
]);

export const URL_ATTRS: ReadonlySet<string> = new Set(["href", "src", "action", "formaction", "poster", "data", "cite", "background", "xlink:href", "srcset"]);

export const BOOLEAN_ATTRS: ReadonlySet<string> = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "defer", "disabled",
  "formnovalidate", "hidden", "inert", "ismap", "itemscope", "loop", "multiple", "muted", "nomodule", "novalidate", "open",
  "playsinline", "readonly", "required", "reversed", "selected",
]);

export function attrNameToHtml(name: string): string {
  if (/^(aria|data)[A-Z]/.test(name)) return name.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
  const map: Record<string, string> = {
    className: "class", htmlFor: "for", tabIndex: "tabindex", readOnly: "readonly", maxLength: "maxlength",
    minLength: "minlength", autoComplete: "autocomplete", autoFocus: "autofocus", autoPlay: "autoplay", colSpan: "colspan",
    rowSpan: "rowspan", contentEditable: "contenteditable", crossOrigin: "crossorigin", spellCheck: "spellcheck",
    srcSet: "srcset", inputMode: "inputmode", enterKeyHint: "enterkeyhint", noValidate: "novalidate",
    playsInline: "playsinline", referrerPolicy: "referrerpolicy", fetchPriority: "fetchpriority", accessKey: "accesskey",
  };
  return map[name] ?? name;
}
