import { Literal, SinthWarning } from "./core/types.ts";


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

export function interpolateAttr(text: string, params: Map<string, string>): string {
  let s = text.replace(/\\\{/g, "\x00LB\x00");
  s = s.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, n) => params.get(n) ?? `{${n}}`);
  return s.replace(/\x00LB\x00/g, "{");
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