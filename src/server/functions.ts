import * as crypto from "crypto";
import * as esbuild from "esbuild";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { SinthError } from "../compiler/diagnostics";
import { log } from "../cli/ui";
import { compareRoutes, dispatch, FunctionModule, isFunctionFile, LoadedRoute, routeDef, RouteDef } from "./functions-router";

/**
 * Server routes in `functions/`, following the Cloudflare Pages Functions conventions so the same
 * files run in `sinth dev`, `sinth preview` and on Cloudflare Pages after `sinth deploy`:
 *
 *   functions/api/hello.ts        -> /api/hello
 *   functions/api/users/[id].ts   -> /api/users/:id        (context.params.id)
 *   functions/files/[[path]].ts   -> /files/a/b/c          (context.params.path = ["a", "b", "c"])
 *   functions/_middleware.ts      -> runs before every route below its folder
 *
 * A module exports `onRequest` or method handlers such as `onRequestGet` / `onRequestPost`.
 */

export const FUNCTIONS_DIR = "functions";
export type { FunctionContext } from "./functions-router";

/** Serves a static file or page for `next()` and `env.ASSETS`. */
export type AssetHandler = (request: Request) => Promise<Response>;

/** Every route file in a functions/ folder, most specific first. */
export function scanFunctions(dir: string): (RouteDef & { file: string })[] {
  const routes: (RouteDef & { file: string })[] = [];
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (isFunctionFile(e.name)) routes.push({ ...routeDef(path.relative(dir, full).split(path.sep).join("/")), file: full });
    }
  };
  walk(dir);
  return routes.sort(compareRoutes);
}

function readDevVars(root: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const name of [".dev.vars", ".env"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || m[1] in vars) continue;
      vars[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return vars;
}

export class FunctionsHost {
  private routes: (RouteDef & { file: string })[] | null = null;
  private modules = new Map<string, FunctionModule>();
  private building: Promise<void> | null = null;
  readonly dir: string;
  private readonly cacheDir: string;

  constructor(private readonly root: string) {
    this.dir = path.join(root, FUNCTIONS_DIR);
    this.cacheDir = path.join(root, ".sinth", "functions");
    if (!globalThis.crypto) (globalThis as { crypto?: unknown }).crypto = crypto.webcrypto;
  }

  get enabled(): boolean {
    return fs.existsSync(this.dir);
  }

  invalidate(): void {
    this.routes = null;
    this.building = null;
  }

  private scan(): (RouteDef & { file: string })[] {
    if (!this.routes) this.routes = scanFunctions(this.dir);
    return this.routes;
  }

  private async load(): Promise<void> {
    if (!this.building) this.building = this.compile();
    return this.building;
  }

  private async compile(): Promise<void> {
    const routes = this.scan();
    this.modules.clear();
    if (!routes.length) return;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const entryPoints: Record<string, string> = {};
    for (const r of routes) entryPoints[crypto.createHash("sha1").update(r.file).digest("hex").slice(0, 16)] = r.file;
    let result: esbuild.BuildResult;
    try {
      result = await esbuild.build({
        entryPoints, bundle: true, platform: "node", format: "cjs", target: "node18", outdir: this.cacheDir,
        write: true, logLevel: "silent", sourcemap: "inline", absWorkingDir: this.root, outExtension: { ".js": ".cjs" },
        entryNames: "[name]-" + Date.now().toString(36),
      });
    } catch (err) {
      const first = (err as { errors?: esbuild.Message[] }).errors?.[0];
      this.building = null;
      throw new SinthError("E0803", `Function build failed: ${first?.text ?? (err as Error).message}`,
        first?.location ? { file: path.resolve(this.root, first.location.file), line: first.location.line, col: first.location.column + 1 } : undefined);
    }
    for (const w of result.warnings) log.warn(w.text);
    for (const [name, file] of Object.entries(entryPoints)) {
      const out = fs.readdirSync(this.cacheDir).filter(f => f.startsWith(name + "-")).sort().pop();
      if (!out) continue;
      const full = path.join(this.cacheDir, out);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.modules.set(file, require(full) as FunctionModule);
      for (const old of fs.readdirSync(this.cacheDir)) if (old.startsWith(name + "-") && old !== out) fs.rmSync(path.join(this.cacheDir, old), { force: true });
    }
  }

  /**
   * Runs the middleware chain and the matching route for a request. Returns null when no
   * function applies, so the caller serves the request as a static file.
   */
  async handle(request: Request, assets: AssetHandler): Promise<Response | null> {
    if (!this.enabled) return null;
    const routes = this.scan();
    if (!routes.length) return null;
    await this.load();
    const loaded: LoadedRoute[] = routes.flatMap(r => {
      const mod = this.modules.get(r.file);
      return mod ? [{ ...r, module: mod }] : [];
    });
    const env: Record<string, unknown> = { ...readDevVars(this.root), ASSETS: { fetch: (input: Request | string, init?: RequestInit) => assets(new Request(input, init)) } };
    return dispatch(loaded, request, {
      env,
      assets,
      waitUntil: p => { p.catch(err => log.error(String(err))); },
    });
  }
}

/** Converts a Node request into a Fetch API Request. */
export async function toRequest(req: http.IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    for (const value of Array.isArray(v) ? v : [v]) headers.append(k, value);
  }
  let body: Buffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = Buffer.concat(chunks);
  }
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, { method: req.method, headers, body });
}

/** Streams a Fetch API Response to a Node response. */
export async function sendResponse(res: http.ServerResponse, response: Response, head = false): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => { if (key !== "set-cookie") headers[key] = value; });
  const cookies = (response.headers as Headers & { getSetCookie?(): string[] }).getSetCookie?.() ?? [];
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, response.statusText, headers);
  if (!response.body || head) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}
