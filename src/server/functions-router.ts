/**
 * Routing for `functions/`, following the Cloudflare Pages Functions conventions. This file has no
 * Node.js imports: the dev and preview servers use it, and `platform: "cloudflare-workers"` bundles
 * it into the deployed Worker, so routes behave the same everywhere.
 */

export type Segment = { kind: "static"; value: string } | { kind: "param"; name: string } | { kind: "catchall"; name: string };
export type Params = Record<string, string | string[]>;

export interface FunctionContext {
  request: Request;
  params: Params;
  env: Record<string, unknown>;
  data: Record<string, unknown>;
  functionPath: string;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export type Handler = (context: FunctionContext) => Response | Promise<Response>;
export type FunctionModule = Record<string, unknown>;

export interface RouteDef {
  /** Path inside functions/, e.g. "api/users/[id].ts". */
  rel: string;
  segments: Segment[];
  middleware: boolean;
}

export interface LoadedRoute extends RouteDef {
  module: FunctionModule;
}

export interface DispatchOptions {
  env: Record<string, unknown>;
  /** Serves a static file or page; used by `next()` when no further handler applies. */
  assets(request: Request): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export const FUNCTION_FILE = /\.(ts|js|mjs|tsx|jsx)$/;

const METHOD_EXPORTS: Record<string, string> = {
  GET: "onRequestGet", POST: "onRequestPost", PUT: "onRequestPut", PATCH: "onRequestPatch",
  DELETE: "onRequestDelete", HEAD: "onRequestHead", OPTIONS: "onRequestOptions",
};

export function isFunctionFile(name: string): boolean {
  return FUNCTION_FILE.test(name) && !name.endsWith(".d.ts") && !/\.(test|spec)\./.test(name);
}

export function routeDef(rel: string): RouteDef {
  const parts = rel.replace(FUNCTION_FILE, "").split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (last === "index" || last === "_middleware") parts.pop();
  const segments: Segment[] = parts.map(p => {
    const catchall = p.match(/^\[\[([A-Za-z_]\w*)\]\]$/);
    if (catchall) return { kind: "catchall", name: catchall[1] };
    const param = p.match(/^\[([A-Za-z_]\w*)\]$/);
    if (param) return { kind: "param", name: param[1] };
    return { kind: "static", value: p };
  });
  return { rel, segments, middleware: /(^|\/)_middleware\.\w+$/.test(rel) };
}

function rank(route: RouteDef): number[] {
  return route.segments.map(s => (s.kind === "static" ? 0 : s.kind === "param" ? 1 : 2));
}

/** More specific routes first: longer paths, then static before [param] before [[catchall]]. */
export function compareRoutes(a: RouteDef, b: RouteDef): number {
  if (a.segments.length !== b.segments.length) return b.segments.length - a.segments.length;
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return a.rel.localeCompare(b.rel);
}

export function matchRoute(route: RouteDef, parts: string[], prefixOnly: boolean): Params | null {
  const params: Params = {};
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

/**
 * URL patterns that can reach a function, for hosts that only invoke code for some paths
 * (Cloudflare Workers `run_worker_first`). Returns ["/*"] when a route can match anything.
 */
export function routePatterns(routes: RouteDef[]): string[] {
  const out = new Set<string>();
  for (const r of routes) {
    const fixed: string[] = [];
    for (const s of r.segments) {
      if (s.kind !== "static") break;
      fixed.push(s.value);
    }
    if (!fixed.length) return ["/*"];
    const prefix = "/" + fixed.join("/");
    if (fixed.length === r.segments.length && !r.middleware) out.add(prefix);
    else {
      out.add(prefix);
      out.add(prefix + "/*");
    }
  }
  return [...out].sort();
}

function decodeParts(pathname: string): string[] | null {
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
}

function handlerFor(mod: FunctionModule, method: string): Handler[] {
  const h = mod[METHOD_EXPORTS[method] ?? ""] ?? mod.onRequest;
  const list = Array.isArray(h) ? h : h ? [h] : [];
  return list.filter((x): x is Handler => typeof x === "function");
}

/**
 * Runs the middleware chain and the matching route. Returns null when no function applies, so the
 * caller serves the request as a static file.
 */
export async function dispatch(routes: LoadedRoute[], request: Request, opts: DispatchOptions): Promise<Response | null> {
  const url = new URL(request.url);
  const parts = decodeParts(url.pathname);
  if (!parts) return null;
  const chain: { handler: Handler; params: Params; rel: string }[] = [];
  const middleware = routes.filter(r => r.middleware).sort((a, b) => a.segments.length - b.segments.length);
  for (const r of middleware) {
    const params = matchRoute(r, parts, true);
    if (params) for (const handler of handlerFor(r.module, request.method)) chain.push({ handler, params, rel: r.rel });
  }
  for (const r of routes) {
    if (r.middleware) continue;
    const params = matchRoute(r, parts, false);
    if (!params) continue;
    const handlers = handlerFor(r.module, request.method);
    if (!handlers.length) continue;
    for (const handler of handlers) chain.push({ handler, params, rel: r.rel });
    break;
  }
  // Matching middleware runs even when no route does: its next() then serves the static file.
  if (!chain.length) return null;

  const data: Record<string, unknown> = {};
  const run = async (index: number, req: Request): Promise<Response> => {
    const step = chain[index];
    if (!step) return opts.assets(req);
    const result = await step.handler({
      request: req, params: step.params, env: opts.env, data,
      functionPath: url.pathname,
      next: (input, init) => run(index + 1, input === undefined ? req : new Request(input, init)),
      waitUntil: p => opts.waitUntil(p),
      passThroughOnException: () => opts.passThroughOnException?.(),
    });
    if (!(result instanceof Response)) {
      throw new Error(`functions/${step.rel} must return a Response (got ${result === undefined ? "undefined" : typeof result})`);
    }
    return result;
  };
  return run(0, request);
}
