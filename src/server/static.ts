import * as fs from "fs";
import * as http from "http";
import * as path from "path";

export const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".map": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".otf": "font/otf", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".webmanifest": "application/manifest+json", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".pdf": "application/pdf", ".wasm": "application/wasm",
};

export function mimeType(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

export function decodePath(url: string | undefined): string | null {
  const raw = (url ?? "/").split(/[?#]/)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const normalized = path.posix.normalize(decoded.replace(/\\/g, "/"));
  if (!normalized.startsWith("/") || normalized.split("/").includes("..")) return null;
  return normalized;
}

export function safeJoin(root: string, urlPath: string): string | null {
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, "." + urlPath);
  if (full !== resolvedRoot && !full.startsWith(resolvedRoot + path.sep)) return null;
  return full;
}

export function fileIfExists(file: string | null): string | null {
  if (!file) return null;
  try {
    const st = fs.statSync(file);
    if (st.isFile()) return file;
    if (st.isDirectory()) {
      const idx = path.join(file, "index.html");
      if (fs.existsSync(idx)) return idx;
    }
  } catch {
    return null;
  }
  return null;
}

export function send(res: http.ServerResponse, status: number, body: string | Uint8Array, type: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": String(typeof body === "string" ? Buffer.byteLength(body) : body.byteLength),
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
}

export function routeCandidates(urlPath: string): string[] {
  const clean = urlPath.replace(/\/+$/, "") || "/";
  if (clean === "/") return ["/index.html"];
  if (/\.[a-z0-9]+$/i.test(clean)) return [clean];
  return [clean + ".html", clean + "/index.html"];
}

export function listen(server: http.Server, port: number, host: string, attempts = 10): Promise<number> {
  return new Promise((resolve, reject) => {
    let current = port;
    const tryListen = (): void => {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && current < port + attempts) {
          current++;
          tryListen();
        } else reject(err);
      });
      server.listen(current, host, () => resolve(current));
    };
    tryListen();
  });
}

export function displayHost(host: string): string {
  return host === "127.0.0.1" || host === "::1" || host === "0.0.0.0" || host === "::" ? "localhost" : host;
}
