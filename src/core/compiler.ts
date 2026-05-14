import * as path from "path";
import * as fs from "fs";
import { Loc, Literal, Expression, Child, Attr, CompUse, IfBlock, ForLoop, RemoveStmt, StyleBlock, CompDef, ParamDecl, VarDeclaration, SinthFile, CompileCtx, MixedBlockEntry, SinthError, SinthWarning, TT, AssignStmt, MetaEntry } from "./types.ts";import { Lexer } from "./lexer.ts";
import { Parser } from "./parser.ts";
import { fnv1a, camelToKebab, esc, escAttr, litToString, tagNameToPascal } from "../utils.ts";
import { compileExprToJS, compileIfToJS, bodyToJS } from "./expr.ts";
import { FunctionDef } from "./types.ts";
import { parseFile, resolveImports, ResolverConfig, ResolvedImports } from "../resolver.ts";




export interface BuiltinInfo { tag: string; defaultClass?: string; voidEl?: boolean }

export const BUILTIN_MAP: Record<string, BuiltinInfo> = {
  // structural
  Main:        { tag: "main" },
  Header:      { tag: "header" },
  Footer:      { tag: "footer" },
  Nav:         { tag: "nav" },
  Section:     { tag: "section" },
  Article:     { tag: "article" },
  Aside:       { tag: "aside" },
  Div:         { tag: "div" },
  Span:        { tag: "span" },
  Hero:        { tag: "section", defaultClass: "hero" },
  Container:   { tag: "div",     defaultClass: "container" },
  Grid:        { tag: "div",     defaultClass: "grid" },
  Flex:        { tag: "div",     defaultClass: "flex" },
  Stack:       { tag: "div",     defaultClass: "stack" },
  Row:         { tag: "div",     defaultClass: "row" },
  Column:      { tag: "div",     defaultClass: "col" },
  CardGrid:    { tag: "div",     defaultClass: "card-grid" },
  // typography
  Heading:     { tag: "h1" },
  SubHeading:  { tag: "p",      defaultClass: "subheading" },
  Paragraph:   { tag: "p" },
  Lead:        { tag: "p",      defaultClass: "lead" },
  Small:       { tag: "small" },
  Strong:      { tag: "strong" },
  Em:          { tag: "em" },
  Code:        { tag: "code" },
  Pre:         { tag: "pre" },
  Blockquote:  { tag: "blockquote" },
  Mark:        { tag: "mark" },
  Label:       { tag: "label" },
  Abbr:        { tag: "abbr" },
  Del:         { tag: "del" },
  Ins:         { tag: "ins" },
  Sub:         { tag: "sub" },
  Sup:         { tag: "sup" },
  Data:        { tag: "data" },
  Time:        { tag: "time" },
  Bdi:         { tag: "bdi" },
  Bdo:         { tag: "bdo" },
  Cite:        { tag: "cite" },
  Dfn:         { tag: "dfn" },
  Kbd:         { tag: "kbd" },
  Samp:        { tag: "samp" },
  Var:         { tag: "var" },
  Address:     { tag: "address" },
  Ruby:        { tag: "ruby" },
  Rt:          { tag: "rt" },
  Rp:          { tag: "rp" },
  // interactive
  Button:      { tag: "button" },
  Link:        { tag: "a" },
  NavLink:     { tag: "a" },
  Select:      { tag: "select" },
  Form:        { tag: "form" },
  Fieldset:    { tag: "fieldset" },
  Legend:      { tag: "legend" },
  Details:     { tag: "details" },
  Summary:     { tag: "summary" },
  Dialog:      { tag: "dialog" },
  Textarea:    { tag: "textarea" },
  Datalist:    { tag: "datalist" },
  Optgroup:    { tag: "optgroup" },
  Option:      { tag: "option" },
  Progress:    { tag: "progress" },
  Meter:       { tag: "meter" },
  Output:      { tag: "output" },
  Map:         { tag: "map" },
  // media
  Picture:     { tag: "picture" },
  Video:       { tag: "video" },
  Audio:       { tag: "audio" },
  Figure:      { tag: "figure" },
  Figcaption:  { tag: "figcaption" },
  Canvas:      { tag: "canvas" },
  Svg:         { tag: "svg" },
  IFrame:      { tag: "iframe" },
  Object:      { tag: "object" },
  // void elements
  Img:         { tag: "img",    voidEl: true },
  Logo:        { tag: "img",    voidEl: true },
  Input:       { tag: "input",  voidEl: true },
  Checkbox:    { tag: "input",  voidEl: true },
  Hr:          { tag: "hr",     voidEl: true },
  Br:          { tag: "br",     voidEl: true },
  Wbr:         { tag: "wbr",   voidEl: true },
  Source:      { tag: "source", voidEl: true },
  Embed:       { tag: "embed",  voidEl: true },
  Col:         { tag: "col",    voidEl: true },
  Area:        { tag: "area",   voidEl: true },
  // lists
  Ul: { tag: "ul" }, Ol: { tag: "ol" }, Li: { tag: "li" },
  Dl: { tag: "dl" }, Dt: { tag: "dt" }, Dd: { tag: "dd" },
  // tables
  Table:       { tag: "table" },
  Caption:     { tag: "caption" },
  Thead:       { tag: "thead" },
  Tbody:       { tag: "tbody" },
  Tfoot:       { tag: "tfoot" },
  Tr:          { tag: "tr" },
  Th:          { tag: "th" },
  Td:          { tag: "td" },
  Colgroup:    { tag: "colgroup" },
  // utility
  Template:    { tag: "template" },
  Slot:        { tag: "slot" },
  NoScript:    { tag: "noscript" },
  RawHTML:     { tag: "__RAW__" },
};

export const VOID_TAGS = new Set([
  "area","base","br","col","embed","hr","img","input",
  "link","meta","param","source","track","wbr",
]);

const EVENT_RE = /^on[A-Z]/;
function eventAttrName(name: string): string | null {
  return EVENT_RE.test(name) ? name.toLowerCase() : null;
}

// preprocessor

/**
 * for who's reading this: This maps Sinth Style pseudo-class shorthand keywords to real CSS pseudo-classes.
 * these are used inside component style blocks, for example:  onHover { color: "blue" }
 */
export const SINTH_PSEUDO_CLASS: Record<string, string> = {
  onHover:           ":hover",
  onFocus:           ":focus",
  onActive:          ":active",
  onVisited:         ":visited",
  onChecked:         ":checked",
  onDisabled:        ":disabled",
  onEnabled:         ":enabled",
  onRequired:        ":required",
  onOptional:        ":optional",
  onValid:           ":valid",
  onInvalid:         ":invalid",
  onPlaceholderShown:":placeholder-shown",
  onFocusWithin:     ":focus-within",
  onFocusVisible:    ":focus-visible",
  onFirst:           ":first-child",
  onLast:            ":last-child",
  onFirstOfType:     ":first-of-type",
  onLastOfType:      ":last-of-type",
  onEmpty:           ":empty",
  onTarget:          ":target",
  onLink:            ":link",
};

export const SINTH_PSEUDO_ELEMENT: Record<string, string> = {
  before:       "::before",
  after:        "::after",
  placeholder:  "::placeholder",
  selection:    "::selection",
  firstLine:    "::first-line",
  firstLetter:  "::first-letter",
  marker:       "::marker",
  backdrop:     "::backdrop",
};

export function sinthCompToSelector(name: string): string {
  const info = BUILTIN_MAP[name];
  if (!info) return name.toLowerCase();
  if (info.defaultClass) {
    const classes = info.defaultClass.split(" ").map(c => `.${c}`).join("");
    return `${info.tag}${classes}`;
  }
  return info.tag;
}

/**
 * supported conversions:
 *   - component names as selectors: `Paragraph { ... }` → `p { ... }`
 *   - pseudo-class shorthands: `onHover { ... }` → `&:hover { ... }`
 *   - pseudo-element shorthands: `before { ... }` → `&::before { ... }`
 *   - media queries: `media(maxWidth: "600px") { ... }` → `@media (max-width: 600px) { ... }`
 *   - CSS custom properties: `var --primary: "#3b82f6"` → `--primary: #3b82f6;`
 */
export function preprocessSinthStyle(raw: string): string {
  const lines  = raw.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const indent  = line.match(/^(\s*)/)?.[1] ?? "";

    if (!trimmed) { result.push(line); continue; }

    if (trimmed.startsWith("--") && !trimmed.startsWith("--[")) { continue; }
    // Standard comments pass through
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      result.push(line); continue;
    }

    const mediaMatch = trimmed.match(/^media\s*\(([^)]+)\)\s*(\{?\s*)$/);
    if (mediaMatch) {
      const params = parseSinthMediaParams(mediaMatch[1]);
      result.push(`${indent}@media (${params}) {`);
      continue;
    }

    const blockMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9]*)(\s*\{\s*)$/);
    if (blockMatch) {
      const keyword = blockMatch[1];

      const pseudoCls = SINTH_PSEUDO_CLASS[keyword];
      if (pseudoCls) {
        result.push(`${indent}&${pseudoCls} {`);
        continue;
      }

      const pseudoEl = SINTH_PSEUDO_ELEMENT[keyword];
      if (pseudoEl) {
        result.push(`${indent}&${pseudoEl} {`);
        continue;
      }

      if (/^[A-Z]/.test(keyword) && BUILTIN_MAP[keyword]) {
        result.push(`${indent}${sinthCompToSelector(keyword)} {`);
        continue;
      }
    }

    const varPropMatch = trimmed.match(/^var\s+(--[a-zA-Z][a-zA-Z0-9-]*)\s*:\s*["']?([^"';]+)["']?\s*;?\s*$/);
    if (varPropMatch) {
      result.push(`${indent}${varPropMatch[1]}: ${varPropMatch[2].trim()};`);
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

export function parseSinthMediaParams(params: string): string {
  const parts = params.split(",").map(p => {
    const m = p.trim().match(/^([a-zA-Z]+)\s*:\s*["']?([^"',]+)["']?\s*$/);
    if (!m) return p.trim();
    return `${camelToKebab(m[1])}: ${m[2].trim()}`;
  });
  return parts.join(") and (");
}

// style processor


export function convertCSSProps(css: string): string {
  return css.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed)                        return line;
    if (trimmed === "}" || trimmed.startsWith("}")) return line;
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return line;
    if (trimmed.startsWith("@"))         return line;
    if (trimmed.includes("{"))           return line;

    const m = line.match(/^(\s*)([a-zA-Z][a-zA-Z0-9-]*)(\s*:\s*)(.+?)(\s*;?\s*)$/);
    if (!m) return line;

    const [, indent, rawProp, , rawVal] = m;

    const hasCamelCase = /[a-z][A-Z]/.test(rawProp) || /^[A-Z]/.test(rawProp);
    const hasQuotedVal = /^["']/.test(rawVal.trim());
    if (!hasCamelCase && !hasQuotedVal) return line;

    let val = rawVal.trim();
    if (val.endsWith(";")) val = val.slice(0, -1).trimEnd();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    return `${indent}${camelToKebab(rawProp)}: ${val};`;
  }).join("\n");
}

export function processStyleBlock(
  block:  StyleBlock,
  hash:   string,
  params: Map<string, string> = new Map(),
): string {
  let raw = block.raw;

  // 1. interpolate {param} placeholders
  if (params.size > 0) raw = interpolateAttr(raw, params);

  // 2. sinth style preprocessing
  raw = preprocessSinthStyle(raw);

  // 3. warn if & in plain CSS
  if (block.lang === "css" && raw.includes("&")) {
    SinthWarning.emit(
      `'&' (CSS nesting) found in style block. Nested selectors require a modern browser or lang="scss".`,
      block.loc,
    );
  }

  // 4. camelCase → kebab-case
  let css = convertCSSProps(raw);

  // 5. SCSS compilation
  if (block.lang === "scss") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sass: { compileString: (src: string) => { css: string } } = require("sass");
      css = sass.compileString(css).css;
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "MODULE_NOT_FOUND" || err.message?.includes("Cannot find module")) {
        throw new SinthError("SCSS requires the 'sass' package. Install with: npm install sass");
      }
      throw new SinthError(`SCSS compilation failed: ${err.message ?? String(e)}`);
    }
  }

  // 6. if target component given, wrap content in its CSS selector
  if (block.target) {
    const selector = sinthCompToSelector(block.target);
    css = `${selector} {\n${css}\n}`;
  }

  // 7. scope (except it's global)
  if (!block.global) css = scopeCSS(css, hash);

  return css;
}

export function scopeCSS(css: string, hash: string): string {
  return processRules(css, `[data-s="${hash}"]`);
}

export function processRules(css: string, attr: string): string {
  let out = "", i = 0;

  while (i < css.length) {
    if (/\s/.test(css[i])) { out += css[i++]; continue; }

    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) { out += css.substring(i); break; }
      out += css.substring(i, end + 2);
      i = end + 2;
      continue;
    }

    const braceIdx = findCSSBrace(css, i);
    if (braceIdx === -1) { out += css.substring(i); break; }

    const selector         = css.substring(i, braceIdx).trim();
    const { content, end } = extractCSSBlock(css, braceIdx);

    if (/^@(-webkit-|-moz-)?keyframes/.test(selector)) {
      out += `${selector} {${content}}\n`;
    } else if (/^@(media|supports|layer|container)/.test(selector)) {
      out += `${selector} {\n${processRules(content, attr)}\n}\n`;
    } else if (selector.startsWith("@")) {
      out += `${selector} {${content}}\n`;
    } else if (selector.length > 0) {
      out += `${scopeSelectors(selector, attr)} {${content}}\n`;
    }

    i = end;
  }
  return out;
}

export function scopeSelectors(selList: string, attr: string): string {
  return selList
    .split(",")
    .map(s => {
      s = s.trim();
      if (!s) return "";
      if (/^(html|body|:root)(\s|$|{|,)/.test(s)) return s;
      const m = s.match(/^(.*?)((?::{1,2}[a-zA-Z-]+(?:\([^)]*\))?)+)$/);
      if (m && m[1].trim()) {
        return `${attr} ${m[1].trimEnd()}${m[2]}, ${m[1].trimEnd()}${attr}${m[2]}`;
      }
      return `${attr} ${s}, ${s}${attr}`;
    })
    .filter(Boolean)
    .join(",\n");
}

export function findCSSBrace(css: string, from: number): number {
  let i = from;
  while (i < css.length) {
    if (css[i] === '"' || css[i] === "'") {
      const q = css[i++];
      while (i < css.length && css[i] !== q) { if (css[i] === "\\") i++; i++; }
      i++;
    } else if (css[i] === "{") {
      return i;
    } else { i++; }
  }
  return -1;
}

export function extractCSSBlock(css: string, openBrace: number): { content: string; end: number } {
  let i = openBrace + 1, depth = 1;
  while (i < css.length && depth > 0) {
    if (css[i] === '"' || css[i] === "'") {
      const q = css[i++];
      while (i < css.length && css[i] !== q) { if (css[i] === "\\") i++; i++; }
      i++;
    } else if (css[i] === "/" && css[i + 1] === "*") {
      i += 2;
      while (i < css.length - 1 && !(css[i] === "*" && css[i + 1] === "/")) i++;
      i += 2;
    } else if (css[i] === "{") { depth++; i++; }
    else if (css[i] === "}") { depth--; if (depth > 0) i++; else break; }
    else { i++; }
  }
  return { content: css.substring(openBrace + 1, i), end: i + 1 };
}






// the HTML generator

/**
 * CSS property names that are allowed as inline style shorthand attributes on
 * any Sinth component:  Paragraph(color: "red", fontSize: "1.2rem") { "Hi" }
 */
export const INLINE_STYLE_PROPS = new Set([
  "color","backgroundColor","backgroundImage","backgroundSize","backgroundPosition",
  "fontSize","fontWeight","fontFamily","fontStyle","fontVariant","lineHeight","letterSpacing","textAlign",
  "textDecoration","textTransform","whiteSpace","wordBreak","wordWrap","textOverflow",
  "margin","marginTop","marginBottom","marginLeft","marginRight",
  "padding","paddingTop","paddingBottom","paddingLeft","paddingRight",
  "width","height","minWidth","maxWidth","minHeight","maxHeight",
  "display","flexDirection","flexWrap","flex","flexGrow","flexShrink","flexBasis",
  "justifyContent","alignItems","alignContent","alignSelf","gap","rowGap","columnGap",
  "gridTemplateColumns","gridTemplateRows","gridColumn","gridRow","gridArea",
  "position","top","right","bottom","left","zIndex",
  "border","borderTop","borderBottom","borderLeft","borderRight",
  "borderWidth","borderStyle","borderColor","borderRadius",
  "outline","outlineWidth","outlineStyle","outlineColor","outlineOffset",
  "boxShadow","textShadow","opacity","visibility",
  "overflow","overflowX","overflowY","objectFit","objectPosition",
  "cursor","userSelect","pointerEvents","resize",
  "transform","transition","animation","animationDuration","animationDelay",
  "listStyle","listStyleType","listStylePosition",
  "verticalAlign","float","clear",
  "content","quotes",
]);

export function resolveBuiltinTag(
  name:  string,
  attrs: Attr[],
): { tag: string; defaultClass?: string; voidEl: boolean } {
  if (name === "Heading") {
    const la = attrs.find(a => a.name === "level");
    const lv = la?.value?.kind === "num" ? Math.min(6, Math.max(1, la.value.value)) : 1;
    if (!la) SinthWarning.emit(`Heading used without 'level' attribute, defaulting to h1`);
    return { tag: `h${lv}`, voidEl: false };
  }
  const info = BUILTIN_MAP[name];
  if (info) return { tag: info.tag, defaultClass: info.defaultClass, voidEl: info.voidEl ?? false };
  SinthWarning.emit(`Unknown component '${name}', treating as <${name.toLowerCase()}>`);
  return { tag: name.toLowerCase(), voidEl: false };
}

export function registerExpr(ctx: CompileCtx, expr: Expression): number {
  const jsExpr = compileExprToJS(expr, ctx.loopVars);
  const existing = ctx.exprMap.get(jsExpr);
  if (existing !== undefined) return existing;
  const id = ctx.exprRegistry.length;
  ctx.exprRegistry.push(jsExpr);
  ctx.exprMap.set(jsExpr, id);
  return id;
}


export function renderAttr(attr: Attr, paramMap: Map<string, string>, ctx?: CompileCtx): string {
  const { name, value } = attr;
  if (value === null)        return name;
  if (value.kind === "null") return "";
  if (value.kind === "bool") return value.value ? name : "";

if (name === "model" && value?.kind === "str") {
  const vName = interpolateAttr(value.value, paramMap);
  return `oninput="(function(e){ ${vName} = e.target.value; sinthRender(); })(event)" value="${escAttr(vName)}"`;
}



if (name === "delay") {
    if (value.kind === "num") {
      return `data-sinth-delay="${value.value}" style="display:none"`;
    }
    const v = litToString(value);
    if (/^\d+$/.test(v)) return `data-sinth-delay="${escAttr(v)}" style="display:none"`;
    if (v.startsWith("__EXPR__")) {
      try {
        const expr: Expression = JSON.parse(v.substring(8));
        const id = registerExpr(ctx, expr);
        return `data-sinth-delay-expr-id="${id}" style="display:none"`;
      } catch {}
    }
    // plain variable name – register as expression
    const id = registerExpr(ctx, { kind: "variable", name: v });
    return `data-sinth-delay-expr-id="${id}" style="display:none"`;
  }

  if (name === "checked") {
    return (value as any)?.kind === "bool" && (value as any).value ? "checked" : "";
  }

  if (value.kind === "num") return `${name}="${value.value}"`;

  let raw = value.value;

  if (raw.startsWith("__MULTI_EXPR__")) {
    const exprJson = raw.substring("__MULTI_EXPR__".length);
    try {
      const exprs: Expression[] = JSON.parse(exprJson);
      const jsExprs = exprs.map(e => compileExprToJS(e)).join("; ");
      const ev = eventAttrName(name);
      if (ev) return `${ev}="(function(){ ${jsExprs.replace(/"/g, "&quot;")}; sinthRender(); })()"`;
      return `${name}="${escAttr(jsExprs)}"`;
    } catch { }
  }
  if (raw.startsWith("__EXPR__")) {
    const exprJson = raw.substring("__EXPR__".length);
    try {
      const expr: Expression = JSON.parse(exprJson);
      const jsExpr = compileExprToJS(expr);
      const ev = eventAttrName(name);
      if (ev) return `${ev}="(function(){ ${jsExpr.replace(/"/g, "&quot;")}; sinthRender(); })()"`;
      return `${name}="${escAttr(jsExpr)}"`;
    } catch { }
  }

  raw = interpolateAttr(raw, paramMap);

  const ev = eventAttrName(name);
  if (ev) {
    const call = raw.includes("(") ? raw : raw + "()";
    return `${ev}="${escAttr(call)};sinthRender()"`;
  }
  return `${name}="${escAttr(raw)}"`;
}

export function renderText(text: string, params: Map<string, string>): string {
  const rawSlots = new Map<string, string>();
  let counter = 0;

  let s = text.replace(/\\\$/g, "\x00DOLLAR\x00");

  s = s.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => {
    const val = params.get(n);
    if (val === undefined) return `$${n}`;
    if (n === "slot") {
      const ph = `\x00RAW${counter++}\x00`;
      rawSlots.set(ph, val);
      return ph;
    }
    return val;
  });

  s = esc(s);

  for (const [ph, val] of rawSlots) s = s.replace(ph, val);
  s = s.replace(/\x00DOLLAR\x00/g, "$");

  const braceRe = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = braceRe.exec(s)) !== null) {
    SinthWarning.emit(
      `Use $param for text interpolation; {param} is for attributes. Found '${m[0]}' in text.`
    );
  }

  return s;
}

export function interpolateAttr(text: string, params: Map<string, string>): string {
  let s = text.replace(/\\\{/g, "\x00LB\x00");
  s = s.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, n) => params.get(n) ?? `{${n}}`);
  return s.replace(/\x00LB\x00/g, "{");
}


export function renderChild(
  child:  Child,
  ctx:    CompileCtx,
  params: Map<string, string>,
  depth:  number,
): string {
  if (depth > 64) throw new SinthError("Maximum component nesting depth (64) exceeded.");

  switch (child.kind) {
    case "text":
      return renderText(child.value, params);

    case "expr": {
      if (child.expression.kind === "literal" && child.expression.value) {
        return esc(litToString(child.expression.value));
      }
      if (child.expression.kind === "variable" && child.expression.name && !ctx.loopVars?.has(child.expression.name)) {
        const exprId = registerExpr(ctx, child.expression);
        return `<span class="sinth-expr" data-expr-id="${exprId}"></span>`;
      }
      const exprId = registerExpr(ctx, child.expression);
      return `<span class="sinth-expr" data-expr-id="${exprId}"></span>`;
    }

    case "assign_stmt": {
      ctx.logicBlocks.push(compileExprToJS(child.expression) + ";");
      return "";
    }

    case "remove": {
      return `<span data-sinth-remove="${esc((child as RemoveStmt).target)}"></span>`;
    }

    case "if":
      return renderIfBlock(child, ctx, params, depth);

    case "for": {
      // collect loop‑variable names
      const loopVars = new Set<string>();
      loopVars.add(child.itemVar);
      if (child.keyVar) loopVars.add(child.keyVar);
      if (child.indexVar) loopVars.add(child.indexVar);
      // set them on ctx for compilation of the body
      const prev = ctx.loopVars;
      ctx.loopVars = loopVars;
      const bodyHTML = child.body.map(c => renderChild(c, ctx, params, depth + 1)).join("");
      ctx.loopVars = prev;   // restore
      const keyAttr = child.keyVar ? ` data-sinth-key="${escAttr(child.keyVar)}"` : "";
      const idxAttr = child.indexVar ? ` data-sinth-index="${escAttr(child.indexVar)}"` : "";
      return (
        `<template data-sinth-for="${escAttr(child.arrayVar)}" data-sinth-item="${escAttr(child.itemVar)}"${keyAttr}${idxAttr}>${bodyHTML}</template>`
      );
    }

    case "use":
      return renderCompUse(child, ctx, params, depth);
  }
}

export function renderIfBlock(
ifBlock: IfBlock,
ctx:     CompileCtx,
params:  Map<string, string>,
depth:   number,
): string {
  if (depth > 64) throw new SinthError("Maximum if-block nesting depth (64) exceeded.", ifBlock.loc);

  const condJS = compileExprToJS(ifBlock.condition);
  const allChildren  = [...ifBlock.body, ...(ifBlock.elseBody ?? [])];
  const hasAssign = allChildren.some(c => c.kind === "assign_stmt");
  const hasComp   = allChildren.some(c => c.kind === "use");

  // pure logic
  if (hasAssign && !hasComp) {
    ctx.logicBlocks.push(compileIfToJS(ifBlock));
    return "";
  }

  // pure DOM
  if (!hasAssign && hasComp) {
    const tplId = ctx.ifIdCounter++;
    const condId = registerExpr(ctx, ifBlock.condition);
    const bodyHTML = ifBlock.body.map(c => renderChild(c, ctx, params, depth + 1)).join("");
    const elseHTML = (ifBlock.elseBody ?? []).map(c => renderChild(c, ctx, params, depth + 1)).join("");
    let replaceAttr = "";
    const firstComp = ifBlock.body.find(c => c.kind === "use") as CompUse | undefined;
    if (firstComp) {
      const idAttr = firstComp.attrs.find(a => a.name === "id");
      const replAttr = firstComp.attrs.find(a => a.name === "replace");
      const wantsReplace = replAttr && (replAttr.value === null || (replAttr.value?.kind === "bool" && replAttr.value.value));
      if (idAttr && idAttr.value?.kind === "str" && wantsReplace) {
        replaceAttr = ` data-sinth-if-replace="${escAttr(idAttr.value.value)}"`;
      }
    }
    return (
      `<template data-sinth-if-id="${tplId}" data-sinth-if-expr="${condId}"${replaceAttr}>${bodyHTML}</template>` +
      (elseHTML ? `<template data-sinth-else data-sinth-if-id="${tplId}">${elseHTML}</template>` : "")
    );
  }

  // mixed
  const id = `__sm${ctx.mixedCounter++}__`;

  const ifAssignJS = ifBlock.body
    .filter(c => c.kind === "assign_stmt")
    .map(c => `  ${compileExprToJS((c as AssignStmt).expression)};`)
    .join("\n");

  const ifHTML = ifBlock.body
    .filter(c => c.kind !== "assign_stmt")
    .map(c => renderChild(c, ctx, params, depth + 1))
    .join("");

  const elseAssignJS = (ifBlock.elseBody ?? [])
    .filter(c => c.kind === "assign_stmt")
    .map(c => `  ${compileExprToJS((c as AssignStmt).expression)};`)
    .join("\n");

  const elseHTML = (ifBlock.elseBody ?? [])
    .filter(c => c.kind !== "assign_stmt")
    .map(c => renderChild(c, ctx, params, depth + 1))
    .join("");

  let replaceId: string | undefined;
  const ifFirstComp = ifBlock.body.find(c => c.kind === "use") as CompUse | undefined;
  const elseFirstComp = (ifBlock.elseBody ?? []).find(c => c.kind === "use") as CompUse | undefined;
  if (ifFirstComp) {
    const ifId = ifFirstComp.attrs.find(a => a.name === "id")?.value;
    const ifReplace = ifFirstComp.attrs.find(a => a.name === "replace");
    const ifReplaceVal = ifReplace?.value;
    const ifWantsReplace = ifReplace && (ifReplaceVal === null || (ifReplaceVal?.kind === "bool" && ifReplaceVal.value));
    
    if (ifId && ifId.kind === "str" && ifWantsReplace) {
      if (elseFirstComp) {
        const elseId = elseFirstComp.attrs.find(a => a.name === "id")?.value;
        const elseReplace = elseFirstComp.attrs.find(a => a.name === "replace");
        const elseReplaceVal = elseReplace?.value;
        const elseWantsReplace = elseReplace && (elseReplaceVal === null || (elseReplaceVal?.kind === "bool" && elseReplaceVal.value));
        
        if (elseId && elseId.kind === "str" && elseId.value === ifId.value && elseWantsReplace) {
          replaceId = ifId.value;
        }
      }
    }
  }

  const condId = registerExpr(ctx, ifBlock.condition);
  ctx.mixedBlocks.push({ id, conditionJS: String(condId), ifJS: ifAssignJS, ifHTML, elseJS: elseAssignJS, elseHTML, replaceId });

  return `<span id="${replaceId || id}" data-sinth-mixed></span>`;
}

export function renderCompUse(
  use:    CompUse,
  ctx:    CompileCtx,
  params: Map<string, string>,
  depth:  number,
): string {
  // transparent wrapper inserted by flattenIfToUses()
  if (use.name === "__IF_ROOT__") {
    return use.children.map(c => renderChild(c, ctx, params, depth)).join("");
  }

  // RawHTML
  if (use.name === "RawHTML") {
    const ca = use.attrs.find(a => a.name === "content");
    if (!ca || !ca.value) return "";
    return interpolateAttr(litToString(ca.value), params);
  }

  // user-defined component
  const userDef = ctx.allDefs.get(use.name);
  if (userDef) return expandUserComp(use, userDef, ctx, params, depth + 1);

  // custom element
  const customEl = ctx.customEls.get(use.name);
  if (customEl) {
    const attrParts = [`data-s="${ctx.scopeHash}"`];
    for (const attr of use.attrs) {
      const r = renderAttr(attr, params, ctx);
      if (r) attrParts.push(r);
    }
    const inner = use.children.map(c => renderChild(c, ctx, params, depth + 1)).join("");
    return `<${customEl.tagName} ${attrParts.join(" ")}>${inner}</${customEl.tagName}>`;
  }

  // built-in component
  const { tag, defaultClass, voidEl } = resolveBuiltinTag(use.name, use.attrs);
  const isVoid = voidEl || VOID_TAGS.has(tag);

  const attrParts: string[] = [`data-s="${ctx.scopeHash}"`];
  let userClass: string | undefined;
  const inlineStyleParts: string[] = [];

  for (const attr of use.attrs) {
    if (attr.name === "level" && use.name === "Heading") continue;

    if (INLINE_STYLE_PROPS.has(attr.name) && attr.value) {
      const val = attr.value.kind === "str"
        ? interpolateAttr(attr.value.value, params)
        : litToString(attr.value);
      inlineStyleParts.push(`${camelToKebab(attr.name)}: ${val}`);
      continue;
    }

    if (attr.name === "class") {
      if (attr.value?.kind === "str") userClass = interpolateAttr(attr.value.value, params);
      continue;
    }
    const rendered = renderAttr(attr, params, ctx);
    if (rendered) attrParts.push(rendered);
  }

  const classes = [defaultClass, userClass].filter(Boolean).join(" ");
  if (classes) attrParts.push(`class="${escAttr(classes)}"`);
  if (inlineStyleParts.length > 0) attrParts.push(`style="${escAttr(inlineStyleParts.join("; "))}"`);
  if (tag === "button" && !use.attrs.some(a => a.name === "type")) attrParts.push(`type="button"`);
  if (use.name === "Input") {
    const bindAttr = use.attrs.find(a => a.name === "bind");
    const modelAttr = use.attrs.find(a => a.name === "model");
    const bindOrModel = bindAttr || modelAttr;
    if (bindOrModel?.value?.kind === "str") {
      let vName = bindOrModel.value.value;
      if (vName.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(vName.substring(8));
          if (expr.kind === "variable" && expr.name) vName = expr.name;
        } catch {}
      }
      if (!use.attrs.some(a => a.name === "type")) attrParts.push(`type="text"`);
      attrParts.push(`oninput="(function(e){ ${vName} = e.target.value; sinthRender(); })(event)"`);
      attrParts.push(`data-sinth-value="${escAttr(vName)}"`);
    }
  }
  if (use.name === "Checkbox") {
    if (!use.attrs.some(a => a.name === "type")) attrParts.push(`type="checkbox"`);
    const bindAttr = use.attrs.find(a => a.name === "bind");
    if (bindAttr?.value?.kind === "str") {
      let vName = bindAttr.value.value;
      if (vName.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(vName.substring(8));
          if (expr.kind === "variable" && expr.name) vName = expr.name;
        } catch {}
      }
      attrParts.push(`onchange="(function(e){ ${vName} = e.target.checked; sinthRender(); })(event)"`);
      attrParts.push(`data-sinth-checked="${escAttr(vName)}"`);
    }
  }

  const attrStr = attrParts.length ? " " + attrParts.join(" ") : "";

  if (isVoid) {
    if (use.children.length > 0) SinthWarning.emit(`<${tag}> is void and cannot have children.`, use.loc);
    return `<${tag}${attrStr}>`;
  }

  const inner = use.children.map(c => renderChild(c, ctx, params, depth + 1)).join("");
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

export function expandUserComp(
  use:    CompUse,
  def:    CompDef,
  ctx:    CompileCtx,
  params: Map<string, string>,
  depth:  number,
): string {
  if (use.name === def.name && depth > 1) {
    throw new SinthError(`Recursive component '${def.name}' is not allowed.`, use.loc);
  }

  const local = new Map<string, string>();

  for (const p of def.params) {
    if (p.defaultVal !== undefined) local.set(p.name, litToString(p.defaultVal));
  }

  for (const attr of use.attrs) {
    if (attr.value === null) {
      local.set(attr.name, "true");
    } else if (attr.value.kind !== "null") {
      const raw = litToString(attr.value);
      local.set(attr.name, attr.value.kind === "str" ? interpolateAttr(raw, params) : raw);
    }
  }

  for (const p of def.params) {
    if (!local.has(p.name)) {
      throw new SinthError(
        `Component '${def.name}' requires parameter '${p.name}' but it was not provided.`,
        use.loc,
      );
    }
  }

  const slotHTML = use.children.map(c => renderChild(c, ctx, params, depth)).join("");
  local.set("slot", slotHTML);

  for (const block of def.styles) {
    ctx.extraCSS.push(processStyleBlock(block, ctx.scopeHash, local));
  }

  return def.body.map(c => renderChild(c, ctx, local, depth)).join("");
}

// script collector

export function collectScripts(
  file:    SinthFile,
  allDefs: Map<string, CompDef>,
): { componentScripts: string[]; pageScripts: { raw: string; attrs: Record<string, string> }[] } {
  const componentScripts: string[] = [];
  const pageScripts: { raw: string; attrs: Record<string, string> }[] = [];
  const seenFunctions = new Set<string>();

  for (const [, def] of allDefs) {
    for (const block of def.scripts) {
      for (const fn of extractFunctionNames(block.raw)) {
        if (seenFunctions.has(fn)) throw new SinthError(`Function '${fn}' defined in multiple component scripts.`);
        seenFunctions.add(fn);
      }
      componentScripts.push(`(function(){\n${block.raw}\n})();`);
    }
  }

  for (const block of file.scripts) {
    for (const fn of extractFunctionNames(block.raw)) {
      if (seenFunctions.has(fn)) throw new SinthError(`Function '${fn}' conflicts with a component script.`);
      seenFunctions.add(fn);
    }
    pageScripts.push({ raw: block.raw, attrs: block.attrs });
  }

  return { componentScripts, pageScripts };
}

export function extractFunctionNames(js: string): string[] {
  const names: string[] = [];
  const re = /^\s*(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) names.push(m[1]);
  return names;
}


// head gen

export interface HeadData {
  title?: string; fav?: string;
  lang:   string; charset: string; viewport: string;
  metaTags:  { name: string; content: string }[];
  metaProps: { property: string; content: string }[];
}

export function buildHeadData(meta: MetaEntry[]): HeadData {
  let title: string | undefined, fav: string | undefined;
  let lang = "en", charset = "UTF-8", viewport = "width=device-width, initial-scale=1.0";
  const metaTags:  { name: string; content: string }[]     = [];
  const metaProps: { property: string; content: string }[] = [];

  for (const m of meta) {
    const val = litToString(m.value);
    switch (m.key) {
      case "title":    title    = val; break;
      case "fav":      fav      = val; break;
      case "lang":     lang     = val; break;
      case "charset":  charset  = val; break;
      case "viewport": viewport = val; break;
      case "descr":    metaTags.push({ name: "description", content: val }); break;
      case "author":   metaTags.push({ name: "author",      content: val }); break;
      case "keywords": metaTags.push({ name: "keywords",    content: val }); break;
      case "robots":   metaTags.push({ name: "robots",      content: val }); break;
      default:
        if (m.key.startsWith("og") || m.key.startsWith("twitter")) {
          const prop = m.key
            .replace(/^og([A-Z])/, (_: string, c: string) => `og:${c.toLowerCase()}`)
            .replace(/^twitter([A-Z])/, (_: string, c: string) => `twitter:${c.toLowerCase()}`);
          metaProps.push({ property: prop, content: val });
        } else {
          metaTags.push({ name: camelToKebab(m.key), content: val });
        }
    }
  }

  return { title, fav, lang, charset, viewport, metaTags, metaProps };
}

export function faviconType(p: string): string {
  switch (path.extname(p).toLowerCase()) {
    case ".ico":  return "image/x-icon";
    case ".png":  return "image/png";
    case ".svg":  return "image/svg+xml";
    case ".gif":  return "image/gif";
    case ".webp": return "image/webp";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    default:
      SinthWarning.emit(`Unknown favicon extension '${path.extname(p)}', defaulting to image/x-icon`);
      return "image/x-icon";
  }
}

export function renderHead(
  hd:          HeadData,
  cssLinks:    string[],
  jsLinks:     { src: string; attrs: Record<string, string> }[],
  scopedCSS:   string,
  companionJS: string | undefined,
): string {
  const lines: string[] = [];
  lines.push(`  <meta charset="${escAttr(hd.charset)}">`);
  lines.push(`  <meta name="viewport" content="${escAttr(hd.viewport)}">`);
  if (hd.title) lines.push(`  <title>${esc(hd.title)}</title>`);
  if (hd.fav)   lines.push(`  <link rel="icon" href="${escAttr(hd.fav)}" type="${faviconType(hd.fav)}">`);
  for (const m of hd.metaTags)  lines.push(`  <meta name="${escAttr(m.name)}" content="${escAttr(m.content)}">`);
  for (const m of hd.metaProps) lines.push(`  <meta property="${escAttr(m.property)}" content="${escAttr(m.content)}">`);
  for (const css of cssLinks)   lines.push(`  <link rel="stylesheet" href="${escAttr(css)}">`);
  if (scopedCSS.trim())          lines.push(`  <style>\n${scopedCSS}\n  </style>`);
  for (const js of jsLinks) {
    const extra = Object.entries(js.attrs)
      .map(([k, v]) => v === "true" ? k : `${k}="${escAttr(v)}"`)
      .join(" ");
    lines.push(`  <script src="${escAttr(js.src)}"${extra ? " " + extra : ""}></script>`);
  }
  if (companionJS) lines.push(`  <script src="${escAttr(companionJS)}"></script>`);
  return `<head>\n${lines.join("\n")}\n</head>`;
}


// sinth runtime

function compileFunctionDef(fn: FunctionDef): string {
  const paramsJS = fn.params.map(p => p.name).join(", ");
  const bodyStatements: string[] = [];
  for (const child of fn.body) {
    switch (child.kind) {
      case "text":
        break;
      case "expr":
        bodyStatements.push(`return ${compileExprToJS(child.expression)};`);
        break;
      case "assign_stmt":
        bodyStatements.push(`${compileExprToJS(child.expression)};`);
        break;
      case "if":
        bodyStatements.push(compileIfToJS(child as IfBlock));
        break;
      case "for":
        break;
    }
  }
  return `function ${fn.name}(${paramsJS}) {\n${bodyStatements.map(s => `  ${s}`).join("\n")}\n}`;
}

export function buildRuntime(opts: {
  varDecls:     VarDeclaration[];
  bodyHTML:     string;
  logicBlocks:  string[];
  mixedBlocks:  MixedBlockEntry[];
  assignedVars: Set<string>;
  exprRegistry: string[];
  sharedRuntime: boolean;
  functionsJS:  string;
}): string | { page: string; shared: string } {
  const { varDecls, bodyHTML, logicBlocks, mixedBlocks, assignedVars, exprRegistry, functionsJS } = opts;

  const needsExpr   = bodyHTML.includes("sinth-expr");
  const needsIf     = bodyHTML.includes("data-sinth-if");
  const needsFor    = bodyHTML.includes("data-sinth-for");
  const needsDelay  = bodyHTML.includes("data-sinth-delay") || bodyHTML.includes("data-sinth-delay-expr-id") || mixedBlocks.some(mb => mb.ifHTML.includes("data-sinth-delay") || mb.ifHTML.includes("data-sinth-delay-expr-id") || mb.elseHTML.includes("data-sinth-delay") || mb.elseHTML.includes("data-sinth-delay-expr-id"));
  const needsMixed  = mixedBlocks.length > 0;
  const needsLogic  = logicBlocks.length > 0;
  const needsRender = needsExpr || needsIf || needsFor || needsMixed || needsLogic;

  const varLines = varDecls.map(v => {
    if (!v.value) {
      if (!assignedVars.has(v.name)) {
        const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]" };
        SinthWarning.emit(
          `Variable '${v.name}' is declared but never assigned. Defaulting to ${defaults[v.varType] ?? "undefined"}.`,
          v.loc,
        );
      }
      const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]" };
      return `var ${v.name} = ${defaults[v.varType] ?? "undefined"};`;
    }
    const val = litToString(v.value);
    if (val.startsWith("__VAR__")) return `var ${v.name} = ${val.slice(7)};`;
    if (val.startsWith("__ARR__")) return `var ${v.name} = ${val.slice(7)};`;
    if (v.varType === "obj") return `var ${v.name} = ${val};`;
    if (v.varType === "str")  return `var ${v.name} = ${JSON.stringify(val)};`;
    if (v.varType === "str[]" && typeof val === 'string' && val.startsWith("__ARR__")) {
      try {
        const arr = JSON.parse(val.slice(7));
        return `var ${v.name} = ${JSON.stringify(arr)};`;
      } catch { return `var ${v.name} = ${val.slice(7)};`; }
    }
    return `var ${v.name} = ${val};`;
  }).join("\n");

  if (!needsRender && !needsDelay) {
    return varLines ? `// Sinth compiled runtime\n${varLines}` : "";
  }

  let helpers = "";

  if (needsExpr || needsIf || needsFor) {
    helpers += `
function sinthExpr(el) {
  try {
    var exprFn = __X[el.dataset.exprId];
    if (exprFn) el.textContent = exprFn({});
  } catch(e) {}
}
`;
  }

  if (needsIf || needsMixed) {
    helpers += `
function sinthReplaceInsert(t, anchor, ifId, replaceId) {
  if (anchor) {
    var cur = anchor.nextSibling;
    while (cur && cur !== t) { var nx = cur.nextSibling; cur.remove(); cur = nx; }
  } else {
    anchor = document.createElement('span');
    anchor.style.display = 'none';
    anchor.dataset.sinthIfAnchor = ifId;
    t.parentNode.insertBefore(anchor, t);
  }
  var _rp = null, _rpParent = null, _rpNext = null;
  if (replaceId) {
    _rp = document.getElementById(replaceId);
    if (_rp) {
      _rpParent = _rp.parentNode;
      _rpNext = _rp.nextSibling;
      _rp.parentNode.removeChild(_rp);
      anchor._sinthReplaced = _rp;
      anchor._sinthReplacedParent = _rpParent;
      anchor._sinthReplacedNext = _rpNext;
    }
  }
  var frag = document.createRange().createContextualFragment(t.innerHTML);
  frag.querySelectorAll('.sinth-expr').forEach(sinthExpr);
  if (${needsDelay}) {
    frag.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
    frag.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
  }
  var fragFirst = frag.firstChild;
  var fragLast = frag.lastChild;
  if (_rpParent && _rpNext) {
    _rpParent.insertBefore(frag, _rpNext);
  } else if (_rpParent) {
    _rpParent.appendChild(frag);
  } else {
    t.parentNode.insertBefore(frag, t);
  }
  if (replaceId && anchor) {
    anchor._sinthInsertedFirst = fragFirst;
    anchor._sinthInsertedLast = fragLast;
  }
  return anchor;
}
`;
  }

  if (needsDelay) {
    helpers += `
function sinthDelay(el) {
  if (el.dataset.sinthDelayDone) { el.style.display = ''; return; }
  el.dataset.sinthDelayDone = '1';
  var ms = parseInt(el.dataset.sinthDelay) || 0;
  el.style.display = 'none';
  if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
  else el.style.display = '';
}
function sinthDelayExpr(el) {
  try {
    var fn = __X[el.dataset.sinthDelayExprId];
    var ms = fn ? parseInt(fn()) || 0 : 0;
    el.style.display = '';
    if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
  } catch(e) {}
}
`;
  }

  if (needsIf) {
    helpers += `
function sinthIfBlock(t) {
  var ifId = t.dataset.sinthIfId;
  var anchor = t.parentNode.querySelector('[data-sinth-if-anchor="' + ifId + '"]');
  var condFn = __X[t.dataset.sinthIfExpr];
  var cond = condFn ? condFn() : false;
  if (cond) {
    anchor = sinthReplaceInsert(t, anchor, ifId, t.dataset.sinthIfReplace);
  } else {
    if (anchor) {
      if (anchor._sinthReplaced) {
        var insFirst = anchor._sinthInsertedFirst;
        var insLast = anchor._sinthInsertedLast;
        var rpParent = anchor._sinthReplacedParent;
        var rpNext = anchor._sinthReplacedNext;
        if (insFirst && insLast) {
          var cur = insFirst;
          while (cur && cur !== insLast) {
            var next = cur.nextSibling;
            cur.remove();
            cur = next;
          }
          if (insLast) insLast.remove();
        }
        if (rpParent && rpNext) {
          rpParent.insertBefore(anchor._sinthReplaced, rpNext);
        } else if (rpParent) {
          rpParent.appendChild(anchor._sinthReplaced);
        }
      } else {
        var cur2 = anchor.nextSibling;
        while (cur2 && cur2 !== t) { var nx2 = cur2.nextSibling; cur2.remove(); cur2 = nx2; }
      }
      anchor.remove();
    }
    var elseT = t.nextElementSibling;
    if (elseT && elseT.hasAttribute('data-sinth-else')) {
      var elseIfId = elseT.dataset.sinthIfId;
      var ea = t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + elseIfId + '"]');
      if (ea) {
        var cur3 = ea.nextSibling;
        while (cur3 && cur3 !== t) { var nx3 = cur3.nextSibling; cur3.remove(); cur3 = nx3; }
      } else {
        ea = document.createElement('span');
        ea.style.display = 'none';
        ea.dataset.sinthIfAnchor = '__else__' + elseIfId;
        t.parentNode.insertBefore(ea, t);
      }
      var ef = document.createRange().createContextualFragment(elseT.innerHTML);
      ef.querySelectorAll('.sinth-expr').forEach(sinthExpr);
      if (${needsDelay}) {
        ef.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
        ef.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
      }
      t.parentNode.insertBefore(ef, t);
    } else {
      var ea2 = t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + ifId + '"]');
      if (ea2) {
        var ec = ea2.nextSibling;
        while (ec && ec !== t) { var en = ec.nextSibling; ec.remove(); ec = en; }
        ea2.remove();
      }
    }
  }
}
`;
  }

  if (needsFor) {
    helpers += `
function hashString(str) {
  var hash = 0, i, chr;
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return String(hash);
}
function sinthForBlock(t) {
  var source = window[t.dataset.sinthFor];
  if (source === undefined) source = [];
  var newHash = '';
  try { newHash = hashString(JSON.stringify(source)); } catch(e) { newHash = ''; }
  if (t.dataset.sinthForHash && t.dataset.sinthForHash === newHash) {
    return;
  }
  t.dataset.sinthForHash = newHash;
  var isObj = (typeof source === 'object' && source !== null && !Array.isArray(source));
  var entries;
  if (isObj) {
    entries = Object.entries(source);
  } else {
    if (!Array.isArray(source)) source = [];
    entries = source.map(function(item, index) { return [index, item]; });
  }
  var anchor = t.parentNode ? t.parentNode.querySelector('[data-sinth-for-anchor="' + t.dataset.sinthFor + '"]') : null;
  if (anchor) {
    var cur2 = anchor.nextSibling;
    while (cur2 && cur2 !== t) { var nx2 = cur2.nextSibling; cur2.remove(); cur2 = nx2; }
    anchor.remove();
  }
  var fa = document.createElement('span');
  fa.style.display = 'none';
  fa.dataset.sinthForAnchor = t.dataset.sinthFor;
  t.parentNode && t.parentNode.insertBefore(fa, t);
  var _loopIdx = 0;
  entries.forEach(function(entry) {
    var _k = entry[0];
    var _v = entry[1];
    var _item = (t.dataset && t.dataset.sinthItem) ? t.dataset.sinthItem : '__item__';
    var _key = t.dataset && t.dataset.sinthKey ? t.dataset.sinthKey : null;
    var _idx = t.dataset && t.dataset.sinthIndex ? t.dataset.sinthIndex : null;
    _loopIdx++;
    if (t.dataset.sinthIfReplace) {
      var _rp = document.getElementById(t.dataset.sinthIfReplace);
      if (_rp) _rp.parentNode.removeChild(_rp);
    }
    var frag = document.createRange().createContextualFragment(t.innerHTML);
    frag.querySelectorAll('.sinth-expr').forEach(function(el) {
      try {
        var exprFn = __X[el.dataset.exprId];
        if (!exprFn) return;
        var _ctx = {};
        if (_item) _ctx[_item] = _v;
        if (_key)  _ctx[_key]  = _k;
        if (_idx)  _ctx[_idx]  = _loopIdx - 1;
        el.textContent = exprFn(_ctx);
        el.classList.remove('sinth-expr');
      } catch(e) {}
    });
    frag.querySelectorAll('template[data-sinth-if-expr]').forEach(function(ifT) {
      var condFn = __X[ifT.dataset.sinthIfExpr];
      var _ctx = {};
      if (_item) _ctx[_item] = _v;
      if (_key)  _ctx[_key]  = _k;
      if (_idx)  _ctx[_idx]  = _loopIdx - 1;
      var cond = false;
      try { if (condFn) cond = condFn(_ctx); } catch(e) {}
      if (cond) {
        var ifContent = document.createRange().createContextualFragment(ifT.innerHTML);
        ifContent.querySelectorAll('.sinth-expr').forEach(function(el2) {
          try {
            var exprFn2 = __X[el2.dataset.exprId];
            if (exprFn2) el2.textContent = exprFn2(_ctx);
          } catch(e) {}
        });
        ifT.parentNode.insertBefore(ifContent, ifT);
      } else {
        var elseT = ifT.nextElementSibling;
        if (elseT && elseT.hasAttribute('data-sinth-else')) {
          var elseContent = document.createRange().createContextualFragment(elseT.innerHTML);
          elseContent.querySelectorAll('.sinth-expr').forEach(function(el2) {
            try {
              var exprFn2 = __X[el2.dataset.exprId];
              if (exprFn2) el2.textContent = exprFn2(_ctx);
            } catch(e) {}
          });
          ifT.parentNode.insertBefore(elseContent, ifT);
        }
      }
    });
    if (${needsDelay}) {
      frag.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
      frag.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
    }
    t.parentNode && t.parentNode.insertBefore(frag, t);
  });
}
`;
  }

  if (needsMixed) {
    helpers += `
function sinthMixedBlock(el, condId, ifJS, ifHTML, elseJS, elseHTML) {
  var condFn = __X[condId];
  var cond = condFn ? condFn() : false;
  if (cond) {
    if (ifJS) eval(ifJS);
    el.innerHTML = ifHTML;
  } else {
    if (elseJS) eval(elseJS);
    el.innerHTML = elseHTML;
  }
  el.querySelectorAll('.sinth-expr').forEach(sinthExpr);
  el.querySelectorAll('template[data-sinth-if-expr]').forEach(sinthIfBlock);
  if (${needsDelay}) {
    el.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
    el.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
  }
}
`;
  }

  const exprArrayJS = exprRegistry.length > 0
    ? `var __X = [${exprRegistry.map((js) => `function(_ctx){ return ${js}; }`).join(",")}];\n`
    : "";

  let renderBody = "";
  renderBody += `  var _sx = window.scrollX, _sy = window.scrollY;\n`;

  if (needsLogic) {
    renderBody += logicBlocks.map(b => b.replace(/^/gm, "  ")).join("\n") + "\n";
  }

  if (needsMixed) {
    for (const mb of mixedBlocks) {
      renderBody += `  (function() {
    var __el = document.getElementById(${JSON.stringify(mb.replaceId || mb.id)});
    if (__el) sinthMixedBlock(__el, ${mb.conditionJS}, ${JSON.stringify(mb.ifJS)}, ${JSON.stringify(mb.ifHTML)}, ${JSON.stringify(mb.elseJS)}, ${JSON.stringify(mb.elseHTML)});
  })();\n`;
    }
  }

  renderBody += `  document.querySelectorAll('[data-sinth-remove]').forEach(function(el) {
    var target = document.getElementById(el.dataset.sinthRemove);
    if (target) target.remove();
  });\n`;

  if (needsIf) {
    renderBody += `  document.querySelectorAll('template[data-sinth-if-expr]').forEach(sinthIfBlock);\n`;
  }
  if (needsFor) {
    renderBody += `  document.querySelectorAll('template[data-sinth-for]').forEach(sinthForBlock);\n`;
  }
  renderBody += `  document.querySelectorAll('[data-sinth-value]').forEach(function(el) {
    try { el.value = window[el.dataset.sinthValue] || ''; } catch(e) {}
  });\n`;
  renderBody += `  document.querySelectorAll('[data-sinth-checked]').forEach(function(el) {
    try { el.checked = !!window[el.dataset.sinthChecked]; } catch(e) {}
  });\n`;
  if (needsExpr) {
    renderBody += `  document.querySelectorAll('.sinth-expr').forEach(sinthExpr);\n`;
  }
  if (needsDelay) {
    renderBody += `  setTimeout(function() {
    document.querySelectorAll('[data-sinth-delay]').forEach(sinthDelay);
    document.querySelectorAll('[data-sinth-delay-expr-id]').forEach(sinthDelayExpr);
  }, 0);\n`;
  }
  renderBody += `  window.scrollTo(_sx, _sy);\n`;

  const renderFunc = needsRender ? `function sinthRender() {\n${renderBody}}\nsinthRender();` : "";

  const pageCode = `// Sinth page runtime
${varLines}
${exprArrayJS}
${renderFunc}`;

  if (opts.sharedRuntime && helpers.trim()) {
    const sharedCode = `// Sinth shared runtime
${helpers}`;
    return { page: pageCode, shared: sharedCode };
  }

  return `// Sinth compiled runtime
${varLines}
${functionsJS ? functionsJS + "\n" : ""}${helpers}
${exprArrayJS}
${renderFunc}`;
}

// main compilation pipeline

export interface CompileOptions {
  projectRoot:  string;
  outDir:       string;
  libraryPaths: string[];
  minify:       boolean;
  checkOnly:    boolean;
  sharedRuntime: boolean;
}

export function compileFile(filePath: string, opts: CompileOptions): { html: string; shared?: string } | null {
  const absPath = path.resolve(filePath);
  const file    = parseFile(absPath);

  const cfg: ResolverConfig = { projectRoot: opts.projectRoot, libraryPaths: opts.libraryPaths };
  const { allDefs, customEls, cssLinks, jsLinks } = resolveImports(file, cfg);
  const hash = fnv1a(absPath);

  const allVarDecls: VarDeclaration[] = file.varDecls;
  const functionDefs: FunctionDef[]   = file.functions;   // ← new

  const ctx: CompileCtx = {
    allDefs, customEls, cssLinks, jsLinks,
    scopeHash:    hash,
    pageFile:     absPath,
    extraCSS:     [],
    mixedBlocks:  [],
    mixedCounter: 0,
    logicBlocks:  [],
    ifIdCounter:  0,
    exprRegistry: [],
    exprMap:      new Map(),
  };

  if (!file.isPage) {
    const body    = file.uses.map(u => renderCompUse(u, ctx, new Map(), 0)).join("\n");
    const pageCSS = file.styles.map(s => processStyleBlock(s, hash)).join("\n");
    const allCSS  = [pageCSS, ...ctx.extraCSS].join("\n");
       const h = `${body}\n<style>\n${allCSS}\n</style>`;
    return { html: h };
  }

  const headData = buildHeadData(file.meta);
  const bodyHTML = file.uses.map(u => renderCompUse(u, ctx, new Map(), 0)).join("\n");
  const pageCSS   = file.styles.map(s => processStyleBlock(s, hash, new Map())).join("\n");
  const scopedCSS = [pageCSS, ...ctx.extraCSS].filter(c => c.trim()).join("\n");
  const { componentScripts, pageScripts } = collectScripts(file, allDefs);

  // collect all assigned variables for default-value warnings
  const assignedVars = new Set<string>();
  for (const s of file.scripts) {
    for (const m of s.raw.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:[+\-]?=)/g)) assignedVars.add(m[1]);
  }
  for (const v of file.varDecls) { if (v.value) assignedVars.add(v.name); }

  // compile function definitions to JS
  const compiledFunctions = functionDefs.map(f => compileFunctionDef(f)).join("\n");

  // companion JS file (needs same name as .sinth, adds support for JS libraries)
  const companionJS = (() => {
    const base = absPath.replace(/\.sinth$/, ".js");
    return fs.existsSync(base) ? path.basename(base) : undefined;
  })();

  const relativeCssLinks = cssLinks.map(css => {
    const rel = path.relative(path.dirname(absPath), css).replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  });
  const relativeJsLinks = jsLinks.map(js => ({
    ...js,
    src: (() => {
      const rel = path.relative(path.dirname(absPath), js.src).replace(/\\/g, "/");
      return rel.startsWith(".") ? rel : "./" + rel;
    })(),
  }));

  const runtimeResult = buildRuntime({
    varDecls:     allVarDecls,
    bodyHTML,
    logicBlocks:  ctx.logicBlocks,
    mixedBlocks:  ctx.mixedBlocks,
    assignedVars,
    exprRegistry: ctx.exprRegistry,
    sharedRuntime: opts.sharedRuntime,
    functionsJS:  compiledFunctions,   // ← pass compiled functions
  });
  const runtimeJS = typeof runtimeResult === 'string' ? runtimeResult : runtimeResult.page;
  const sharedJS = typeof runtimeResult === 'string' ? null : runtimeResult.shared;


  const head = renderHead(headData, relativeCssLinks, relativeJsLinks, scopedCSS, companionJS);
  const scriptTags: string[] = [];
  if (componentScripts.length > 0) {
    scriptTags.push(`<script>\n${componentScripts.join("\n\n")}\n</script>`);
  }

  for (const s of pageScripts) {
    const extra = Object.entries(s.attrs)
      .map(([k, v]) => v === "true" ? k : `${k}="${escAttr(v)}"`)
      .join(" ");
    const globalised = s.raw.replace(/\b(let|const)\b/g, "var");
    scriptTags.push(`<script${extra ? " " + extra : ""}>\n${globalised}\n</script>`);
  }


const sharedRuntimeTag = (() => {
  if (!opts.sharedRuntime || !sharedJS) return "";
  
  const relPath = path.relative(opts.projectRoot, absPath);
  const htmlOutputDir = path.dirname(relPath.replace(/\.sinth$/, '.html'));
  const relativeRuntimePath = path.relative(htmlOutputDir, '.').replace(/\\/g, '/');
  const runtimeSrc = relativeRuntimePath ? `${relativeRuntimePath}/sinth-runtime.js` : './sinth-runtime.js';
  
  return `<script src="${runtimeSrc}"></script>`;
})();

  const html = [
    "<!DOCTYPE html>",
    `<html lang="${escAttr(headData.lang)}">`,
    head,
    `<body data-s="${hash}">`,
    bodyHTML,
    sharedRuntimeTag,
    runtimeJS.trim() ? `<script>\n${runtimeJS}\n</script>` : "",
    scriptTags.join("\n"),
    "</body>",
    "</html>",
  ].filter(Boolean).join("\n");

  const finalHTML = opts.minify ? minifyHTML(html) : html;
  return sharedJS ? { html: finalHTML, shared: sharedJS } : { html: finalHTML };
}

export function minifyHTML(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\n\s*\n/g, "\n").trim();
}

// file discovery & asset copy

export function findSinthPages(dir: string, outDir?: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (outDir && path.resolve(full) === path.resolve(outDir)) continue;
    if (entry.isDirectory()) results.push(...findSinthPages(full, outDir));
    else if (entry.name.endsWith(".sinth")) results.push(full);
  }
  return results;
}

export function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

