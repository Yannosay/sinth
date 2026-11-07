import { Loc, SinthError } from "./diagnostics";
import { ELEMENTS } from "./elements";

export type CssNode =
  | { k: "decl"; prop: string; value: string; line: number }
  | { k: "rule"; selector: string; children: CssNode[] }
  | { k: "at"; name: string; params: string; children: CssNode[] | null };

export interface StyleExpression {
  cssVar: string;
  source: string;
  line: number;
}

export interface StyleCompileOptions {
  scope?: string;
  reactiveNames?: ReadonlySet<string>;
  varPrefix: string;
  loc: Loc;
  sinthSyntax: boolean;
}

export interface StyleCompileResult {
  css: string;
  expressions: StyleExpression[];
}

const PSEUDO_CLASS: Record<string, string> = {
  onHover: ":hover", onFocus: ":focus", onActive: ":active", onVisited: ":visited", onChecked: ":checked",
  onDisabled: ":disabled", onEnabled: ":enabled", onRequired: ":required", onOptional: ":optional", onValid: ":valid",
  onInvalid: ":invalid", onPlaceholderShown: ":placeholder-shown", onFocusWithin: ":focus-within",
  onFocusVisible: ":focus-visible", onFirst: ":first-child", onLast: ":last-child", onFirstOfType: ":first-of-type",
  onLastOfType: ":last-of-type", onEmpty: ":empty", onTarget: ":target", onLink: ":link", onOpen: "[open]",
};

const PSEUDO_ELEMENT: Record<string, string> = {
  before: "::before", after: "::after", placeholder: "::placeholder", selection: "::selection",
  firstLine: "::first-line", firstLetter: "::first-letter", marker: "::marker", backdrop: "::backdrop",
};

const MEDIA_SHORTHAND: Record<string, string> = {
  dark: "(prefers-color-scheme: dark)",
  light: "(prefers-color-scheme: light)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
  print: "print",
  mobile: "(max-width: 640px)",
  tablet: "(min-width: 641px) and (max-width: 1024px)",
  desktop: "(min-width: 1025px)",
};

const QUOTED_CONTENT_PROPS = new Set(["content", "quotes"]);

export function camelToKebab(s: string): string {
  if (s.startsWith("--")) return s;
  const vendor = s.match(/^(Webkit|Moz|Ms|O)([A-Z].*)$/);
  if (vendor) return `-${vendor[1].toLowerCase()}-${camelToKebab(vendor[2][0].toLowerCase() + vendor[2].slice(1))}`;
  return s.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
}

class CssReader {
  pos = 0;
  line: number;

  constructor(private readonly src: string, private readonly sinth: boolean, private readonly loc: Loc) {
    this.line = loc.line;
  }

  fail(message: string): never {
    throw new SinthError("E0400", message, { file: this.loc.file, line: this.line, col: 1 });
  }

  private skipTrivia(): void {
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === "\n") {
        this.line++;
        this.pos++;
      } else if (c === " " || c === "\t" || c === "\r" || c === ";") {
        this.pos++;
      } else if (c === "/" && this.src[this.pos + 1] === "*") {
        const end = this.src.indexOf("*/", this.pos + 2);
        const stop = end === -1 ? this.src.length : end + 2;
        this.countLines(this.pos, stop);
        this.pos = stop;
      } else if (this.sinth && c === "/" && this.src[this.pos + 1] === "/") {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.pos++;
      } else if (this.sinth && c === "-" && this.src[this.pos + 1] === "-" && this.src[this.pos + 2] === "[") {
        const end = this.src.indexOf("]--", this.pos + 3);
        const stop = end === -1 ? this.src.length : end + 3;
        this.countLines(this.pos, stop);
        this.pos = stop;
      } else if (this.sinth && c === "-" && this.src[this.pos + 1] === "-" && !/[A-Za-z0-9_]/.test(this.src[this.pos + 2] ?? "")) {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.pos++;
      } else {
        break;
      }
    }
  }

  private countLines(from: number, to: number): void {
    for (let i = from; i < to; i++) if (this.src[i] === "\n") this.line++;
  }

  readBlock(): CssNode[] {
    const nodes: CssNode[] = [];
    for (;;) {
      this.skipTrivia();
      if (this.pos >= this.src.length) return nodes;
      if (this.src[this.pos] === "}") return nodes;
      nodes.push(this.readItem());
    }
  }

  private readItem(): CssNode {
    const startLine = this.line;
    let text = "";
    let depth = 0;
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === '"' || c === "'") {
        text += this.readQuoted(c);
        continue;
      }
      if (c === "#" && this.src[this.pos + 1] === "{") {
        const close = this.src.indexOf("}", this.pos);
        if (close === -1) this.fail("Unterminated interpolation '#{'");
        text += this.src.slice(this.pos, close + 1);
        this.pos = close + 1;
        continue;
      }
      if (c === "/" && this.src[this.pos + 1] === "*") {
        const end = this.src.indexOf("*/", this.pos + 2);
        const stop = end === -1 ? this.src.length : end + 2;
        this.countLines(this.pos, stop);
        this.pos = stop;
        continue;
      }
      if (this.sinth && depth === 0 && c === "-" && this.src[this.pos + 1] === "-" && /\s/.test(this.src[this.pos - 1] ?? " ") && !/[A-Za-z0-9_]/.test(this.src[this.pos + 2] ?? "")) {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.pos++;
        continue;
      }
      if (c === "(" || c === "[") depth++;
      if (c === ")" || c === "]") depth--;
      if (depth === 0) {
        if (c === "{") {
          this.pos++;
          const children = this.readBlock();
          if (this.src[this.pos] !== "}") this.fail(`Missing '}' for '${text.trim()}'`);
          this.pos++;
          return this.makeBlock(text.trim(), children, startLine);
        }
        if (c === ";" || c === "}") break;
        if (c === "\n") {
          const trimmed = text.trim();
          const continues = trimmed.endsWith(",") || trimmed.endsWith(":") || this.nextLineStartsWithBrace();
          if (this.sinth && trimmed && !continues) break;
        }
      }
      if (c === "\n") this.line++;
      text += c;
      this.pos++;
    }
    if (this.src[this.pos] === ";") this.pos++;
    return this.makeStatement(text.trim(), startLine);
  }

  private nextLineStartsWithBrace(): boolean {
    let i = this.pos + 1;
    while (i < this.src.length && /[ \t\r\n]/.test(this.src[i])) i++;
    return this.src[i] === "{";
  }

  private readQuoted(q: string): string {
    const start = this.pos;
    this.pos++;
    while (this.pos < this.src.length && this.src[this.pos] !== q) {
      if (this.src[this.pos] === "\\") this.pos++;
      if (this.src[this.pos] === "\n") this.fail("Unterminated string in style block");
      this.pos++;
    }
    this.pos++;
    return this.src.slice(start, this.pos);
  }

  private makeBlock(head: string, children: CssNode[], line: number): CssNode {
    if (head.startsWith("@")) {
      const m = head.match(/^@([\w-]+)\s*([\s\S]*)$/);
      return { k: "at", name: m?.[1] ?? "", params: (m?.[2] ?? "").trim(), children };
    }
    if (this.sinth) {
      const media = head.match(/^media\s*\(([\s\S]*)\)$/);
      if (media) return { k: "at", name: "media", params: convertMediaArgs(media[1]), children };
      if (MEDIA_SHORTHAND[head]) return { k: "at", name: "media", params: MEDIA_SHORTHAND[head], children };
      if (/^supports\s*\(/.test(head)) return { k: "at", name: "supports", params: head.slice(8).trim(), children };
    }
    if (!head) this.fail(`Missing selector before '{' (line ${line})`);
    return { k: "rule", selector: this.sinth ? convertSelector(head) : head, children };
  }

  private makeStatement(text: string, line: number): CssNode {
    if (text.startsWith("@")) {
      const m = text.match(/^@([\w-]+)\s*([\s\S]*)$/);
      return { k: "at", name: m?.[1] ?? "", params: (m?.[2] ?? "").trim(), children: null };
    }
    const colon = findTopLevelColon(text);
    if (colon === -1) {
      if (this.sinth && /^[A-Z][A-Za-z0-9]*$/.test(text)) this.fail(`Missing '{' after selector '${text}'`);
      this.fail(`Invalid style declaration '${text}' (expected 'property: value')`);
    }
    const prop = text.slice(0, colon).trim();
    const value = text.slice(colon + 1).trim();
    if (!value) this.fail(`Missing value for '${prop}'`);
    return { k: "decl", prop, value, line };
  }
}

function findTopLevelColon(text: string): number {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}

function convertMediaArgs(args: string): string {
  const parts = splitTopLevel(args, ",");
  return parts.map(p => {
    const t = p.trim();
    const colon = findTopLevelColon(t);
    if (colon === -1) return MEDIA_SHORTHAND[t] ?? unquote(t);
    const key = camelToKebab(t.slice(0, colon).trim());
    return `(${key}: ${unquote(t.slice(colon + 1).trim())})`;
  }).join(" and ");
}

function unquote(v: string): string {
  const m = v.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2] : v;
}

export function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      cur += c;
      if (c === "\\") cur += text[++i] ?? "";
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function convertSelector(sel: string): string {
  if (PSEUDO_CLASS[sel]) return "&" + PSEUDO_CLASS[sel];
  if (PSEUDO_ELEMENT[sel]) return "&" + PSEUDO_ELEMENT[sel];
  return splitTopLevel(sel, ",").map(part => part.trim().replace(/(^|[\s>+~(])([A-Z][A-Za-z0-9]*)(?=$|[\s.:#[>+~,)])/g, (m, pre: string, name: string) => {
    const info = ELEMENTS[name];
    if (!info) return m;
    return pre + info.tag + (info.className ? "." + info.className.split(" ").join(".") : "");
  }).replace(/&?\b(on[A-Z][A-Za-z]+)\b/g, (m, name: string) => (PSEUDO_CLASS[name] ? "&" + PSEUDO_CLASS[name] : m))).join(", ");
}

class StyleConverter {
  readonly expressions: StyleExpression[] = [];

  constructor(private readonly opts: StyleCompileOptions) {}

  convert(nodes: CssNode[]): CssNode[] {
    return nodes.map(n => {
      if (n.k === "decl") return this.convertDecl(n);
      if (n.k === "rule") return { ...n, children: this.convert(n.children) };
      return { ...n, children: n.children ? this.convert(n.children) : null };
    });
  }

  private convertDecl(d: Extract<CssNode, { k: "decl" }>): CssNode {
    if (d.prop.startsWith("$")) return d;
    const prop = camelToKebab(d.prop);
    let value = d.value;
    let important = "";
    const imp = value.match(/\s*!important$/);
    if (imp) {
      important = " !important";
      value = value.slice(0, imp.index);
    }
    const reactive = this.reactiveExpression(value);
    if (reactive !== undefined) {
      const cssVar = `${this.opts.varPrefix}${this.expressions.length}`;
      this.expressions.push({ cssVar, source: reactive, line: d.line });
      return { k: "decl", prop, value: `var(${cssVar})${important}`, line: d.line };
    }
    const single = value.match(/^(["'])([\s\S]*)\1$/);
    if (single && !QUOTED_CONTENT_PROPS.has(prop)) value = single[2];
    else if (single && prop === "content" && (/^(attr|counter|counters|url|var)\(|^(none|normal|open-quote|close-quote)$/.test(single[2]) || /^(["'])[\s\S]*\1$/.test(single[2]))) value = single[2];
    return { k: "decl", prop, value: value + important, line: d.line };
  }

  private reactiveExpression(value: string): string | undefined {
    const names = this.opts.reactiveNames;
    if (!names || names.size === 0) return undefined;
    const stripped = value.replace(/(["'])(?:\\.|(?!\1).)*\1/g, "\"\"");
    const ids = stripped.match(/[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/g) ?? [];
    const hit = ids.some(id => names.has(id.split(".")[0]));
    if (!hit) return undefined;
    if (/^[A-Za-z_$][\w$.]*$/.test(value.trim())) return value.trim();
    if (/[+*/?]|\(|\)/.test(stripped) || /^["']/.test(value.trim())) return value.trim();
    return undefined;
  }
}

export function parseCss(src: string, sinth: boolean, loc: Loc): CssNode[] {
  const reader = new CssReader(src, sinth, loc);
  const nodes = reader.readBlock();
  if (reader.pos < src.length) reader.fail("Unexpected '}' in style block");
  return nodes;
}

export function serializeNested(nodes: CssNode[], indent = ""): string {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.k === "decl") out.push(`${indent}${n.prop}: ${n.value};`);
    else if (n.k === "rule") out.push(`${indent}${n.selector} {\n${serializeNested(n.children, indent + "  ")}\n${indent}}`);
    else if (n.children === null) out.push(`${indent}@${n.name}${n.params ? " " + n.params : ""};`);
    else out.push(`${indent}@${n.name}${n.params ? " " + n.params : ""} {\n${serializeNested(n.children, indent + "  ")}\n${indent}}`);
  }
  return out.join("\n");
}

const UNSCOPED_ROOTS = /^(html|body|:root|:host)(?=$|[\s.:#[>+~])/;

function scopeComplexSelector(sel: string, scope: string): string {
  const trimmed = sel.trim();
  if (/^:global\(/.test(trimmed) && trimmed.endsWith(")")) return trimmed.slice(8, -1);
  if (trimmed.includes(":global(")) return trimmed.replace(/:global\(([^)]*)\)/g, "$1");
  if (UNSCOPED_ROOTS.test(trimmed) && !/[\s>+~]/.test(trimmed)) return trimmed;
  const cls = `.${scope}`;
  let depth = 0;
  let lastCompoundStart = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) lastCompoundStart = i + 1;
  }
  const head = trimmed.slice(0, lastCompoundStart);
  const last = trimmed.slice(lastCompoundStart);
  if (UNSCOPED_ROOTS.test(last)) return trimmed;
  const pe = last.indexOf("::");
  const scopedLast = pe === -1 ? last + cls : last.slice(0, pe) + cls + last.slice(pe);
  return head + scopedLast;
}

function combineSelectors(parents: string[], child: string): string[] {
  const out: string[] = [];
  for (const c of splitTopLevel(child, ",")) {
    const part = c.trim();
    for (const p of parents) out.push(part.includes("&") ? part.replace(/&/g, p) : p ? `${p} ${part}` : part);
  }
  return out;
}

interface FlatContext {
  selectors: string[];
  scope?: string;
  inKeyframes: boolean;
}

function flatten(nodes: CssNode[], ctx: FlatContext, indent: string): string[] {
  const out: string[] = [];
  const decls = nodes.filter((n): n is Extract<CssNode, { k: "decl" }> => n.k === "decl");
  if (decls.length && ctx.selectors.length) {
    const sel = ctx.inKeyframes ? ctx.selectors.join(", ") : ctx.selectors.map(s => (ctx.scope ? scopeComplexSelector(s, ctx.scope) : s)).join(",\n" + indent);
    out.push(`${indent}${sel} {\n${decls.map(d => `${indent}  ${d.prop}: ${d.value};`).join("\n")}\n${indent}}`);
  } else if (decls.length) {
    out.push(...decls.map(d => `${indent}${d.prop}: ${d.value};`));
  }
  for (const n of nodes) {
    if (n.k === "rule") {
      const selectors = ctx.inKeyframes ? [n.selector] : combineSelectors(ctx.selectors.length ? ctx.selectors : [""], n.selector);
      out.push(...flatten(n.children, { ...ctx, selectors }, indent));
    } else if (n.k === "at") {
      if (n.children === null) {
        out.push(`${indent}@${n.name}${n.params ? " " + n.params : ""};`);
        continue;
      }
      const keyframes = /keyframes$/.test(n.name);
      if (keyframes || n.name === "font-face" || n.name === "property" || n.name === "page" || n.name === "counter-style") {
        const inner = flatten(n.children, { selectors: [], scope: undefined, inKeyframes: true }, indent + "  ");
        out.push(`${indent}@${n.name}${n.params ? " " + n.params : ""} {\n${inner.join("\n")}\n${indent}}`);
        continue;
      }
      const inner = flatten(n.children, ctx, indent + "  ");
      if (inner.length) out.push(`${indent}@${n.name}${n.params ? " " + n.params : ""} {\n${inner.join("\n")}\n${indent}}`);
    }
  }
  return out;
}

export function flattenCss(nodes: CssNode[], scope?: string): string {
  return flatten(nodes, { selectors: [], scope, inKeyframes: false }, "").join("\n");
}

export type ScssCompiler = (source: string, file: string) => string;

export function compileStyle(raw: string, lang: "sinth" | "css" | "scss", opts: StyleCompileOptions, scss?: ScssCompiler): StyleCompileResult {
  const converter = new StyleConverter(opts);
  const tree = converter.convert(parseCss(raw, lang !== "css", opts.loc));
  if (lang === "scss") {
    if (!scss) throw new SinthError("E0401", "SCSS support requires the 'sass' package", opts.loc, "Install it in your project: npm install -D sass");
    const compiled = scss(serializeNested(tree), opts.loc.file);
    return { css: flattenCss(parseCss(compiled, false, opts.loc), opts.scope), expressions: converter.expressions };
  }
  return { css: flattenCss(tree, opts.scope), expressions: converter.expressions };
}
