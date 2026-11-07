import { MetaEntry } from "./ast";
import { SinthError } from "./diagnostics";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function hashString(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).padEnd(12, "0");
}

export interface HeadData {
  title?: string;
  lang: string;
  charset: string;
  viewport: string;
  favicon?: string;
  canonical?: string;
  manifest?: string;
  appleTouchIcon?: string;
  base?: string;
  bodyClass?: string;
  htmlClass?: string;
  metaNames: [string, string][];
  metaProps: [string, string][];
}

const NAME_MAP: Record<string, string> = {
  descr: "description", description: "description", author: "author", keywords: "keywords", robots: "robots",
  themeColor: "theme-color", colorScheme: "color-scheme", generator: "generator",
};

export interface MetaValue {
  key: string;
  value: unknown;
  known: boolean;
  loc: MetaEntry["loc"];
}

export function buildHead(meta: MetaValue[], resolveAsset: (value: string) => string): HeadData {
  const head: HeadData = {
    lang: "en", charset: "utf-8", viewport: "width=device-width, initial-scale=1", metaNames: [], metaProps: [],
  };
  for (const m of meta) {
    if (!m.known) {
      throw new SinthError("E0700", `Metadata '${m.key}' must be computable at build time`, m.loc, "Use literals, imported JSON, constants and route params. Values that need the browser (fetch, localStorage, user input) can't go in the page head");
    }
    if (m.value === null || m.value === undefined || m.value === false) continue;
    if (typeof m.value === "object") throw new SinthError("E0701", `Metadata '${m.key}' must be a string, number or boolean`, m.loc);
    const value = String(m.value);
    switch (m.key) {
      case "title": head.title = value; break;
      case "lang": head.lang = value; break;
      case "charset": head.charset = value; break;
      case "viewport": head.viewport = value; break;
      case "fav":
      case "favicon": head.favicon = resolveAsset(value); break;
      case "canonical": head.canonical = value; break;
      case "manifest": head.manifest = resolveAsset(value); break;
      case "appleTouchIcon": head.appleTouchIcon = resolveAsset(value); break;
      case "base": head.base = value; break;
      case "bodyClass": head.bodyClass = value; break;
      case "htmlClass": head.htmlClass = value; break;
      default:
        if (NAME_MAP[m.key]) head.metaNames.push([NAME_MAP[m.key], value]);
        else if (/^og[A-Z]/.test(m.key)) {
          const prop = "og:" + m.key.slice(2).replace(/[A-Z]/g, (c, i: number) => (i === 0 ? c.toLowerCase() : "_" + c.toLowerCase()));
          head.metaProps.push([prop, /image|url$/i.test(m.key) ? resolveAsset(value) : value]);
        } else if (/^twitter[A-Z]/.test(m.key)) {
          const name = "twitter:" + m.key.slice(7).replace(/[A-Z]/g, (c, i: number) => (i === 0 ? c.toLowerCase() : "_" + c.toLowerCase()));
          head.metaNames.push([name, /image$/i.test(m.key) ? resolveAsset(value) : value]);
        }
    }
  }
  const has = (list: [string, string][], key: string): boolean => list.some(([k]) => k === key);
  const description = head.metaNames.find(([k]) => k === "description")?.[1];
  if (head.title && !has(head.metaProps, "og:title")) head.metaProps.push(["og:title", head.title]);
  if (description && !has(head.metaProps, "og:description")) head.metaProps.push(["og:description", description]);
  if (!has(head.metaProps, "og:type")) head.metaProps.push(["og:type", "website"]);
  if (!has(head.metaNames, "twitter:card")) head.metaNames.push(["twitter:card", has(head.metaProps, "og:image") ? "summary_large_image" : "summary"]);
  return head;
}

function faviconType(href: string): string | undefined {
  const ext = href.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ico": return "image/x-icon";
    case "png": return "image/png";
    case "svg": return "image/svg+xml";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "jpg":
    case "jpeg": return "image/jpeg";
    default: return undefined;
  }
}

export interface DocumentAssets {
  styles: string[];
  scripts: { src: string; module: boolean; attrs: Record<string, string | boolean> }[];
  preloads: string[];
  inlineHead: string[];
}

export function renderDocument(head: HeadData, body: string, assets: DocumentAssets): string {
  const lines: string[] = [];
  lines.push(`<meta charset="${escapeAttr(head.charset)}">`);
  lines.push(`<meta name="viewport" content="${escapeAttr(head.viewport)}">`);
  if (head.base) lines.push(`<base href="${escapeAttr(head.base)}">`);
  if (head.title !== undefined) lines.push(`<title>${escapeHtml(head.title)}</title>`);
  for (const [name, content] of head.metaNames) lines.push(`<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`);
  for (const [prop, content] of head.metaProps) lines.push(`<meta property="${escapeAttr(prop)}" content="${escapeAttr(content)}">`);
  if (head.canonical) lines.push(`<link rel="canonical" href="${escapeAttr(head.canonical)}">`);
  if (head.favicon) {
    const type = faviconType(head.favicon);
    lines.push(`<link rel="icon" href="${escapeAttr(head.favicon)}"${type ? ` type="${type}"` : ""}>`);
  }
  if (head.appleTouchIcon) lines.push(`<link rel="apple-touch-icon" href="${escapeAttr(head.appleTouchIcon)}">`);
  if (head.manifest) lines.push(`<link rel="manifest" href="${escapeAttr(head.manifest)}">`);
  for (const href of assets.preloads) lines.push(`<link rel="modulepreload" href="${escapeAttr(href)}">`);
  for (const href of assets.styles) lines.push(`<link rel="stylesheet" href="${escapeAttr(href)}">`);
  for (const s of assets.scripts) {
    const attrs = Object.entries(s.attrs)
      .filter(([, v]) => v !== false)
      .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeAttr(String(v))}"`))
      .join("");
    lines.push(`<script${s.module ? ' type="module"' : ""} src="${escapeAttr(s.src)}"${attrs}></script>`);
  }
  lines.push(...assets.inlineHead);
  const htmlClass = head.htmlClass ? ` class="${escapeAttr(head.htmlClass)}"` : "";
  const bodyClass = head.bodyClass ? ` class="${escapeAttr(head.bodyClass)}"` : "";
  return `<!DOCTYPE html>\n<html lang="${escapeAttr(head.lang)}"${htmlClass}>\n<head>\n${lines.map(l => "  " + l).join("\n")}\n</head>\n<body${bodyClass}>\n${body}\n</body>\n</html>\n`;
}
