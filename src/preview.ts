import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { CompileOptions } from "./core/cli-compiler";

const EXT_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".json": "application/json",
  ".xml": "application/xml",
};

function findHtmlFiles(dir: string, base: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(full, base));
    } else if (entry.name.endsWith(".html")) {
      results.push(rel);
    }
  }
  return results.sort();
}

export async function previewBuild(opts: CompileOptions & { port: number }): Promise<void> {
  const outDir = path.resolve(opts.outDir);
  
  if (!fs.existsSync(outDir)) {
    process.stderr.write(`\x1b[31mBuild output directory not found: ${outDir}\x1b[0m\n`);
    process.stderr.write(`Run \x1b[1msinth build\x1b[0m first.\n`);
    process.exit(1);
  }

  const htmlFiles = findHtmlFiles(outDir, outDir);
  const rootHtml = htmlFiles.length > 0 ? htmlFiles[0] : "index.html";

  const server = http.createServer((req, res) => {
    const reqUrl = (req.url ?? "/").split("?")[0];
    
    // Redirect root to first HTML file
    let filePath: string;
    if (reqUrl === "/" || reqUrl === "") {
      filePath = path.join(outDir, rootHtml);
    } else {
      filePath = path.join(outDir, reqUrl);
      if (reqUrl.endsWith("/")) {
        filePath = path.join(filePath, "index.html");
      }
    }
    
    if (!filePath.startsWith(outDir + path.sep) && filePath !== outDir) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("403 Forbidden");
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ctype = EXT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": ctype });
      res.end(fs.readFileSync(filePath));
      return;
    }

    // SPA fallback - try index.html at root
    const indexPath = path.join(outDir, rootHtml);
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(indexPath));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  });

  server.listen(opts.port, () => {
    process.stdout.write(
      `\x1b[32m[sinth preview]\x1b[0m Serving \x1b[1m${outDir}\x1b[0m at \x1b[4mhttp://localhost:${opts.port}\x1b[0m\n`
    );
    if (htmlFiles.length > 0) {
      process.stdout.write(`\x1b[2m  Root page: /${rootHtml}\x1b[0m\n`);
    }
  });
}