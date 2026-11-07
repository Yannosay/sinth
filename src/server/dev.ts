import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { formatDiagnostic, SinthError } from "../compiler/diagnostics";
import { escapeHtml } from "../compiler/html";
import { buildProject, BuildOutput } from "../project/build";
import { Project } from "../project/project";
import { c, formatMs, log, printDiagnostic } from "../cli/ui";
import { DEV_CLIENT } from "./client";
import { decodePath, displayHost, fileIfExists, listen, mimeType, routeCandidates, safeJoin, send } from "./static";

interface PageHash {
  route: string;
  js?: string;
  css?: string;
  jsHash: string;
  cssHash: string;
  head: string;
  body: string;
}

const CLIENT_URL = "/__sinth/client.js";
const IGNORED = /(^|[\\/])(node_modules|\.git|\.sinth|\.wrangler|dist)([\\/]|$)/;
const WATCHED_EXT = /\.(sinth|css|scss|sass|js|mjs|ts|tsx|jsx|json|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|txt|xml|webmanifest|html)$/i;

function hash(data: Uint8Array | string | undefined): string {
  if (!data) return "";
  return crypto.createHash("sha1").update(data).digest("base64").slice(0, 12);
}

function errorPage(title: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sinth error</title>
<style>body{margin:0;background:#0A0A0B;color:#F5F5F6;font-family:ui-sans-serif,system-ui,sans-serif}main{max-width:920px;margin:8vh auto;padding:0 16px}h1{font-size:18px;color:#f87171}pre{background:#141416;border:1px solid #2a2a2e;border-radius:12px;padding:20px;white-space:pre-wrap;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace}</style>
<script type="module" src="${CLIENT_URL}"></script></head><body><main><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(message)}</pre><p>Fix the problem and save. This page reloads automatically.</p></main></body></html>`;
}

export interface DevServerOptions {
  port: number;
  host: string;
  open: boolean;
}

export async function startDevServer(project: Project, opts: DevServerOptions): Promise<void> {
  const cfg = project.config;
  const clients = new Set<http.ServerResponse>();
  let output: BuildOutput | null = null;
  let lastError: { title: string; message: string } | null = null;
  let hashes: PageHash[] = [];
  let building: Promise<void> | null = null;
  let pending = false;

  const broadcast = (msg: unknown): void => {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const res of clients) res.write(data);
  };

  const computeHashes = (out: BuildOutput): PageHash[] => out.pages.map(p => {
    const headEnd = p.html.indexOf("</head>");
    const fileFor = (url?: string): Uint8Array | undefined => (url ? out.files.get(url.slice(cfg.base.length))?.contents : undefined);
    return {
      route: p.page.route, js: p.js, css: p.css, jsHash: hash(fileFor(p.js)), cssHash: hash(fileFor(p.css)),
      head: hash(p.html.slice(0, headEnd).replace(/\?t=\d+/g, "")), body: hash(p.html.slice(headEnd)),
    };
  });

  const rebuild = async (changed?: string): Promise<void> => {
    const started = Date.now();
    try {
      const out = await buildProject(project, { write: false, devClient: CLIENT_URL });
      output = out;
      lastError = null;
      const next = computeHashes(out);
      const routesChanged = next.map(p => p.route).join() !== hashes.map(p => p.route).join();
      hashes = next;
      for (const w of out.warnings) printDiagnostic(w);
      broadcast({ type: "update", pages: next, full: routesChanged });
      if (changed) log.success(`${c.gray(path.relative(project.root, changed))} ${c.dim("updated in " + formatMs(Date.now() - started))}`);
    } catch (err) {
      if (!(err instanceof SinthError)) {
        log.error((err as Error).stack ?? String(err));
        lastError = { title: "Internal error", message: String((err as Error).stack ?? err) };
      } else {
        printDiagnostic(err.diagnostic);
        lastError = { title: err.diagnostic.message, message: formatDiagnostic(err.diagnostic, false) };
      }
      broadcast({ type: "error", ...lastError });
    }
  };

  const queueRebuild = (file?: string): void => {
    if (building) {
      pending = true;
      return;
    }
    building = rebuild(file).finally(() => {
      building = null;
      if (pending) {
        pending = false;
        queueRebuild(file);
      }
    });
  };

  const started = Date.now();
  await rebuild();

  const findPage = (urlPath: string): string | undefined => {
    if (!output) return undefined;
    for (const cand of routeCandidates(urlPath)) {
      const f = output.files.get(cand.slice(1));
      if (f && cand.endsWith(".html")) return Buffer.from(f.contents).toString("utf-8");
    }
    return undefined;
  };

  const server = http.createServer((req, res) => {
    const urlPath = decodePath(req.url);
    if (!urlPath) return send(res, 400, "Bad request", "text/plain");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain");
    if (urlPath === "/__sinth/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(`data: ${JSON.stringify({ type: "init", pages: hashes, error: lastError })}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (urlPath === CLIENT_URL) return send(res, 200, DEV_CLIENT, "text/javascript; charset=utf-8", { "Cache-Control": "no-store" });

    const isPageRequest = !/\.[a-z0-9]+$/i.test(urlPath) || urlPath.endsWith(".html");
    if (isPageRequest && lastError && !output) return send(res, 500, errorPage(lastError.title, lastError.message), "text/html; charset=utf-8");

    const html = isPageRequest ? findPage(urlPath) : undefined;
    if (html) return send(res, 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-store" });

    const rel = urlPath.slice(1);
    const mem = output?.files.get(rel);
    if (mem) return send(res, 200, mem.contents, mimeType(rel), { "Cache-Control": "no-store" });

    const fromPublic = fileIfExists(safeJoin(cfg.publicDir, urlPath));
    const fromRoot = cfg.staticDirs.some(d => urlPath.startsWith("/" + d + "/")) ? fileIfExists(safeJoin(project.root, urlPath)) : null;
    const file = fromPublic ?? fromRoot;
    if (file) return send(res, 200, fs.readFileSync(file), mimeType(file), { "Cache-Control": "no-store" });

    const notFound = findPage("/404");
    return send(res, 404, notFound ?? errorPage("404 Not Found", `No page or file matches ${urlPath}`), "text/html; charset=utf-8");
  });

  const port = await listen(server, opts.port, opts.host);
  const url = `http://${displayHost(opts.host)}:${port}`;
  log.blank();
  console.log(`  ${c.green("➜")}  ${c.bold("Local:")}   ${c.cyan(url)}`);
  if (opts.host === "0.0.0.0" || opts.host === "::") console.log(`  ${c.green("➜")}  ${c.bold("Network:")} exposed on all interfaces`);
  else console.log(`  ${c.gray("➜")}  ${c.gray("Network: use --host to expose")}`);
  const initial = output as BuildOutput | null;
  console.log(`  ${c.gray("ready in " + formatMs(Date.now() - started))}${initial ? c.gray(`, ${initial.pages.length} page(s)`) : ""}`);
  log.blank();
  if (port !== opts.port) log.warn(`Port ${opts.port} is in use, using ${port} instead`);

  const timers = new Map<string, NodeJS.Timeout>();
  const onChange = (file: string): void => {
    if (IGNORED.test(path.relative(project.root, file)) || file.startsWith(cfg.outDir) || !WATCHED_EXT.test(file)) return;
    clearTimeout(timers.get(file));
    timers.set(file, setTimeout(() => {
      timers.delete(file);
      const inStatic = file.startsWith(cfg.publicDir + path.sep) || cfg.staticDirs.some(d => file.startsWith(path.resolve(project.root, d) + path.sep));
      if (inStatic && !file.endsWith(".css") && !file.endsWith(".sinth")) {
        broadcast({ type: "reload" });
        return;
      }
      if (path.basename(file) === "sinth.config.json") {
        log.warn("sinth.config.json changed. Restart the dev server to apply it.");
        return;
      }
      queueRebuild(file);
    }, 40));
  };

  try {
    const watcher = fs.watch(project.root, { recursive: true }, (_event, name) => {
      if (name) onChange(path.join(project.root, name.toString()));
    });
    watcher.on("error", () => undefined);
  } catch {
    log.warn("Recursive file watching is not supported here; falling back to polling");
    const mtimes = new Map<string, number>();
    const scan = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (IGNORED.test(full)) continue;
        if (e.isDirectory()) scan(full);
        else {
          const m = fs.statSync(full).mtimeMs;
          const prev = mtimes.get(full);
          mtimes.set(full, m);
          if (prev !== undefined && prev !== m) onChange(full);
        }
      }
    };
    setInterval(() => scan(project.root), 400).unref();
  }

  if (opts.open) openBrowser(url);

  const shutdown = (): void => {
    for (const res of clients) res.end();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export function openBrowser(url: string): void {
  import("child_process").then(cp => {
    const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    cp.spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  }).catch(() => undefined);
}
