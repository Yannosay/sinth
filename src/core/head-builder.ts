import * as path from "path";
import { MetaEntry, SinthWarning } from "./types.ts";
import { esc, escAttr, litToString, camelToKebab } from "../utils.ts";



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
