import { Literal, SinthWarning } from "./core/types";

const PLACEHOLDER_PREFIX = "__SINTH_PH_";
let _phCounter = 0;
function createPlaceholder(tag: string): string {
  return `${PLACEHOLDER_PREFIX}${tag}_${_phCounter++}_${Date.now().toString(36)}__`;
}

const ESCAPED_LEFT_BRACE = createPlaceholder("LB");
const ESCAPED_DOLLAR = createPlaceholder("DOLLAR");

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
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
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
  let s = text.replace(/\\\{/g, ESCAPED_LEFT_BRACE);
  s = s.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, n) => params.get(n) ?? `{${n}}`);
  return s.replace(new RegExp(ESCAPED_LEFT_BRACE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "{");
}

export function renderText(text: string, params: Map<string, string>): string {
  const rawSlots = new Map<string, string>();

  let s = text.replace(/\\\$/g, ESCAPED_DOLLAR);

  s = s.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => {
    const val = params.get(n);
    if (val === undefined) return `$${n}`;
    if (n === "slot") {
      const ph = createPlaceholder("RAW");
      rawSlots.set(ph, val);
      return ph;
    }
    return val;
  });

  s = esc(s);

  for (const [ph, val] of rawSlots) {
    s = s.replace(new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), val);
  }
  s = s.replace(new RegExp(ESCAPED_DOLLAR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "$");

  const braceRe = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = braceRe.exec(s)) !== null) {
    SinthWarning.emit(
      `Use $param for text interpolation; {param} is for attributes. Found '${m[0]}' in text.`
    );
  }

  return s;
}