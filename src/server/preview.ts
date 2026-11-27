import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { SinthError } from "../compiler/diagnostics";
import { c, log, printDiagnostic } from "../cli/ui";
import { openBrowser } from "./dev";
import { FunctionsHost, sendResponse, toRequest } from "./functions";
import { matchRedirect, Redirect } from "../deploy/redirects";
import { Asset, assetResponse, decodePath, displayHost, fileIfExists, forbiddenHost, hostAllowed, listen, mimeType, routeCandidates, safeJoin, send, sendAsset, stripBase } from "./static";

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
  base: string;
  root: string;
  redirects: Redirect[];
  allowedHosts: string[] | true;
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
  const html = (file: string): string => (file.endsWith(".html") ? "text/html; charset=utf-8" : mimeType(file));

  const resolve = (urlPath: string): Asset => {
    const sitePath = stripBase(urlPath, opts.base);
    if (sitePath !== null && sitePath.endsWith(".html") && sitePath !== "/404.html") {
      return { status: 308, body: "", type: "text/plain", headers: { Location: urlPath.replace(/(index)?\.html$/, "") || "/" } };
    }
    if (sitePath === null && urlPath === "/") return { status: 302, body: "", type: "text/plain", headers: { Location: opts.base } };
    for (const cand of sitePath === null ? [] : routeCandidates(sitePath)) {
      const file = fileIfExists(safeJoin(outDir, cand));
      if (file && path.basename(file) !== "_headers") return { status: 200, body: fs.readFileSync(file), type: html(file), headers: headersFor(urlPath) };
    }
    const notFound = fileIfExists(path.join(outDir, "404.html"));
    return { status: 404, body: notFound ? fs.readFileSync(notFound) : "404 Not Found", type: notFound ? "text/html; charset=utf-8" : "text/plain", headers: headersFor(urlPath) };
  };

  const functions = new FunctionsHost(opts.root, "production");
  const handle = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    if (!hostAllowed(req.headers.host, opts.allowedHosts === true || [...opts.allowedHosts, opts.host])) return forbiddenHost(res, req.headers.host);
    const urlPath = decodePath(req.url);
    if (!urlPath) return send(res, 400, "Bad request", "text/plain");
    const sitePath = stripBase(urlPath, opts.base);
    const redirect = sitePath === null ? null : matchRedirect(opts.redirects, sitePath, (req.url ?? "").match(/\?[^#]*/)?.[0]);
    if (redirect) return send(res, redirect.status, "", "text/plain", { Location: redirect.location });
    const head = req.method === "HEAD";
    if (functions.enabled) {
      const response = await functions.handle(await toRequest(req), async r => assetResponse(resolve(decodePath(new URL(r.url).pathname) ?? "/")));
      if (response) return sendResponse(res, response, head);
    }
    if (req.method !== "GET" && !head) return send(res, 405, "Method not allowed", "text/plain");
    sendAsset(res, resolve(urlPath), head);
  };

  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      if (err instanceof SinthError) printDiagnostic(err.diagnostic);
      else log.error((err as Error).stack ?? String(err));
      if (!res.headersSent) send(res, 500, "Internal error", "text/plain");
      else res.end();
    });
  });

  const port = await listen(server, opts.port, opts.host);
  const url = `http://${displayHost(opts.host)}:${port}${opts.base}`;
  log.blank();
  console.log(`  ${c.green("➜")}  ${c.bold("Preview:")} ${c.cyan(url)}`);
  console.log(`  ${c.gray("Serving " + (path.relative(process.cwd(), outDir) || ".") + " with production headers" + (functions.enabled ? " and functions/" : ""))}`);
  log.blank();
  if (opts.open) openBrowser(url);
}
