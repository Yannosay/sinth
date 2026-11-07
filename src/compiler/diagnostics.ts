export interface Loc {
  file: string;
  line: number;
  col: number;
}

export interface Span extends Loc {
  length?: number;
}

export type Severity = "error" | "warning";

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  loc?: Span;
  hint?: string;
}

const sourceCache = new Map<string, string>();

export function registerSource(file: string, source: string): void {
  sourceCache.set(file, source);
}

export function getSource(file: string): string | undefined {
  return sourceCache.get(file);
}

export class SinthError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(code: string, message: string, loc?: Span, hint?: string) {
    super(message);
    this.name = "SinthError";
    this.diagnostic = { severity: "error", code, message, loc, hint };
    Object.setPrototypeOf(this, SinthError.prototype);
  }

  get loc(): Span | undefined {
    return this.diagnostic.loc;
  }

  get code(): string {
    return this.diagnostic.code;
  }

  format(color = false): string {
    return formatDiagnostic(this.diagnostic, color);
  }
}

export class DiagnosticBag {
  readonly items: Diagnostic[] = [];

  warn(code: string, message: string, loc?: Span, hint?: string): void {
    const key = `${code}|${message}|${loc?.file}|${loc?.line}|${loc?.col}`;
    if (this.items.some(d => `${d.code}|${d.message}|${d.loc?.file}|${d.loc?.line}|${d.loc?.col}` === key)) return;
    this.items.push({ severity: "warning", code, message, loc, hint });
  }

  error(code: string, message: string, loc?: Span, hint?: string): never {
    throw new SinthError(code, message, loc, hint);
  }

  get warnings(): Diagnostic[] {
    return this.items.filter(d => d.severity === "warning");
  }
}

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
};

export function codeFrame(loc: Span, color = false, context = 2): string {
  const source = sourceCache.get(loc.file);
  if (source === undefined) return "";
  const lines = source.split(/\r?\n/);
  const start = Math.max(1, loc.line - context);
  const end = Math.min(lines.length, loc.line + context);
  const width = String(end).length;
  const paint = (code: string, s: string): string => (color ? code + s + ANSI.reset : s);
  const out: string[] = [];
  for (let n = start; n <= end; n++) {
    const marker = n === loc.line ? ">" : " ";
    const gutter = `${marker} ${String(n).padStart(width)} | `;
    const text = (lines[n - 1] ?? "").replace(/\t/g, "  ");
    out.push(n === loc.line ? paint(ANSI.bold, gutter) + text : paint(ANSI.gray, gutter + text));
    if (n === loc.line) {
      const raw = lines[n - 1] ?? "";
      const prefix = raw.slice(0, Math.max(0, loc.col - 1)).replace(/\t/g, "  ");
      const caret = "^".repeat(Math.max(1, loc.length ?? 1));
      out.push(" ".repeat(width + 2) + paint(ANSI.gray, "| ") + " ".repeat(prefix.length) + paint(ANSI.red, caret));
    }
  }
  return out.join("\n");
}

let displayRoot: string | undefined;

export function setDisplayRoot(root: string | undefined): void {
  displayRoot = root;
}

function displayPath(file: string): string {
  if (!displayRoot) return file;
  const norm = (p: string): string => p.replace(/\\/g, "/");
  const f = norm(file);
  const r = norm(displayRoot).replace(/\/$/, "") + "/";
  return f.startsWith(r) ? f.slice(r.length) : file;
}

export function formatDiagnostic(d: Diagnostic, color = false): string {
  const paint = (code: string, s: string): string => (color ? code + s + ANSI.reset : s);
  const head = d.severity === "error" ? paint(ANSI.red + ANSI.bold, `error[${d.code}]`) : paint(ANSI.yellow + ANSI.bold, `warning[${d.code}]`);
  const parts = [`${head}: ${d.message}`];
  if (d.loc) {
    parts.push(paint(ANSI.cyan, `  --> ${displayPath(d.loc.file)}:${d.loc.line}:${d.loc.col}`));
    const frame = codeFrame(d.loc, color);
    if (frame) parts.push(frame);
  }
  if (d.hint) parts.push(paint(ANSI.dim, `  hint: ${d.hint}`));
  return parts.join("\n");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

export function suggest(name: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  const limit = Math.max(2, Math.floor(name.length / 3));
  for (const c of candidates) {
    const score = levenshtein(name.toLowerCase(), c.toLowerCase());
    if (score < bestScore && score <= limit) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
