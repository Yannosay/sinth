export interface ParamInfo {
  name: string;
  type?: string;
  defaultValue?: string;
  optional: boolean;
  bindable: boolean;
}

export interface SymbolInfo {
  kind: "component" | "function" | "var";
  name: string;
  params: ParamInfo[];
  signature: string;
  line: number;
  character: number;
  returnType?: string;
  varType?: string;
}

const TYPE_NAMES = new Set(["str", "num", "int", "bool", "obj", "ui", "any", "void", "fn"]);

export function splitTopLevel(text: string): string[] {
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
    if (c === "\"" || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function parseParams(text: string): ParamInfo[] {
  return splitTopLevel(text).map(raw => {
    let p = raw.trim();
    const eq = findDefault(p);
    let defaultValue: string | undefined;
    if (eq !== -1) {
      defaultValue = p.slice(eq + 1).trim();
      p = p.slice(0, eq).trim();
    }
    let bindable = false;
    if (/^bind\s+/.test(p)) {
      bindable = true;
      p = p.replace(/^bind\s+/, "");
    }
    p = p.replace(/^\.\.\./, "");
    let type: string | undefined;
    const typed = p.match(/^([a-z]+)((?:\[\])*\??)\s+([A-Za-z_$][\w$]*)$/);
    const colon = p.match(/^([A-Za-z_$][\w$]*)\s*\??\s*:\s*([a-z]+(?:\[\])*\??)$/);
    let name = p;
    if (typed && TYPE_NAMES.has(typed[1])) {
      type = typed[1] + typed[2];
      name = typed[3];
    } else if (colon) {
      name = colon[1];
      type = colon[2];
    }
    const nullable = !!type && type.endsWith("?");
    const optionalMark = name.endsWith("?");
    name = name.replace(/\?$/, "");
    return { name, type, defaultValue, optional: defaultValue !== undefined || nullable || optionalMark, bindable };
  }).filter(p => /^[A-Za-z_$][\w$]*$/.test(p.name));
}

function findDefault(p: string): number {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === "\"" || c === "'" || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "=" && depth === 0 && p[i + 1] !== "=" && p[i - 1] !== "=" && p[i - 1] !== "!" && p[i + 1] !== ">") return i;
  }
  return -1;
}

function stripComments(text: string): string {
  let out = "";
  let i = 0;
  let quote = "";
  while (i < text.length) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (c === quote || (c === "\n" && quote !== "`")) quote = "";
      i++;
      continue;
    }
    if (c === "\"" || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "-" && text[i + 1] === "-" && text[i + 2] === "[") {
      const end = text.indexOf("]--", i + 3);
      const stop = end === -1 ? text.length : end + 3;
      out += text.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (c === "-" && text[i + 1] === "-" && !/[\w-]/.test(text[i + 2] ?? "")) {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function positionAt(text: string, offset: number): { line: number; character: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - before.lastIndexOf("\n") - 1 };
}

function readBalanced(text: string, open: number): string | undefined {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return undefined;
}

export function analyzeSource(source: string): SymbolInfo[] {
  const text = stripComments(source);
  const out: SymbolInfo[] = [];
  const compRe = /\b(?:export\s+|private\s+)?component\s+([A-Z]\w*)\s*(\()?/g;
  for (let m = compRe.exec(text); m; m = compRe.exec(text)) {
    const params = m[2] ? readBalanced(text, m.index + m[0].length - 1) ?? "" : "";
    const pos = positionAt(text, m.index);
    out.push({ kind: "component", name: m[1], params: parseParams(params), signature: `component ${m[1]}(${params.replace(/\s+/g, " ").trim()})`, ...pos });
  }
  const fnRe = /\b(?:async\s+)?function\s+([a-z_$][\w$]*)\s*\(/g;
  for (let m = fnRe.exec(text); m; m = fnRe.exec(text)) {
    const open = m.index + m[0].length - 1;
    const params = readBalanced(text, open) ?? "";
    const after = text.slice(open + params.length + 2, open + params.length + 40).match(/^\s*(?:->|:)\s*([a-z]+(?:\[\])*\??)/);
    const pos = positionAt(text, m.index);
    out.push({
      kind: "function", name: m[1], params: parseParams(params), returnType: after?.[1],
      signature: `function ${m[1]}(${params.replace(/\s+/g, " ").trim()})${after ? " -> " + after[1] : ""}`, ...pos,
    });
  }
  const varRe = /^[ \t]*(?:persist\s+)?(var|const|computed)\s+(?:([a-z]+(?:\[\])*\??)\s+)?([A-Za-z_$][\w$]*)/gm;
  for (let m = varRe.exec(text); m; m = varRe.exec(text)) {
    const type = m[2] && TYPE_NAMES.has(m[2].replace(/[[\]?]/g, "")) ? m[2] : undefined;
    const name = type ? m[3] : m[2] && !TYPE_NAMES.has(m[2]) ? m[2] : m[3];
    const pos = positionAt(text, m.index + m[0].indexOf(name));
    out.push({ kind: "var", name, params: [], varType: type, signature: `${m[1]} ${type ? type + " " : ""}${name}`, ...pos });
  }
  return out;
}

export function enclosingCall(textBefore: string): { name: string; argText: string } | undefined {
  let depth = 0;
  for (let i = textBefore.length - 1; i >= 0; i--) {
    const c = textBefore[i];
    if (c === ")" || c === "]") depth++;
    else if (c === "[") depth--;
    else if (c === "(") {
      if (depth === 0) {
        const m = textBefore.slice(0, i).match(/(\$?[A-Za-z_][\w.$]*)\s*$/);
        return m ? { name: m[1], argText: textBefore.slice(i + 1) } : undefined;
      }
      depth--;
    } else if ((c === "{" || c === "}") && depth === 0) return undefined;
  }
  return undefined;
}

export function formatSinth(source: string, indentUnit = "  "): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let indent = 0;
  let blank = 0;
  const out: string[] = [];
  let inBlockComment = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (++blank <= 1) out.push("");
      continue;
    }
    blank = 0;
    if (inBlockComment) {
      out.push(raw.replace(/\s+$/, ""));
      if (line.includes("]--")) inBlockComment = false;
      continue;
    }
    if (line.startsWith("--[") && !line.includes("]--")) {
      out.push(indentUnit.repeat(indent) + line);
      inBlockComment = true;
      continue;
    }
    let net = 0;
    let quote = "";
    const code = line.replace(/(^|\s)--(?![\w-]*\s*:|\[).*$/, "");
    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = "";
        continue;
      }
      if (c === "\"" || c === "'" || c === "`") quote = c;
      else if (c === "{" || c === "(") net++;
      else if (c === "}" || c === ")") net--;
    }
    const leadingClose = /^[})\]]/.test(line) ? 1 : 0;
    out.push(indentUnit.repeat(Math.max(0, indent - leadingClose)) + line);
    indent = Math.max(0, indent + net);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}
