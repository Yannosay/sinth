import { BUILTIN_MAP } from "./builtins.ts";
import { SinthError, SinthWarning, StyleBlock } from "./types.ts";
import { camelToKebab, interpolateAttr } from "../utils.ts";



/**
 * for who's reading this: this maps Sinth Style pseudo-class shorthand keywords to real CSS pseudo-classes.
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
