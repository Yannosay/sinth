import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import { Diagnostic, SinthError } from "../compiler/diagnostics";
import { buildHead, escapeHtml, renderDocument } from "../compiler/html";
import { CompiledPage, fontHref, PageInfo, Project, RUNTIME_PATH } from "./project";

export interface OutputFile {
  path: string;
  contents: Uint8Array;
}

export interface PageOutput {
  page: PageInfo;
  html: string;
  js?: string;
  css?: string;
  interactive: boolean;
  bytes: number;
}

export interface BuildOutput {
  pages: PageOutput[];
  files: Map<string, OutputFile>;
  warnings: Diagnostic[];
  durationMs: number;
}

export interface BuildOptions {
  write: boolean;
  devClient?: string;
}

const ASSET_LOADERS: Record<string, esbuild.Loader> = {
  ".png": "file", ".jpg": "file", ".jpeg": "file", ".gif": "file", ".webp": "file", ".avif": "file", ".svg": "file",
  ".ico": "file", ".woff": "file", ".woff2": "file", ".ttf": "file", ".otf": "file", ".eot": "file", ".mp4": "file",
  ".webm": "file", ".mp3": "file", ".wav": "file", ".txt": "text",
};

function sinthPlugin(project: Project, entries: Map<string, string>, injectCss = false): esbuild.Plugin {
  return {
    name: "sinth",
    setup(b) {
      b.onResolve({ filter: /^sinth-runtime$/ }, () => ({ path: RUNTIME_PATH }));
      b.onResolve({ filter: /^sinth-entry:/ }, a => ({ path: a.path.slice("sinth-entry:".length), namespace: "sinth-entry" }));
      b.onLoad({ filter: /.*/, namespace: "sinth-entry" }, a => ({ contents: entries.get(a.path) ?? "", loader: "js", resolveDir: project.root }));
      b.onResolve({ filter: /^sinth-css:/ }, a => ({ path: a.path.slice("sinth-css:".length), namespace: "sinth-css" }));
      b.onLoad({ filter: /.*/, namespace: "sinth-css" }, a => (injectCss
        ? { contents: `import { injectCss } from "sinth-runtime";\ninjectCss(${JSON.stringify("sinth-" + a.path.length.toString(36) + "-" + path.basename(a.path))}, ${JSON.stringify(project.compile(a.path).css)});`, loader: "js", resolveDir: path.dirname(a.path) }
        : { contents: project.compile(a.path).css, loader: "css", resolveDir: path.dirname(a.path) }));
      if (injectCss) {
        b.onLoad({ filter: /\.css$/ }, a => ({
          contents: `import { injectCss } from "sinth-runtime";\ninjectCss(${JSON.stringify("sinth-css-" + path.basename(a.path))}, ${JSON.stringify(fs.readFileSync(a.path, "utf-8"))});`,
          loader: "js",
        }));
      }
      b.onLoad({ filter: /\.sinth$/ }, a => ({ contents: project.compile(a.path).js, loader: "js", resolveDir: path.dirname(a.path) }));
      b.onLoad({ filter: /\.s[ac]ss$/ }, a => {
        const scss = project.scss();
        if (!scss) return { errors: [{ text: `Cannot compile ${path.basename(a.path)}: install 'sass' (npm install -D sass)` }] };
        try {
          return { contents: scss(fs.readFileSync(a.path, "utf-8"), a.path), loader: "css", resolveDir: path.dirname(a.path) };
        } catch (err) {
          return { errors: [{ text: (err as Error).message }] };
        }
      });
    },
  };
}

function findCustomElementFiles(project: Project): string[] {
  const out: string[] = [];
  const skip = new Set(["node_modules", ".git", ".sinth", ".wrangler"]);
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name) && full !== project.config.outDir) walk(full);
      } else if (e.name.endsWith(".sinth")) {
        const src = fs.readFileSync(full, "utf-8");
        if (/\bcustom(-element)?\s+[A-Za-z]/.test(src) || /\bcomponent\s+[A-Z]\w*\s*(\([^)]*\))?\s*as\s*</.test(src)) out.push(full);
      }
    }
  };
  walk(project.root);
  return out;
}

async function buildCustomElements(project: Project): Promise<esbuild.OutputFile[]> {
  const entries = new Map<string, string>();
  const entryPoints: Record<string, string> = {};
  for (const file of findCustomElementFiles(project)) {
    const parsed = project.getFile(file);
    if (parsed.isPage) continue;
    project.compile(file);
    for (const c of parsed.components) {
      if (!c.customTag) continue;
      const key = "elements/" + c.customTag;
      entries.set(key, `import ${JSON.stringify(file)};`);
      entryPoints[key] = "sinth-entry:" + key;
    }
  }
  if (!entries.size) return [];
  try {
    const result = await esbuild.build({
      entryPoints, bundle: true, format: "esm", platform: "browser", target: project.config.target,
      outdir: project.config.outDir, entryNames: "[dir]/[name]", minify: project.config.minify, write: false,
      logLevel: "silent", charset: "utf8", legalComments: "none", loader: { ...ASSET_LOADERS, ".svg": "dataurl", ".png": "dataurl" },
      plugins: [sinthPlugin(project, entries, true)], absWorkingDir: project.root,
    });
    return result.outputFiles;
  } catch (err) {
    throw esbuildErrorToSinth(err, project);
  }
}

function entryKey(page: PageInfo): string {
  const key = page.outFile.replace(/\.html$/, "").replace(/[^A-Za-z0-9/_-]/g, "_");
  return key === "index" ? "index" : key.replace(/\/index$/, "/index");
}

function esbuildErrorToSinth(err: unknown, project: Project): SinthError {
  const failure = err as { errors?: esbuild.Message[] };
  const first = failure.errors?.[0];
  if (!first) return new SinthError("E0800", (err as Error).message ?? String(err));
  const loc = first.location;
  const missing = first.text.match(/Could not resolve "([^"]+)"/);
  let hint: string | undefined;
  if (missing && !missing[1].startsWith(".") && !missing[1].startsWith("/")) {
    const name = missing[1].startsWith("@") ? missing[1].split("/").slice(0, 2).join("/") : missing[1].split("/")[0];
    hint = `Install it with: npm install ${name}`;
  }
  const file = loc?.file ? path.resolve(project.root, loc.file.replace(/^[a-z-]+:/, "")) : undefined;
  const isGenerated = !!file && file.endsWith(".sinth");
  if (isGenerated && !missing) {
    return new SinthError("E0899", `Internal compiler error: generated invalid JavaScript (${first.text})`, file ? { file, line: 1, col: 1 } : undefined,
      `Generated line ${loc?.line}: ${loc?.lineText?.trim().slice(0, 200)}. Please report this at https://github.com/Yannosay/sinth/issues`);
  }
  return new SinthError(
    "E0800",
    first.text,
    file && !isGenerated ? { file, line: loc?.line ?? 1, col: (loc?.column ?? 0) + 1 } : undefined,
    hint,
  );
}

function prepareOutDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return;
  }
  const entries = fs.readdirSync(dir);
  if (entries.length && !entries.includes("_sinth")) {
    throw new SinthError("E0801", `Refusing to clear '${dir}': it is not empty and was not created by Sinth`, undefined, "Delete it yourself or set a different \"outDir\" in sinth.config.json");
  }
  for (const e of entries) fs.rmSync(path.join(dir, e), { recursive: true, force: true });
}

function copyDir(src: string, dest: string, files: Map<string, OutputFile>, outDir: string): void {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to, files, outDir);
    else if (entry.isFile() && !entry.name.endsWith(".sinth")) {
      files.set(path.relative(outDir, to).replace(/\\/g, "/"), { path: to, contents: fs.readFileSync(from) });
    }
  }
}

export function contentSecurityPolicy(pages: CompiledPage[], custom: boolean | string): string | undefined {
  if (custom === false) return undefined;
  if (typeof custom === "string") return custom;
  const scriptOrigins = new Set<string>();
  const styleOrigins = new Set<string>();
  let fonts = false;
  for (const p of pages) {
    for (const s of p.externalScripts) scriptOrigins.add(originOf(s.src));
    for (const s of p.externalStyles) styleOrigins.add(originOf(s));
    if (p.fonts.length) fonts = true;
  }
  if (fonts) styleOrigins.add("https://fonts.googleapis.com");
  return [
    "default-src 'self'",
    `script-src 'self'${[...scriptOrigins].map(o => " " + o).join("")}`,
    `style-src 'self' 'unsafe-inline'${[...styleOrigins].map(o => " " + o).join("")}`,
    `font-src 'self' data:${fonts ? " https://fonts.gstatic.com" : ""}`,
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

function originOf(url: string): string {
  try {
    return new URL(url.startsWith("//") ? "https:" + url : url).origin;
  } catch {
    return url;
  }
}

export async function buildProject(project: Project, options: BuildOptions): Promise<BuildOutput> {
  const started = Date.now();
  const cfg = project.config;
  project.invalidate();
  const pages = project.findPages();
  if (!pages.length) {
    throw new SinthError("E0802", `No pages found in ${path.relative(project.root, cfg.pagesDir) || "."}`, undefined, "A page is a .sinth file that starts with 'page'. Create pages/index.sinth to get started");
  }
  const compiled = pages.map(p => project.compilePage(p));
  const entries = new Map<string, string>();
  const entryPoints: Record<string, string> = {};
  for (const c of compiled) {
    const key = entryKey(c.page);
    const lines: string[] = [];
    for (const s of c.styleImports) lines.push(`import ${JSON.stringify(s)};`);
    if (c.interactive) {
      lines.push(`import * as page from ${JSON.stringify(c.page.file)};`);
      lines.push(`import { boot } from "sinth-runtime";`);
      lines.push(`boot({ render: page.render, state: page.state, restore: page.restore, dev: ${project.dev} });`);
    } else {
      for (const f of c.graph) if (project.compile(f).css) lines.push(`import ${JSON.stringify("sinth-css:" + f)};`);
    }
    entries.set(key, lines.join("\n"));
    entryPoints[key] = "sinth-entry:" + key;
  }

  let result: esbuild.BuildResult<{ metafile: true; write: false }>;
  try {
    result = await esbuild.build({
      entryPoints,
      bundle: true,
      format: "esm",
      splitting: true,
      platform: "browser",
      target: cfg.target,
      outdir: path.join(cfg.outDir, "_sinth"),
      entryNames: project.dev ? "[dir]/[name]" : "[dir]/[name]-[hash]",
      chunkNames: "chunks/[name]-[hash]",
      assetNames: "assets/[name]-[hash]",
      publicPath: cfg.base + "_sinth",
      minify: cfg.minify,
      sourcemap: cfg.sourcemap ? (project.dev ? "inline" : "linked") : false,
      metafile: true,
      write: false,
      logLevel: "silent",
      charset: "utf8",
      legalComments: cfg.minify ? "none" : "eof",
      loader: ASSET_LOADERS,
      define: { "process.env.NODE_ENV": JSON.stringify(project.dev ? "development" : "production") },
      plugins: [sinthPlugin(project, entries)],
      absWorkingDir: project.root,
    });
  } catch (err) {
    throw esbuildErrorToSinth(err, project);
  }

  const files = new Map<string, OutputFile>();
  for (const f of result.outputFiles) {
    files.set(path.relative(cfg.outDir, f.path).replace(/\\/g, "/"), { path: f.path, contents: f.contents });
  }

  const csp = contentSecurityPolicy(compiled, cfg.security.csp);
  const pageOutputs: PageOutput[] = [];
  const toUrl = (abs: string): string => cfg.base + path.relative(cfg.outDir, path.resolve(project.root, abs)).replace(/\\/g, "/");
  for (const c of compiled) {
    const key = entryKey(c.page);
    let jsOut: string | undefined;
    let cssOut: string | undefined;
    const preloads: string[] = [];
    for (const [out, meta] of Object.entries(result.metafile.outputs)) {
      if (meta.entryPoint !== "sinth-entry:" + key) continue;
      jsOut = out;
      cssOut = meta.cssBundle;
      for (const imp of meta.imports) if (imp.kind === "import-statement" && !imp.external) preloads.push(toUrl(imp.path));
    }
    const file = project.getFile(c.page.file);
    const head = buildHead(file.meta, v => project.resolveAsset(v, c.page.file));
    const styles: string[] = [];
    const inlineHead: string[] = [];
    if (c.fonts.length) {
      inlineHead.push('<link rel="preconnect" href="https://fonts.googleapis.com">', '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
      for (const f of c.fonts) styles.push(fontHref(f));
    }
    styles.push(...c.externalStyles);
    if (cssOut) styles.push(toUrl(cssOut));
    const scripts = c.externalScripts.map(s => ({ src: s.src, module: false, attrs: s.attrs }));
    if (c.interactive && jsOut) scripts.push({ src: toUrl(jsOut), module: true, attrs: {} });
    if (options.devClient) inlineHead.push(`<script type="module" src="${options.devClient}"></script>`);
    if (!c.interactive && jsOut) files.delete(path.relative(cfg.outDir, path.resolve(project.root, jsOut)).replace(/\\/g, "/"));
    const body = c.prerendered ? c.prerendered : c.interactive ? "" : "";
    const html = renderDocument(head, body, { styles, scripts, preloads: c.interactive ? preloads : [], inlineHead });
    files.set(c.page.outFile, { path: path.join(cfg.outDir, c.page.outFile), contents: Buffer.from(html) });
    pageOutputs.push({
      page: c.page, html, interactive: c.interactive, bytes: Buffer.byteLength(html),
      js: c.interactive && jsOut ? toUrl(jsOut) : undefined, css: cssOut ? toUrl(cssOut) : undefined,
    });
  }

  if (!project.dev) {
    for (const f of await buildCustomElements(project)) {
      files.set(path.relative(cfg.outDir, f.path).replace(/\\/g, "/"), { path: f.path, contents: f.contents });
    }
    copyDir(cfg.publicDir, cfg.outDir, files, cfg.outDir);
    for (const d of cfg.staticDirs) copyDir(path.resolve(project.root, d), path.join(cfg.outDir, d), files, cfg.outDir);
    if (cfg.security.headers && !files.has("_headers")) {
      const lines = ["/*", "  X-Content-Type-Options: nosniff", "  Referrer-Policy: strict-origin-when-cross-origin", "  X-Frame-Options: SAMEORIGIN", "  Cross-Origin-Opener-Policy: same-origin"];
      if (csp) lines.push(`  Content-Security-Policy: ${csp}`);
      lines.push("", `${cfg.base}_sinth/*`, "  Cache-Control: public, max-age=31536000, immutable", "");
      files.set("_headers", { path: path.join(cfg.outDir, "_headers"), contents: Buffer.from(lines.join("\n")) });
    }
    if (cfg.site) {
      const site = cfg.site.replace(/\/$/, "");
      const urls = pageOutputs.filter(p => !/(^|\/)404$/.test(p.page.route)).map(p => `  <url><loc>${escapeHtml(site + p.page.route)}</loc></url>`);
      files.set("sitemap.xml", { path: path.join(cfg.outDir, "sitemap.xml"), contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`) });
      if (!files.has("robots.txt")) files.set("robots.txt", { path: path.join(cfg.outDir, "robots.txt"), contents: Buffer.from(`User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`) });
    }
  }

  if (options.write) {
    prepareOutDir(cfg.outDir);
    for (const f of files.values()) {
      fs.mkdirSync(path.dirname(f.path), { recursive: true });
      fs.writeFileSync(f.path, f.contents);
    }
  }

  const bundlerWarnings: Diagnostic[] = result.warnings.map(w => ({
    severity: "warning",
    code: "W0800",
    message: w.text,
    loc: w.location?.file && !w.location.file.endsWith(".sinth") ? { file: path.resolve(project.root, w.location.file.replace(/^[a-z-]+:/, "")), line: w.location.line, col: w.location.column + 1 } : undefined,
  }));
  const warnings = dedupeWarnings([...compiled.flatMap(c => c.warnings), ...bundlerWarnings]);
  return { pages: pageOutputs, files, warnings, durationMs: Date.now() - started };
}

function dedupeWarnings(list: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return list.filter(d => {
    const key = `${d.code}${d.message}${d.loc?.file}${d.loc?.line}${d.loc?.col}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function checkProject(project: Project): { pages: PageInfo[]; warnings: Diagnostic[]; errors: SinthError[] } {
  project.invalidate();
  const pages = project.findPages();
  const errors: SinthError[] = [];
  const warnings: Diagnostic[] = [];
  for (const p of pages) {
    try {
      warnings.push(...project.compilePage(p).warnings);
    } catch (err) {
      if (err instanceof SinthError) errors.push(err);
      else throw err;
    }
  }
  return { pages, warnings: dedupeWarnings(warnings), errors };
}
