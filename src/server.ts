import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { compileFile, CompileOptions, findSinthPages } from "./core/cli-compiler";
import { SinthError } from "./core/types";


export const LIVE_RELOAD_SCRIPT = `<script>
(function(){
  var es = new EventSource('/__sinth_sse__');
  var pendingCss = {};
  var moduleCache = {};
  var styleElements = {};
  
  es.onmessage = function(e) {
    var data = e.data;
    if (data === "reload") {
      location.reload();
    } else if (data.startsWith("error:")) {
      showErrorOverlay(data.slice(6));
    } else if (data.startsWith("update:")) {
      applyUpdate(data.slice(7));
    } else if (data.startsWith("hmr:")) {
      applyHmrUpdate(data.slice(4));
    }
  };
  es.onerror   = function() { setTimeout(function() { location.reload(); }, 1000); };
  
  function showErrorOverlay(msg) {
    var existing = document.getElementById('__sinth_error_overlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = '__sinth_error_overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);color:#fff;padding:2rem;font-family:monospace;z-index:9999;overflow:auto;';
    overlay.innerHTML = '<h2 style="color:#ff6b6b;margin-top:0;">Sinth Compilation Error</h2><pre style="white-space:pre-wrap;word-break:break-word;">' + escapeHtml(msg) + '</pre>';
    document.body.appendChild(overlay);
  }
  
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function applyUpdate(updateJson) {
    try {
      var update = JSON.parse(updateJson);
      if (update.type === "css") {
        var link = document.querySelector('link[href*="' + update.file + '"]');
        if (link) {
          var newLink = link.cloneNode();
          newLink.href = update.url + '?t=' + Date.now();
          link.parentNode.replaceChild(newLink, link);
        }
      } else if (update.type === "js") {
        location.reload();
      } else if (update.type === "html") {
        location.reload();
      }
    } catch(e) {
      location.reload();
    }
  }
  
  function applyHmrUpdate(hmrJson) {
    try {
      var update = JSON.parse(hmrJson);
      if (update.type === "css") {
        // Hot CSS update - inject new styles
        var styleId = 'sinth-hmr-css-' + update.file;
        var style = document.getElementById(styleId);
        if (!style) {
          style = document.createElement('style');
          style.id = styleId;
          document.head.appendChild(style);
        }
        style.textContent = update.content;
      } else if (update.type === "js") {
        // Hot JS update - evaluate new module
        var scriptId = 'sinth-hmr-js-' + update.file;
        var oldScript = document.getElementById(scriptId);
        if (oldScript) oldScript.remove();
        var script = document.createElement('script');
        script.id = scriptId;
        script.type = 'module';
        script.textContent = update.content;
        document.head.appendChild(script);
      } else if (update.type === "html") {
        // HTML partial update
        if (update.selector && update.content) {
          var el = document.querySelector(update.selector);
          if (el) el.innerHTML = update.content;
        } else {
          location.reload();
        }
      }
    } catch(e) {
      console.error('HMR update failed:', e);
      location.reload();
    }
  }
})();
</script>`;

interface CompileResult {
  html?: string;
  error?: string;
  jsFile?: { filename: string; content: string };
  cssFile?: { filename: string; content: string };
  pagePath: string;
  url: string;
  cssContent?: string;
  jsContent?: string;
}

export async function startDevServer(opts: CompileOptions & { port: number; files?: string[] }): Promise<void> {
  const clients: http.ServerResponse[] = [];
  const pageCache = new Map<string, string>();
  const pageErrors = new Map<string, string>();
  const fileHashes = new Map<string, string>();
  
  function broadcast(data: string): void {
    for (const c of clients) { 
      try { c.write("data: " + data + "\n\n"); } catch { void 0; } 
    }
  }
  
  function hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }
  
  function compilePage(pagePath: string): CompileResult {
    try {
      const result = compileFile(pagePath, { ...opts, checkOnly: false });
      if (!result) return { pagePath, url: "", error: "No result" };
      
      const jsDir = path.join(path.resolve(opts.outDir), "_sinth", "js");
      const cssDir = path.join(path.resolve(opts.outDir), "_sinth", "styles");
      
      if (result.jsFile) {
        fs.mkdirSync(jsDir, { recursive: true });
        fs.writeFileSync(path.join(jsDir, result.jsFile.filename), result.jsFile.content);
      }
      if (result.cssFile) {
        fs.mkdirSync(cssDir, { recursive: true });
        fs.writeFileSync(path.join(cssDir, result.cssFile.filename), result.cssFile.content);
      }
      
      const rel = path.relative(opts.projectRoot, pagePath).replace(/\.sinth$/, ".html").replace(/\\/g, "/");
      const url = "/" + rel;
      const html = result.html + LIVE_RELOAD_SCRIPT;
      
      // Extract CSS and JS content for HMR
      let cssContent = "";
      let jsContent = "";
      if (result.cssFile) {
        cssContent = result.cssFile.content;
      }
      if (result.jsFile) {
        jsContent = result.jsFile.content;
      }
      
      pageCache.set(url, html);
      pageErrors.delete(url);
      if (rel === "index.html" || rel.endsWith("/index.html")) {
        pageCache.set("/", html);
        pageErrors.delete("/");
      }
      
      return { html, pagePath, url, jsFile: result.jsFile, cssFile: result.cssFile, cssContent, jsContent };
    } catch (e: unknown) {
      const err = e instanceof SinthError ? e.message : (e as Error).message;
      const rel = path.relative(opts.projectRoot, pagePath).replace(/\.sinth$/, ".html").replace(/\\/g, "/");
      const url = "/" + rel;
      
      const errorHtml = generateErrorPage(err, pagePath);
      pageCache.set(url, errorHtml + LIVE_RELOAD_SCRIPT);
      pageErrors.set(url, err);
      if (rel === "index.html" || rel.endsWith("/index.html")) {
        pageCache.set("/", errorHtml + LIVE_RELOAD_SCRIPT);
        pageErrors.set("/", err);
      }
      
      process.stderr.write(`\x1b[31m[ERROR] ${pagePath}: ${err}\x1b[0m\n`);
      broadcast("error:" + err.replace(/\n/g, "\\n"));
      
      return { pagePath, url, error: err };
    }
  }
  
  function generateErrorPage(error: string, filePath: string): string {
    const escapedError = error.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
    const fileName = path.basename(filePath);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sinth Error - ${fileName}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: #1a1a2e; color: #eee; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
    .error-container { max-width: 900px; width: 100%; background: #16213e; border-radius: 8px; padding: 2rem; box-shadow: 0 8px 32px rgba(0,0,0,0.3); border: 1px solid #0f3460; }
    .error-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #0f3460; }
    .error-icon { color: #ff6b6b; font-size: 2rem; }
    .error-title { color: #ff6b6b; margin: 0; font-size: 1.5rem; }
    .file-name { color: #888; font-size: 0.9rem; margin: 0; font-family: monospace; }
    .error-message { background: #0f0f23; padding: 1.5rem; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; word-break: break-word; border: 1px solid #0f3460; }
    .error-frame { color: #4ecdc4; }
    .error-line { color: #ffe66d; }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-header">
      <span class="error-icon">⚠</span>
      <div>
        <h1 class="error-title">Compilation Error</h1>
        <p class="file-name">${fileName}</p>
      </div>
    </div>
    <div class="error-message">${escapedError}</div>
  </div>
</body>
</html>`;
  }
  
  function compileAll(): void {
    pageCache.clear();
    pageErrors.clear();
    fileHashes.clear();
    const pages = (opts.files && opts.files.length > 0)
      ? opts.files.filter(f => fs.existsSync(f))
      : findSinthPages(opts.projectRoot, opts.outDir, opts.libraryPaths);
    
    const jsDir = path.join(path.resolve(opts.outDir), "_sinth", "js");
    const cssDir = path.join(path.resolve(opts.outDir), "_sinth", "styles");
    fs.rmSync(jsDir, { recursive: true, force: true });
    fs.rmSync(cssDir, { recursive: true, force: true });
    
    for (const p of pages) {
      compilePage(p);
    }
  }
  
  function computeFileHash(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash) + content.charCodeAt(i);
        hash |= 0;
      }
      return hash.toString(36);
    } catch {
      return '';
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
        
        // Handle different file types for HMR
        if (filename.endsWith(".sinth")) {
          const pagePath = abs;
          const result = compilePage(pagePath);
          if (!result.error) {
            // Send HMR updates for CSS and JS
            if (result.cssFile && result.cssContent) {
              const cssHash = hashContent(result.cssContent);
              const oldHash = fileHashes.get(result.cssFile.filename);
              if (cssHash !== oldHash) {
                fileHashes.set(result.cssFile.filename, cssHash);
                broadcast("hmr:" + JSON.stringify({ 
                  type: "css", 
                  file: result.cssFile.filename, 
                  content: result.cssContent 
                }));
              }
            }
            if (result.jsFile && result.jsContent) {
              const jsHash = hashContent(result.jsContent);
              const oldHash = fileHashes.get(result.jsFile.filename);
              if (jsHash !== oldHash) {
                fileHashes.set(result.jsFile.filename, jsHash);
                broadcast("hmr:" + JSON.stringify({ 
                  type: "js", 
                  file: result.jsFile.filename, 
                  content: result.jsContent 
                }));
              }
            }
            // Also update HTML cache for navigation
            const rel = path.relative(opts.projectRoot, pagePath).replace(/\.sinth$/, ".html").replace(/\\/g, "/");
            const url = "/" + rel;
            const html = result.html + LIVE_RELOAD_SCRIPT;
            pageCache.set(url, html);
            if (rel === "index.html" || rel.endsWith("/index.html")) {
              pageCache.set("/", html);
            }
          } else {
            broadcast("error:" + result.error.replace(/\n/g, "\\n"));
          }
        } else if (filename.endsWith(".css") || filename.endsWith(".scss")) {
          // CSS file changed - inject updated CSS
          const cssHash = computeFileHash(abs);
          const oldHash = fileHashes.get(filename);
          if (cssHash !== oldHash) {
            fileHashes.set(filename, cssHash);
            const content = fs.readFileSync(abs, 'utf-8');
            broadcast("hmr:" + JSON.stringify({ 
              type: "css", 
              file: filename, 
              content 
            }));
          }
        } else if (filename.endsWith(".js")) {
          // JS file changed - hot reload module
          const jsHash = computeFileHash(abs);
          const oldHash = fileHashes.get(filename);
          if (jsHash !== oldHash) {
            fileHashes.set(filename, jsHash);
            const content = fs.readFileSync(abs, 'utf-8');
            broadcast("hmr:" + JSON.stringify({ 
              type: "js", 
              file: filename, 
              content 
            }));
          }
        } else {
          // For other files (assets, etc.), do full rebuild
          compileAll();
          broadcast("reload");
        }
      }, DEBOUNCE_MS));
    });
    watchReady = true;
  } catch {
    void 0;
  }

  if (!watchReady) {
    const mtimes = new Map<string, number>();
    const poller = setInterval(() => {
      const pages = (opts.files && opts.files.length > 0)
        ? opts.files : findSinthPages(opts.projectRoot, opts.outDir, opts.libraryPaths);
      for (const p of pages) {
        try {
          const mtime = fs.statSync(p).mtimeMs;
          if (mtimes.get(p) !== mtime) {
            mtimes.set(p, mtime);
            process.stdout.write(`\x1b[36m[sinth]\x1b[0m Changed: ${path.relative(opts.projectRoot, p)}\n`);
            compileAll(); broadcast("reload"); break;
          }
        } catch {
          void 0;
        }
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

    const cached = pageCache.get(reqUrl) ??
      pageCache.get(reqUrl.endsWith("/") ? reqUrl + "index.html" : reqUrl + ".html") ??
      pageCache.get("/pages" + reqUrl) ??
      pageCache.get("/pages" + (reqUrl.endsWith("/") ? reqUrl + "index.html" : reqUrl + ".html"));
    if (cached) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(cached); return; }

    if (reqUrl.startsWith("/_sinth/")) {
      const assetPath = path.join(path.resolve(opts.outDir), reqUrl);
      if (fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
        const ctype = EXT_TYPES[path.extname(assetPath).toLowerCase()] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": ctype });
        res.end(fs.readFileSync(assetPath));
        return;
      }
    }

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
    process.stdout.write(`\x1b[2m  HMR enabled - CSS/JS updates without reload\x1b[0m\n`);
  });
}