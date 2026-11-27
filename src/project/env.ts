import * as fs from "fs";
import * as path from "path";

/** Only variables with this prefix reach the browser through `import { ... } from "sinth:env"`. */
export const PUBLIC_PREFIX = "PUBLIC_";

/** Parses a dotenv file: `KEY=value`, `export KEY=value`, quoted values and `#` comments. */
export function parseEnvFile(file: string): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    const quote = value[0];
    const close = quote === '"' || quote === "'" || quote === "`" ? value.indexOf(quote, 1) : -1;
    if (close > 0) value = quote === '"' ? value.slice(1, close).replace(/\\n/g, "\n") : value.slice(1, close);
    else value = value.replace(/(^|\s+)#.*$/, "");
    vars[m[1]] = value;
  }
  return vars;
}

/**
 * Variables from `.env`, `.env.local`, `.env.<mode>` and `.env.<mode>.local` (later files win), with
 * the process environment taking precedence over all files, like Vite and Next.js.
 */
export function loadEnv(root: string, mode: "development" | "production"): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const name of [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`]) Object.assign(merged, parseEnvFile(path.join(root, name)));
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && (k in merged || k.startsWith(PUBLIC_PREFIX))) merged[k] = v;
  return merged;
}

/** The variables that are safe to inline into pages: those starting with PUBLIC_. */
export function publicEnv(root: string, mode: "development" | "production"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(loadEnv(root, mode))) if (k.startsWith(PUBLIC_PREFIX)) out[k] = v;
  return out;
}
