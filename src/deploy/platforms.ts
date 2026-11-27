import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { Diagnostic, SinthError } from "../compiler/diagnostics";
import type { OutputFile } from "../project/build";
import { Platform } from "../project/config";
import type { Project } from "../project/project";
import { FUNCTIONS_DIR, scanFunctions } from "../server/functions";
import { routePatterns } from "../server/functions-router";
import { defaultProjectName } from "./cloudflare";
import { isPattern, vercelHeaderRoutes, vercelRedirectRoutes } from "./redirects";

/** Wrangler compatibility date for generated Worker configs. */
const COMPATIBILITY_DATE = "2025-09-01";
const IMMUTABLE = "public, max-age=31536000, immutable";

export const DEPLOY_DIR = path.join(".sinth", "deploy");

/** Hosts that read a `_headers` file from the output folder. */
export function readsHeadersFile(platform: Platform): boolean {
  return platform === "cloudflare" || platform === "cloudflare-workers" || platform === "netlify" || platform === "static";
}

/** Hosts that can run the server routes in functions/. */
export function runsFunctions(platform: Platform): boolean {
  return platform === "cloudflare" || platform === "cloudflare-workers";
}

export function securityHeaders(csp: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (csp) headers["Content-Security-Policy"] = csp;
  return headers;
}

/** A `_headers` file (Cloudflare Pages and Workers, Netlify). */
export function headersFile(headers: Record<string, string>, base: string): string {
  const lines = ["/*", ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)];
  lines.push("", `${base}_sinth/*`, `  Cache-Control: ${IMMUTABLE}`, "");
  return lines.join("\n");
}

export function functionRoutes(project: Project): ReturnType<typeof scanFunctions> {
  return scanFunctions(path.join(project.root, FUNCTIONS_DIR));
}

/**
 * Writes host-specific output next to the regular build: `.vercel/output` for Vercel and the
 * Worker plus its wrangler config for Cloudflare Workers. Returns warnings for the build summary.
 */
export async function writePlatformOutput(project: Project, files: Map<string, OutputFile>, headers: Record<string, string>, write: boolean): Promise<Diagnostic[]> {
  const cfg = project.config;
  const warnings: Diagnostic[] = [];
  const routes = functionRoutes(project);
  if (routes.length && !runsFunctions(cfg.platform)) {
    warnings.push({
      severity: "warning", code: "W0810",
      message: `The routes in ${FUNCTIONS_DIR}/ are not deployed on platform "${cfg.platform}"`,
      hint: "Server functions run on Cloudflare: set \"platform\" to \"cloudflare\" or \"cloudflare-workers\" in sinth.config.json",
    });
  }
  if (cfg.platform === "github-pages") {
    const patterns = cfg.redirects.filter(r => isPattern(r.from)).map(r => r.from);
    if (patterns.length) warnings.push({ severity: "warning", code: "W0811", message: `GitHub Pages cannot redirect patterns: ${patterns.join(", ")}`, hint: "Exact paths become redirect pages; patterns with :params or * need a host with server-side redirects" });
    if (Object.keys(cfg.headers).length) warnings.push({ severity: "warning", code: "W0811", message: "GitHub Pages ignores the \"headers\" option", hint: "Custom response headers need Cloudflare, Netlify or Vercel" });
  }
  if (!write) return warnings;
  if (cfg.platform === "vercel") writeVercelOutput(project, files, headers);
  if (cfg.platform === "cloudflare-workers") await writeWorker(project, routes);
  return warnings;
}

/** Vercel Build Output API v3: https://vercel.com/docs/build-output-api */
function writeVercelOutput(project: Project, files: Map<string, OutputFile>, headers: Record<string, string>): void {
  const cfg = project.config;
  const out = path.join(project.root, ".vercel", "output");
  fs.rmSync(out, { recursive: true, force: true });
  const prefix = cfg.base.replace(/^\/|\/$/g, "");
  const staticDir = path.join(out, "static", prefix);
  const overrides: Record<string, { path: string }> = {};
  for (const [rel, f] of files) {
    const target = path.join(staticDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.contents);
    // Clean URLs: /about serves about.html. index.html files are served for their folder already.
    if (rel.endsWith(".html") && !/(^|\/)(index|404)\.html$/.test(rel)) {
      const key = (prefix ? prefix + "/" : "") + rel;
      overrides[key] = { path: key.slice(0, -5) };
    }
  }
  const escapedBase = cfg.base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const routes: Record<string, unknown>[] = [
    { src: `^${escapedBase}_sinth/(.*)$`, headers: { "Cache-Control": IMMUTABLE }, continue: true },
  ];
  if (Object.keys(headers).length) routes.push({ src: "^/(.*)$", headers, continue: true });
  routes.push(...vercelHeaderRoutes(cfg.headers, cfg.base), ...vercelRedirectRoutes(cfg.redirects, cfg.base));
  routes.push({ handle: "filesystem" });
  if (files.has("404.html")) routes.push({ src: "^/(.*)$", status: 404, dest: `${cfg.base}404.html` });
  const config = { version: 3, routes, overrides };
  fs.writeFileSync(path.join(out, "config.json"), JSON.stringify(config, null, 2) + "\n");
}

export function userWranglerConfig(root: string): string | undefined {
  return ["wrangler.jsonc", "wrangler.json", "wrangler.toml"].map(f => path.join(root, f)).find(f => fs.existsSync(f));
}

/**
 * Cloudflare Workers with static assets. With functions/, the routes are bundled into a Worker that
 * runs only for their URLs; everything else is served straight from the assets.
 */
async function writeWorker(project: Project, routes: ReturnType<typeof scanFunctions>): Promise<void> {
  const cfg = project.config;
  const dir = path.join(project.root, DEPLOY_DIR);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const rel = (p: string): string => path.relative(dir, p).split(path.sep).join("/") || ".";
  const assets: Record<string, unknown> = {
    directory: rel(cfg.outDir),
    not_found_handling: "404-page",
    html_handling: "auto-trailing-slash",
  };
  const config: Record<string, unknown> = {
    $schema: rel(path.join(project.root, "node_modules", "wrangler", "config-schema.json")),
    name: workerName(project),
    compatibility_date: COMPATIBILITY_DATE,
    assets,
  };
  if (!fs.existsSync(path.join(project.root, "node_modules", "wrangler"))) delete config.$schema;
  if (routes.length) {
    await bundleWorker(project, routes, path.join(dir, "worker.js"));
    config.main = "worker.js";
    assets.binding = "ASSETS";
    assets.run_worker_first = routePatterns(routes).map(p => (cfg.base === "/" ? p : cfg.base.slice(0, -1) + p));
  }
  fs.writeFileSync(path.join(dir, "wrangler.json"), JSON.stringify(config, null, 2) + "\n");
}

function workerName(project: Project): string {
  return project.config.cloudflare.projectName ?? defaultProjectName(project.root);
}

async function bundleWorker(project: Project, routes: ReturnType<typeof scanFunctions>, outfile: string): Promise<void> {
  const router = path.join(__dirname, "..", "server", "functions-router.js");
  const imports = routes.map((r, i) => `import * as m${i} from ${JSON.stringify(r.file)};`);
  const table = routes.map((r, i) => `  { rel: ${JSON.stringify(r.rel)}, segments: ${JSON.stringify(r.segments)}, middleware: ${r.middleware}, module: m${i} },`);
  const contents = [
    `import { dispatch } from ${JSON.stringify(router)};`,
    ...imports,
    "const routes = [",
    ...table,
    "];",
    "export default {",
    "  async fetch(request, env, ctx) {",
    "    const assets = r => env.ASSETS.fetch(r);",
    "    const response = await dispatch(routes, request, { env, assets, waitUntil: p => ctx.waitUntil(p), passThroughOnException: () => ctx.passThroughOnException() });",
    "    return response ?? assets(request);",
    "  },",
    "};",
  ].join("\n");
  try {
    await esbuild.build({
      stdin: { contents, resolveDir: project.root, sourcefile: "sinth-worker.js", loader: "js" },
      bundle: true, format: "esm", platform: "neutral", target: "es2022", outfile,
      mainFields: ["module", "main"], conditions: ["workerd", "worker", "browser"],
      minify: project.config.minify, logLevel: "silent", absWorkingDir: project.root,
    });
  } catch (err) {
    const first = (err as { errors?: esbuild.Message[] }).errors?.[0];
    throw new SinthError("E0803", `Function build failed: ${first?.text ?? (err as Error).message}`,
      first?.location ? { file: path.resolve(project.root, first.location.file), line: first.location.line, col: first.location.column + 1 } : undefined);
  }
}
