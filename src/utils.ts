import { Literal } from "./core/types.ts";


export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 8);
}

export function camelToKebab(s: string): string {
  const vp = s.match(/^(Webkit|Moz|Ms)(.+)$/);
  if (vp) return `-${vp[1].toLowerCase()}-${camelToKebab(vp[2])}`;
  return s.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`);
}

export function tagNameToPascal(tag: string): string {
  return tag.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}

export function litToString(lit: Literal): string {
  switch (lit.kind) {
    case "str":  return lit.value;
    case "num":  return String(lit.value);
    case "bool": return String(lit.value);
    case "null": return "";
  }
}