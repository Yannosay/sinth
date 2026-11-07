import * as fs from "fs";
import * as path from "path";
import { SinthError } from "../compiler/diagnostics";

export interface CloudflareConfig {
  projectName?: string;
  accountId?: string;
  productionBranch?: string;
}

export interface SecurityConfig {
  headers: boolean;
  csp: boolean | string;
}

export interface SinthConfig {
  outDir: string;
  pagesDir: string;
  publicDir: string;
  staticDirs: string[];
  libraryPaths: string[];
  site?: string;
  base: string;
  minify: boolean;
  sourcemap: boolean;
  port: number;
  host: string;
  previewPort: number;
  target: string[];
  security: SecurityConfig;
  cloudflare: CloudflareConfig;
}

type Partialish = Partial<Omit<SinthConfig, "security" | "cloudflare">> & {
  security?: Partial<SecurityConfig>;
  cloudflare?: CloudflareConfig;
  development?: Partialish;
  production?: Partialish;
  sharedRuntime?: unknown;
  inlineJS?: unknown;
  inlineCSS?: unknown;
};

export const DEFAULT_CONFIG: SinthConfig = {
  outDir: "dist",
  pagesDir: "pages",
  publicDir: "public",
  staticDirs: ["assets"],
  libraryPaths: ["libraries"],
  base: "/",
  minify: false,
  sourcemap: false,
  port: 3000,
  host: "127.0.0.1",
  previewPort: 4000,
  target: ["es2020", "chrome90", "firefox90", "safari15", "edge90"],
  security: { headers: true, csp: true },
  cloudflare: {},
};

const KNOWN_KEYS = new Set([
  "outDir", "pagesDir", "publicDir", "staticDirs", "libraryPaths", "site", "base", "minify", "sourcemap", "port", "host",
  "previewPort", "target", "security", "cloudflare", "development", "production", "$schema",
  "sharedRuntime", "inlineJS", "inlineCSS",
]);

const LEGACY_KEYS = new Set(["sharedRuntime", "inlineJS", "inlineCSS"]);

export interface LoadedConfig {
  config: SinthConfig;
  file?: string;
  warnings: string[];
}

function validate(raw: Record<string, unknown>, file: string, warnings: string[]): void {
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) warnings.push(`Unknown option '${key}' in ${path.basename(file)} (ignored)`);
    else if (LEGACY_KEYS.has(key)) warnings.push(`Option '${key}' is no longer needed in Sinth 5: code splitting and asset bundling are automatic`);
  }
  const check = (key: string, type: string, ok: (v: unknown) => boolean): void => {
    if (key in raw && !ok(raw[key])) throw new SinthError("E0900", `Option '${key}' in ${path.basename(file)} must be ${type}`, { file, line: 1, col: 1 });
  };
  const str = (v: unknown): boolean => typeof v === "string";
  const strArr = (v: unknown): boolean => Array.isArray(v) && v.every(x => typeof x === "string");
  for (const k of ["outDir", "pagesDir", "publicDir", "site", "base", "host"]) check(k, "a string", str);
  for (const k of ["staticDirs", "libraryPaths", "target"]) check(k, "an array of strings", strArr);
  for (const k of ["minify", "sourcemap"]) check(k, "true or false", v => typeof v === "boolean");
  for (const k of ["port", "previewPort"]) check(k, "a port number (1-65535)", v => Number.isInteger(v) && (v as number) > 0 && (v as number) < 65536);
  check("site", "an absolute URL like https://example.com", v => typeof v === "string" && /^https?:\/\/[^\s]+$/.test(v));
}

export function loadConfig(root: string, mode: "development" | "production"): LoadedConfig {
  const warnings: string[] = [];
  const file = path.join(root, "sinth.config.json");
  let raw: Partialish = {};
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf-8");
    try {
      raw = JSON.parse(text) as Partialish;
    } catch (err) {
      const m = (err as Error).message.match(/position (\d+)/);
      const pos = m ? Number(m[1]) : 0;
      const line = text.slice(0, pos).split("\n").length;
      throw new SinthError("E0901", `Invalid JSON in sinth.config.json: ${(err as Error).message}`, { file, line, col: 1 });
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SinthError("E0901", "sinth.config.json must contain a JSON object", { file, line: 1, col: 1 });
    validate(raw as Record<string, unknown>, file, warnings);
    const env = raw[mode];
    if (env) validate(env as Record<string, unknown>, file, warnings);
  }
  const envOverrides = raw[mode] ?? {};
  const merged: SinthConfig = {
    ...DEFAULT_CONFIG,
    ...stripNested(raw),
    ...stripNested(envOverrides),
    security: { ...DEFAULT_CONFIG.security, ...(raw.security ?? {}), ...(envOverrides.security ?? {}) },
    cloudflare: { ...(raw.cloudflare ?? {}) },
  };
  if (mode === "production" && raw.minify === undefined && envOverrides.minify === undefined) merged.minify = true;
  if (mode === "development" && raw.sourcemap === undefined && envOverrides.sourcemap === undefined) merged.sourcemap = true;
  merged.staticDirs = merged.staticDirs.map(d => d.replace(/^\.\//, ""));
  merged.libraryPaths = merged.libraryPaths.map(d => path.resolve(root, d));
  merged.outDir = path.resolve(root, merged.outDir);
  merged.pagesDir = path.resolve(root, merged.pagesDir);
  merged.publicDir = path.resolve(root, merged.publicDir);
  if (!merged.base.startsWith("/")) merged.base = "/" + merged.base;
  if (!merged.base.endsWith("/")) merged.base += "/";
  if (merged.outDir === path.resolve(root)) throw new SinthError("E0902", "outDir cannot be the project root", { file, line: 1, col: 1 });
  return { config: merged, file: fs.existsSync(file) ? file : undefined, warnings };
}

function stripNested(raw: Partialish): Partial<SinthConfig> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "development" || k === "production" || k === "security" || k === "cloudflare" || k === "$schema" || LEGACY_KEYS.has(k)) continue;
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<SinthConfig>;
}
