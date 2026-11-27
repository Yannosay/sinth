import * as crypto from "crypto";
import * as esbuild from "esbuild";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { SinthError } from "../compiler/diagnostics";
import { log } from "../cli/ui";

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
const EXTENSIONS = /\.(ts|js|mjs|tsx|jsx)$/;
const METHOD_EXPORTS: Record<string, string> = {
  GET: "onRequestGet", POST: "onRequestPost", PUT: "onRequestPut", PATCH: "onRequestPatch",
  DELETE: "onRequestDelete", HEAD: "onRequestHead", OPTIONS: "onRequestOptions",
};

type Segment = { kind: "static"; value: string } | { kind: "param"; name: string } | { kind: "catchall"; name: string };
type Handler = (context: FunctionContext) => Response | Promise<Response>;
type FunctionModule = Record<string, Handler | Handler[] | undefined>;

interface Route {
  file: string;
  segments: Segment[];
  middleware: boolean;
}

export interface FunctionContext {
  request: Request;
  params: Record<string, string | string[]>;
  env: Record<string, unknown>;
  data: Record<string, unknown>;
  functionPath: string;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** Serves a static file or page for `next()` and `env.ASSETS`. */
export type AssetHandler = (request: Request) => Promise<Response>;

function parseSegments(rel: string): Segment[] {
  const parts = rel.replace(EXTENSIONS, "").split("/").filter(Boolean);
  if (parts[parts.length - 1] === "index" || parts[parts.length - 1] === "_middleware") parts.pop();
  return parts.map(p => {
    const catchall = p.match(/^\[\[([A-Za-z_]\w*)\]\]$/);
    if (catchall) return { kind: "catchall", name: catchall[1] };
    const param = p.match(/^\[([A-Za-z_]\w*)\]$/);
    if (param) return { kind: "param", name: param[1] };
    return { kind: "static", value: p };
  });
}

function rank(route: Route): number[] {
  return route.segments.map(s => (s.kind === "static" ? 0 : s.kind === "param" ? 1 : 2));
}

function compareRoutes(a: Route, b: Route): number {
  if (a.segments.length !== b.segments.length) return b.segments.length - a.segments.length;
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return 0;
}

function matchRoute(route: Route, parts: string[], prefixOnly: boolean): Record<string, string | string[]> | null {
  const params: Record<string, string | string[]> = {};
  for (let i = 0; i < route.segments.length; i++) {
    const seg = route.segments[i];
    if (seg.kind === "catchall") {
      if (i >= parts.length) return null;
      params[seg.name] = parts.slice(i);
      return params;
    }
    if (i >= parts.length) return null;
    if (seg.kind === "static" && seg.value !== parts[i]) return null;
    if (seg.kind === "param") params[seg.name] = parts[i];
  }
  return prefixOnly || route.segments.length === parts.length ? params : null;
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
  private routes: Route[] | null = null;
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

  private scan(): Route[] {
    if (this.routes) return this.routes;
    const routes: Route[] = [];
    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (EXTENSIONS.test(e.name) && !e.name.endsWith(".d.ts") && !/\.(test|spec)\./.test(e.name)) {
          const rel = path.relative(this.dir, full).replace(/\\/g, "/");
          routes.push({ file: full, segments: parseSegments(rel), middleware: /(^|\/)_middleware\.\w+$/.test(rel) });
        }
      }
    };
    walk(this.dir);
    this.routes = routes.sort(compareRoutes);
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
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const routes = this.scan();
    if (!routes.length) return null;
    await this.load();
    const chain: { handler: Handler; params: Record<string, string | string[]>; file: string }[] = [];
    for (const r of [...routes].filter(x => x.middleware).sort((a, b) => a.segments.length - b.segments.length)) {
      const params = matchRoute(r, parts, true);
      const handler = params && this.handlerFor(r.file, request.method);
      if (params && handler) for (const h of Array.isArray(handler) ? handler : [handler]) chain.push({ handler: h, params, file: r.file });
    }
    for (const r of routes) {
      if (r.middleware) continue;
      const params = matchRoute(r, parts, false);
      if (!params) continue;
      const handler = this.handlerFor(r.file, request.method);
      if (!handler) continue;
      for (const h of Array.isArray(handler) ? handler : [handler]) chain.push({ handler: h, params, file: r.file });
      break;
    }
    if (!chain.length) return null;

    const env: Record<string, unknown> = { ...readDevVars(this.root), ASSETS: { fetch: (input: Request | string, init?: RequestInit) => assets(new Request(input, init)) } };
    const data: Record<string, unknown> = {};
    const run = async (index: number, req: Request): Promise<Response> => {
      const step = chain[index];
      if (!step) return assets(req);
      const result = await step.handler({
        request: req, params: step.params, env, data,
        functionPath: url.pathname,
        next: (input, init) => run(index + 1, input === undefined ? req : new Request(input, init)),
        waitUntil: p => { p.catch(err => log.error(String(err))); },
        passThroughOnException: () => undefined,
      });
      if (!(result instanceof Response)) {
        throw new Error(`${path.relative(this.root, step.file)} must return a Response (got ${result === undefined ? "undefined" : typeof result})`);
      }
      return result;
    };
    return run(0, request);
  }

  private handlerFor(file: string, method: string): Handler | Handler[] | undefined {
    const mod = this.modules.get(file);
    if (!mod) return undefined;
    return mod[METHOD_EXPORTS[method] ?? ""] ?? mod.onRequest;
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
