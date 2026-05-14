import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { compileFile, CompileOptions, findSinthPages, minifyHTML } from "./core/compiler.ts";



export const LIVE_RELOAD_SCRIPT = `<script>
(function(){
  var es = new EventSource('/__sinth_sse__');
  es.onmessage = function() { location.reload(); };
  es.onerror   = function() { setTimeout(function() { location.reload(); }, 1000); };
})();
</script>`;

export async function startDevServer(opts: CompileOptions & { port: number; files?: string[] }): Promise<void> {
  const clients: http.ServerResponse[] = [];
  const cache = new Map<string, string>();

  function notify(): void {
    for (const c of clients) { try { c.write("data: reload\n\n"); } catch {} }
  }

  function compileAll(): void {
    cache.clear();
    const pages = (opts.files && opts.files.length > 0)
      ? opts.files.filter(f => fs.existsSync(f))
      : findSinthPages(opts.projectRoot, opts.outDir);
    for (const p of pages) {
      try {
        const result = compileFile(p, { ...opts, checkOnly: false });
        if (!result) continue;
        const html = result.html;
        const rel = path.relative(opts.projectRoot, p).replace(/\.sinth$/, ".html").replace(/\\/g, "/");
        const url = "/" + rel;
        cache.set(url, html + LIVE_RELOAD_SCRIPT);
        if (rel === "index.html" || rel.endsWith("/index.html")) {
          cache.set("/", html + LIVE_RELOAD_SCRIPT);
        }
      } catch (e: unknown) {
        process.stderr.write(`\x1b[31m${(e as Error).message}\x1b[0m\n`);
      }
    }
  }

  compileAll();

  const resolvedOut = path.resolve(opts.outDir);
  let   watchReady  = false;
  const pending = new Map<string, NodeJS.Timeout>();
  const DEBOUNCE_MS = 300;

  try {
    fs.watch(opts.projectRoot, { recursive: true }, (_, filename) => {
      if (!filename) return;
      const abs = path.resolve(opts.projectRoot, filename);
      if (abs.startsWith(resolvedOut + path.sep) || abs === resolvedOut) return;
      if (pending.has(abs)) {
        clearTimeout(pending.get(abs)!);
      }
      pending.set(abs, setTimeout(() => {
        pending.delete(abs);
        process.stdout.write(`\x1b[36m[sinth]\x1b[0m Changed: ${filename}\n`);
        compileAll(); notify();
      }, DEBOUNCE_MS));
    });
    watchReady = true;
  } catch {}

  if (!watchReady) {
    const mtimes = new Map<string, number>();
    const poller = setInterval(() => {
      const pages = (opts.files && opts.files.length > 0)
        ? opts.files : findSinthPages(opts.projectRoot, opts.outDir);
      for (const p of pages) {
        try {
          const mtime = fs.statSync(p).mtimeMs;
          if (mtimes.get(p) !== mtime) {
            mtimes.set(p, mtime);
            process.stdout.write(`\x1b[36m[sinth]\x1b[0m Changed: ${path.relative(opts.projectRoot, p)}\n`);
            compileAll(); notify(); break;
          }
        } catch {}
      }
    }, 500);
    process.on("exit", () => clearInterval(poller));
  }

  const EXT_TYPES: Record<string, string> = {
    ".css": "text/css", ".js": "application/javascript",
    ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
    ".json": "application/json", ".xml": "application/xml",
  };

  const server = http.createServer((req, res) => {
    const reqUrl = (req.url ?? "/").split("?")[0];

    if (reqUrl === "/__sinth_sse__") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      clients.push(res);
      req.on("close", () => { const i = clients.indexOf(res); if (i !== -1) clients.splice(i, 1); });
      return;
    }

    const cached = cache.get(reqUrl) ??
      cache.get(reqUrl.endsWith("/") ? reqUrl + "index.html" : reqUrl + ".html");
    if (cached) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(cached); return; }

    let filePath = path.join(opts.projectRoot, reqUrl);
    if (reqUrl.endsWith("/")) filePath = path.join(filePath, "index.html");
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ctype = EXT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": ctype });
      res.end(fs.readFileSync(filePath));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404 Not Found");
  });

  server.listen(opts.port, () => {
    process.stdout.write(
      `\x1b[32m[sinth dev]\x1b[0m Serving at \x1b[4mhttp://localhost:${opts.port}\x1b[0m\n`
    );
  });
}