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

/** Where the site is hosted. Decides which host-specific files the build writes and how `sinth deploy` uploads. */
export type Platform = "cloudflare" | "cloudflare-workers" | "vercel" | "netlify" | "github-pages" | "static";
export const PLATFORMS: Platform[] = ["cloudflare", "cloudflare-workers", "vercel", "netlify", "github-pages", "static"];

export interface SinthConfig {
  platform: Platform;
  /** Folder holding pages, components, libraries and assets: the project root, or app/ (absolute after loading). */
  srcDir: string;
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
  router: boolean;
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
  platform: "cloudflare",
  srcDir: ".",
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
  router: true,
  security: { headers: true, csp: true },
  cloudflare: {},
};

const KNOWN_KEYS = new Set([
  "platform", "srcDir", "outDir", "pagesDir", "publicDir", "staticDirs", "libraryPaths", "site", "base", "minify", "sourcemap", "port", "host",
  "previewPort", "target", "router", "security", "cloudflare", "development", "production", "$schema",
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
  for (const k of ["srcDir", "outDir", "pagesDir", "publicDir", "site", "base", "host"]) check(k, "a string", str);
  for (const k of ["staticDirs", "libraryPaths", "target"]) check(k, "an array of strings", strArr);
  for (const k of ["minify", "sourcemap", "router"]) check(k, "true or false", v => typeof v === "boolean");
  for (const k of ["port", "previewPort"]) check(k, "a port number (1-65535)", v => Number.isInteger(v) && (v as number) > 0 && (v as number) < 65536);
  check("platform", `one of ${PLATFORMS.map(p => `"${p}"`).join(", ")}`, v => PLATFORMS.includes(v as Platform));
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
  const srcSet = raw.srcDir !== undefined || envOverrides.srcDir !== undefined;
  merged.srcDir = path.resolve(root, srcSet ? merged.srcDir : detectSrcDir(root));
  const src = merged.srcDir;
  merged.staticDirs = merged.staticDirs.map(d => d.replace(/^\.\//, "").replace(/\/+$/, ""));
  merged.libraryPaths = merged.libraryPaths.map(d => path.resolve(src, d));
  merged.outDir = path.resolve(root, merged.outDir);
  merged.pagesDir = path.resolve(src, merged.pagesDir);
  const publicSet = raw.publicDir !== undefined || envOverrides.publicDir !== undefined;
  merged.publicDir = path.resolve(root, merged.publicDir);
  // Like Nuxt, public/ normally sits next to app/, but app/public works too.
  if (!publicSet && src !== path.resolve(root) && !isDir(merged.publicDir) && isDir(path.join(src, "public"))) merged.publicDir = path.join(src, "public");
  if (!merged.base.startsWith("/")) merged.base = "/" + merged.base;
  if (!merged.base.endsWith("/")) merged.base += "/";
  if (!isDir(src) && srcSet) throw new SinthError("E0903", `srcDir '${path.relative(root, src) || "."}' does not exist`, { file, line: 1, col: 1 });
  if (merged.outDir === path.resolve(root)) throw new SinthError("E0902", "outDir cannot be the project root", { file, line: 1, col: 1 });
  return { config: merged, file: fs.existsSync(file) ? file : undefined, warnings };
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Uses app/ as the source folder (like Nuxt) when it exists and the root has no pages/ folder and
 * no .sinth files of its own, so projects that keep everything in the root are unaffected.
 */
export function detectSrcDir(root: string): string {
  if (!isDir(path.join(root, "app"))) return ".";
  if (isDir(path.join(root, "pages"))) return ".";
  try {
    if (fs.readdirSync(root).some(f => f.endsWith(".sinth"))) return ".";
  } catch {
    return ".";
  }
  return "app";
}

/** Resolves a static asset folder (like "assets") inside the source folder. */
export function staticDirPath(config: SinthConfig, dir: string): string {
  return path.resolve(config.srcDir, dir);
}

function stripNested(raw: Partialish): Partial<SinthConfig> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "development" || k === "production" || k === "security" || k === "cloudflare" || k === "$schema" || LEGACY_KEYS.has(k)) continue;
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<SinthConfig>;
}
