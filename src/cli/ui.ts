import { Diagnostic, formatDiagnostic } from "../compiler/diagnostics";

const enabled = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb";

const wrap = (open: string, close: string) => (s: string): string => (enabled ? `\u001b[${open}m${s}\u001b[${close}m` : s);

export const c = {
  bold: wrap("1", "22"),
  dim: wrap("2", "22"),
  red: wrap("31", "39"),
  green: wrap("32", "39"),
  yellow: wrap("33", "39"),
  blue: wrap("34", "39"),
  magenta: wrap("35", "39"),
  cyan: wrap("36", "39"),
  gray: wrap("90", "39"),
  violet: (s: string): string => (enabled ? `\u001b[38;2;192;132;252m${s}\u001b[39m` : s),
  underline: wrap("4", "24"),
};

export const colorEnabled = enabled;

export function brand(label: string, version: string): string {
  return [c.violet(c.bold("Sinth")), label ? c.bold(label) : "", c.gray("v" + version)].filter(Boolean).join(" ");
}

export const log = {
  info: (msg: string): void => console.log(`${c.cyan("•")} ${msg}`),
  success: (msg: string): void => console.log(`${c.green("✓")} ${msg}`),
  warn: (msg: string): void => console.log(`${c.yellow("!")} ${msg}`),
  error: (msg: string): void => console.error(`${c.red("✗")} ${msg}`),
  step: (msg: string): void => console.log(`  ${c.gray("›")} ${msg}`),
  blank: (): void => console.log(),
};

export function printDiagnostic(d: Diagnostic): void {
  const text = formatDiagnostic(d, enabled);
  if (d.severity === "error") console.error("\n" + text + "\n");
  else console.log("\n" + text + "\n");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function table(rows: string[][], gap = 2): string {
  const ansi = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
  const strip = (s: string): string => s.replace(ansi, "");
  const widths: number[] = [];
  for (const r of rows) r.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, strip(cell).length)));
  return rows.map(r => r.map((cell, i) => (i === r.length - 1 ? cell : cell + " ".repeat(widths[i] - strip(cell).length + gap))).join("")).join("\n");
}
