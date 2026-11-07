import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { SinthError } from "../compiler/diagnostics";
import { c, log } from "../cli/ui";
import { openBrowser } from "./dev";
import { decodePath, displayHost, fileIfExists, listen, mimeType, routeCandidates, safeJoin, send } from "./static";

interface HeaderRule {
  pattern: RegExp;
  headers: Record<string, string>;
}

function parseHeadersFile(file: string): HeaderRule[] {
  if (!fs.existsSync(file)) return [];
  const rules: HeaderRule[] = [];
  let current: HeaderRule | null = null;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp("^" + line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
      current = { pattern, headers: {} };
      rules.push(current);
    } else if (current) {
      const idx = line.indexOf(":");
      if (idx > 0) current.headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return rules;
}

export interface PreviewOptions {
  port: number;
  host: string;
  open: boolean;
}

export async function startPreview(outDir: string, opts: PreviewOptions): Promise<void> {
  if (!fs.existsSync(outDir)) {
    throw new SinthError("E1000", `No build found at ${outDir}`, undefined, "Run 'sinth build' first");
  }
  const rules = parseHeadersFile(path.join(outDir, "_headers"));
  const headersFor = (urlPath: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const r of rules) if (r.pattern.test(urlPath)) Object.assign(out, r.headers);
    return out;
  };

  const server = http.createServer((req, res) => {
    const urlPath = decodePath(req.url);
    if (!urlPath) return send(res, 400, "Bad request", "text/plain");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain");
    if (urlPath.endsWith(".html") && urlPath !== "/404.html") {
      const clean = urlPath.replace(/(index)?\.html$/, "");
      res.writeHead(308, { Location: clean || "/" });
      res.end();
      return;
    }
    for (const cand of routeCandidates(urlPath)) {
      const file = fileIfExists(safeJoin(outDir, cand));
      if (file && path.basename(file) !== "_headers") {
        return send(res, 200, fs.readFileSync(file), mimeType(file), headersFor(urlPath));
      }
    }
    const notFound = fileIfExists(path.join(outDir, "404.html"));
    return send(res, 404, notFound ? fs.readFileSync(notFound) : "404 Not Found", notFound ? "text/html; charset=utf-8" : "text/plain", headersFor(urlPath));
  });

  const port = await listen(server, opts.port, opts.host);
  const url = `http://${displayHost(opts.host)}:${port}`;
  log.blank();
  console.log(`  ${c.green("➜")}  ${c.bold("Preview:")} ${c.cyan(url)}`);
  console.log(`  ${c.gray("Serving " + path.relative(process.cwd(), outDir) + " with production headers")}`);
  log.blank();
  if (opts.open) openBrowser(url);
}
