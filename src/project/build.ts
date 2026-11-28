import * as esbuild from "esbuild";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Diagnostic, SinthError } from "../compiler/diagnostics";
import { buildHead, escapeHtml, renderDocument } from "../compiler/html";
import { headersFile, readsHeadersFile, securityHeaders, writePlatformOutput } from "../deploy/platforms";
import { headerRulesFile, isPattern, redirectPage, redirectsFile } from "../deploy/redirects";
import { staticDirPath } from "./config";
import { CompiledPage, fontHref, PageInfo, Project, ROUTER_PATH, RUNTIME_PATH } from "./project";

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

/**
 * A short id for a virtual CSS module. esbuild prints module paths in comments in unminified
 * output, so ids never contain absolute paths of the build machine.
 */
function cssModuleId(project: Project, file: string): string {
  const rel = path.relative(project.root, file);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep).join("/");
  const parts = file.split(/[\\/]/);
  const nm = parts.lastIndexOf("node_modules");
  return nm !== -1 ? parts.slice(nm).join("/") : "external/" + parts.slice(-2).join("/");
}

/**
 * CSS of .sinth libraries outside the project (sinth:ui, packages). It is left out of every page
 * bundle and written once as a shared stylesheet, so browsers download it once per site.
 */
type LibraryCss = Map<string, string>;

function isLibraryModule(id: string): boolean {
  return id.startsWith("external/") || id.startsWith("node_modules/");
}

/** Writes the shared library stylesheet into `files` and returns its path below the site root. */
function writeLibraryCss(css: LibraryCss, outDir: string, dev: boolean, minify: boolean, files: Map<string, OutputFile>): string | undefined {
  const parts = [...css.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([, text]) => text.trim());
  if (!parts.length) return undefined;
  let text = parts.map(([id, body]) => (minify ? body : `/* ${id} */\n${body}`)).join("\n");
  if (minify) text = esbuild.transformSync(text, { loader: "css", minify: true, legalComments: "none" }).code;
  const name = dev ? "_sinth/lib.css" : `_sinth/lib-${crypto.createHash("sha256").update(text).digest("hex").slice(0, 8).toUpperCase()}.css`;
  files.set(name, { path: path.join(outDir, name), contents: Buffer.from(text) });
  return name;
}

function sinthPlugin(project: Project, entries: Map<string, string>, injectCss = false, libraryCss?: LibraryCss): esbuild.Plugin {
  const cssFiles = new Map<string, string>();
  return {
    name: "sinth",
    setup(b) {
      // url("/img.png") in a style points at public/ and is served as is; data: and remote URLs too.
      b.onResolve({ filter: /^(\/|data:|https?:)/ }, a => (a.kind === "url-token" ? { path: a.path, external: true } : undefined));
      b.onResolve({ filter: /^sinth-(runtime|router)$/ }, a => ({ path: a.path, namespace: "sinth-builtin" }));
      b.onLoad({ filter: /.*/, namespace: "sinth-builtin" }, a => {
        const file = a.path === "sinth-router" ? ROUTER_PATH : RUNTIME_PATH;
        return { contents: fs.readFileSync(file, "utf-8"), loader: "js", resolveDir: path.dirname(file) };
      });
      b.onResolve({ filter: /^sinth-entry:/ }, a => ({ path: a.path.slice("sinth-entry:".length), namespace: "sinth-entry" }));
      b.onLoad({ filter: /.*/, namespace: "sinth-entry" }, a => ({ contents: entries.get(a.path) ?? "", loader: "js", resolveDir: project.root }));
      b.onResolve({ filter: /^sinth-css:/ }, a => {
        const file = a.path.slice("sinth-css:".length);
        const id = cssModuleId(project, file);
        cssFiles.set(id, file);
        return { path: id, namespace: "sinth-css" };
      });
      b.onLoad({ filter: /.*/, namespace: "sinth-css" }, a => {
        const file = cssFiles.get(a.path) ?? path.resolve(project.root, a.path);
        if (!injectCss && libraryCss && isLibraryModule(a.path)) {
          libraryCss.set(a.path, project.compile(file).css);
          return { contents: `/* ${a.path} */`, loader: "css", resolveDir: path.dirname(file) };
        }
        return injectCss
          ? { contents: `import { injectCss } from "sinth-runtime";\ninjectCss(${JSON.stringify("sinth-css-" + a.path.replace(/[^\w-]+/g, "-"))}, ${JSON.stringify(project.compile(file).css)});`, loader: "js", resolveDir: path.dirname(file) }
          : { contents: project.compile(file).css, loader: "css", resolveDir: path.dirname(file) };
      });
      if (injectCss) {
        b.onLoad({ filter: /\.css$/ }, a => ({
          contents: `import { injectCss } from "sinth-runtime";\ninjectCss(${JSON.stringify("sinth-css-" + path.basename(a.path))}, ${JSON.stringify(fs.readFileSync(a.path, "utf-8"))});`,
          loader: "js",
        }));
      }
      b.onLoad({ filter: /\.sinth$/, namespace: "file" }, a => ({ contents: project.compile(a.path).js, loader: "js", resolveDir: path.dirname(a.path) }));
      // .sinth files outside the project (built-in libraries, linked packages) get a short id too.
      b.onResolve({ filter: /\.sinth$/ }, a => {
        if (a.namespace !== "file" && a.namespace !== "sinth-entry" && a.namespace !== "sinth-module") return undefined;
        const file = path.isAbsolute(a.path) ? a.path : path.resolve(a.resolveDir, a.path);
        const id = cssModuleId(project, file);
        if (!id.startsWith("node_modules/") && !id.startsWith("external/")) return undefined;
        cssFiles.set(id, file);
        return { path: id, namespace: "sinth-module" };
      });
      b.onLoad({ filter: /.*/, namespace: "sinth-module" }, a => {
        const file = cssFiles.get(a.path) as string;
        return { contents: project.compile(file).js, loader: "js", resolveDir: path.dirname(file) };
      });
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

/**
 * Bundles every component declared `as <tag-name>` into a standalone script per tag, plus
 * `elements/index.js` that registers all of them, for use in any HTML page.
 */
export async function buildCustomElements(project: Project): Promise<esbuild.OutputFile[]> {
  const entries = new Map<string, string>();
  const entryPoints: Record<string, string> = {};
  const all = new Set<string>();
  for (const file of findCustomElementFiles(project)) {
    const parsed = project.getFile(file);
    if (parsed.isPage) continue;
    project.compile(file);
    for (const c of parsed.components) {
      if (!c.customTag) continue;
      const key = "elements/" + c.customTag;
      entries.set(key, `import ${JSON.stringify(file)};`);
      entryPoints[key] = "sinth-entry:" + key;
      all.add(file);
    }
  }
  if (!entries.size) return [];
  if (!entries.has("elements/index")) {
    entries.set("elements/index", [...all].map(f => `import ${JSON.stringify(f)};`).join("\n"));
    entryPoints["elements/index"] = "sinth-entry:elements/index";
  }
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
  if (missing && /\.(css|s[ac]ss)$|\.sinth$/.test(loc?.file ?? "") && /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm)$/i.test(missing[1])) {
    hint = `Put '${missing[1].replace(/^\.?\//, "")}' in public/ and reference it from the site root, like url("/${missing[1].replace(/^\.?\//, "")}")`;
  } else if (missing && !missing[1].startsWith(".") && !missing[1].startsWith("/")) {
    const name = missing[1].startsWith("@") ? missing[1].split("/").slice(0, 2).join("/") : missing[1].split("/")[0];
    if (/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/.test(name)) hint = `Install it with: npm install ${name}`;
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
  if (entries.length && !entries.includes("_sinth") && !builtBySinth(dir, entries)) {
    throw new SinthError("E0801", `Refusing to clear '${dir}': it is not empty and was not created by Sinth`, undefined, "Delete it yourself or set a different \"outDir\" in sinth.config.json");
  }
  for (const e of entries) fs.rmSync(path.join(dir, e), { recursive: true, force: true });
}

const JUNK_FILES = new Set([".ds_store", "thumbs.db", "desktop.ini", ".git", ".gitkeep", ".svn"]);

/** Pages carry `<meta name="generator" content="Sinth">`, so a fully static build is still recognized. */
function builtBySinth(dir: string, entries: string[]): boolean {
  return entries.filter(e => e.endsWith(".html")).slice(0, 5).some(e => {
    try {
      return /<meta name="generator" content="Sinth/.test(fs.readFileSync(path.join(dir, e), "utf-8").slice(0, 4096));
    } catch {
      return false;
    }
  });
}

function copyDir(src: string, dest: string, files: Map<string, OutputFile>, outDir: string): void {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (JUNK_FILES.has(entry.name.toLowerCase())) continue;
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
  if (!pages.length && !findCustomElementFiles(project).length) {
    const rel = (p: string): string => path.relative(project.root, p).split(path.sep).join("/");
    const pagesRel = rel(cfg.pagesDir) || "pages";
    const where = rel(cfg.srcDir) ? rel(cfg.srcDir) + "/" : "the project root";
    throw new SinthError("E0802", fs.existsSync(cfg.pagesDir) ? `No pages found in ${pagesRel}` : `No pages found (no ${pagesRel}/ folder, and no .sinth file with markup in ${where})`, undefined, fs.existsSync(cfg.pagesDir)
      ? `Every .sinth file in this folder is a page (files starting with '_' are skipped). Add markup to ${pagesRel}/index.sinth, for example: Main { Heading { "Hello" } }`
      : `Create ${pagesRel}/index.sinth with some markup, for example: Main { Heading { "Hello" } }`);
  }
  const compiled = pages.map(p => project.compilePage(p));
  const entries = new Map<string, string>();
  const entryPoints: Record<string, string> = {};
  for (const c of compiled) {
    const key = entryKey(c.page);
    const lines: string[] = [];
    for (const s of c.styleImports) lines.push(`import ${JSON.stringify(s)};`);
    if (cfg.router) lines.push(`import "sinth-router";`);
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

  const libraryCss: LibraryCss = new Map();
  let result: Pick<esbuild.BuildResult<{ metafile: true; write: false }>, "outputFiles" | "metafile" | "warnings"> = { outputFiles: [], metafile: { inputs: {}, outputs: {} }, warnings: [] };
  if (compiled.length) try {
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
      plugins: [sinthPlugin(project, entries, false, libraryCss)],
      absWorkingDir: project.root,
    });
  } catch (err) {
    throw esbuildErrorToSinth(err, project);
  }

  const files = new Map<string, OutputFile>();
  for (const f of result.outputFiles) {
    files.set(path.relative(cfg.outDir, f.path).replace(/\\/g, "/"), { path: f.path, contents: f.contents });
  }
  const sharedCss = writeLibraryCss(libraryCss, cfg.outDir, project.dev, cfg.minify, files);

  const csp = contentSecurityPolicy(compiled, cfg.security.csp);
  const pageOutputs: PageOutput[] = [];
  const summaries: { route: string; title?: string; description?: string }[] = [];
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
    const styles: string[] = [];
    const inlineHead: string[] = [];
    if (c.fonts.length) {
      inlineHead.push('<link rel="preconnect" href="https://fonts.googleapis.com">', '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
      for (const f of c.fonts) styles.push(fontHref(f));
    }
    styles.push(...c.externalStyles);
    const cssMeta = cssOut ? result.metafile.outputs[cssOut] : undefined;
    if (sharedCss && cssMeta && Object.keys(cssMeta.inputs).some(i => isLibraryModule(i.replace(/^sinth-css:/, "")))) styles.push(cfg.base + sharedCss);
    if (cssOut) {
      const rel = path.relative(cfg.outDir, path.resolve(project.root, cssOut)).replace(/\\/g, "/");
      const own = files.get(rel);
      // A page whose only styles come from libraries has nothing left in its own bundle.
      if (own && !Buffer.from(own.contents).toString("utf-8").replace(/\/\*[\s\S]*?\*\//g, "").trim()) files.delete(rel);
      else styles.push(toUrl(cssOut));
    }
    const scripts = c.externalScripts.map(s => ({ src: s.src, module: false, attrs: s.attrs }));
    const shipsJs = !!jsOut && (c.interactive || cfg.router);
    if (shipsJs && jsOut) scripts.push({ src: toUrl(jsOut), module: true, attrs: { "data-sinth-entry": true } });
    if (options.devClient) inlineHead.push(`<script type="module" src="${options.devClient}"></script>`);
    if (!shipsJs && jsOut) files.delete(path.relative(cfg.outDir, path.resolve(project.root, jsOut)).replace(/\\/g, "/"));
    for (const inst of c.instances) {
      const head = buildHead(inst.meta, v => project.resolveAsset(v, c.page.file));
      summaries.push({ route: inst.page.route, title: head.title, description: head.metaNames.find(([k]) => k === "description")?.[1] });
      const pageHead = inst.params && c.interactive
        ? [...inlineHead, '<script type="application/json" id="sinth-params">' + JSON.stringify(inst.params).replace(/</g, "\\u003c") + "</script>"]
        : inlineHead;
      const html = renderDocument(head, inst.prerendered, { styles, scripts, preloads: shipsJs ? preloads : [], inlineHead: pageHead });
      files.set(inst.page.outFile, { path: path.join(cfg.outDir, inst.page.outFile), contents: Buffer.from(html) });
      pageOutputs.push({
        page: inst.page, html, interactive: c.interactive, bytes: Buffer.byteLength(html),
        js: shipsJs && jsOut ? toUrl(jsOut) : undefined, css: cssOut ? toUrl(cssOut) : undefined,
      });
    }
  }

  for (const f of await buildCustomElements(project)) {
    files.set(path.relative(cfg.outDir, f.path).replace(/\\/g, "/"), { path: f.path, contents: f.contents });
  }
  if (!project.dev) {
    copyDir(cfg.publicDir, cfg.outDir, files, cfg.outDir);
    for (const d of cfg.staticDirs) copyDir(staticDirPath(cfg, d), path.join(cfg.outDir, d), files, cfg.outDir);
    if (readsHeadersFile(cfg.platform)) {
      // Sinth's rules come first; a _headers file from public/ is appended so both apply.
      const own = (cfg.security.headers ? headersFile(securityHeaders(csp), cfg.base) : "") + headerRulesFile(cfg.headers, cfg.base);
      const user = files.get("_headers");
      if (own.trim()) files.set("_headers", { path: path.join(cfg.outDir, "_headers"), contents: Buffer.from(own + (user ? "\n" + Buffer.from(user.contents).toString("utf-8") : "")) });
    }
    if (cfg.redirects.length) {
      if (cfg.platform === "github-pages") {
        for (const r of cfg.redirects) {
          if (isPattern(r.from)) continue;
          const rel = r.from.replace(/^\/+|\/+$/g, "");
          const target = r.to.startsWith("/") && !r.to.startsWith("//") ? cfg.base + r.to.slice(1) : r.to;
          const out = (rel ? rel + "/" : "") + "index.html";
          if (!files.has(out)) files.set(out, { path: path.join(cfg.outDir, out), contents: Buffer.from(redirectPage(target)) });
        }
      } else if (cfg.platform !== "vercel") {
        const user = files.get("_redirects");
        files.set("_redirects", { path: path.join(cfg.outDir, "_redirects"), contents: Buffer.from(redirectsFile(cfg.redirects, cfg.base) + (user ? Buffer.from(user.contents).toString("utf-8") : "")) });
      }
    }
    // GitHub Pages runs Jekyll by default, which drops folders starting with "_" such as _sinth/.
    if (cfg.platform === "github-pages" && !files.has(".nojekyll")) files.set(".nojekyll", { path: path.join(cfg.outDir, ".nojekyll"), contents: Buffer.alloc(0) });
    if (cfg.site) {
      const site = cfg.site.replace(/\/$/, "");
      const urls = pageOutputs.filter(p => !/(^|\/)404$/.test(p.page.route)).map(p => `  <url><loc>${escapeHtml(site + p.page.route)}</loc></url>`);
      files.set("sitemap.xml", { path: path.join(cfg.outDir, "sitemap.xml"), contents: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`) });
      if (!files.has("llms.txt")) files.set("llms.txt", { path: path.join(cfg.outDir, "llms.txt"), contents: Buffer.from(llmsTxt(site, summaries)) });
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
  const platformWarnings = project.dev ? [] : await writePlatformOutput(project, files, cfg.security.headers ? securityHeaders(csp) : {}, options.write);

  const bundlerWarnings: Diagnostic[] = result.warnings.map(w => ({
    severity: "warning",
    code: "W0800",
    message: w.text,
    loc: w.location?.file && !w.location.file.endsWith(".sinth") ? { file: path.resolve(project.root, w.location.file.replace(/^[a-z-]+:/, "")), line: w.location.line, col: w.location.column + 1 } : undefined,
  }));
  const warnings = dedupeWarnings([...compiled.flatMap(c => c.warnings), ...bundlerWarnings, ...platformWarnings]);
  return { pages: pageOutputs, files, warnings, durationMs: Date.now() - started };
}

/**
 * An llms.txt (https://llmstxt.org) index of the site for AI assistants and answer engines: the home
 * page's title and description, then one line per page.
 */
function llmsTxt(site: string, pages: { route: string; title?: string; description?: string }[]): string {
  const visible = pages.filter(p => !/(^|\/)404$/.test(p.route)).sort((a, b) => a.route.localeCompare(b.route));
  const home = visible.find(p => p.route === "/");
  const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();
  const lines = [`# ${oneLine(home?.title ?? new URL(site).hostname)}`, ""];
  if (home?.description) lines.push(`> ${oneLine(home.description)}`, "");
  lines.push("## Pages", "");
  for (const p of visible) lines.push(`- [${oneLine(p.title ?? p.route)}](${site}${p.route})${p.description ? ": " + oneLine(p.description) : ""}`);
  return lines.join("\n") + "\n";
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
  const pageFiles = new Set(pages.map(p => p.file));
  for (const p of pages) {
    try {
      warnings.push(...project.compilePage(p).warnings);
    } catch (err) {
      if (err instanceof SinthError) errors.push(err);
      else throw err;
    }
  }
  const skip = new Set(["node_modules", ".git", ".sinth", ".wrangler"]);
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name) && full !== project.config.outDir) walk(full);
      } else if (e.name.endsWith(".sinth") && !pageFiles.has(full)) {
        try {
          if (!project.getFile(full).isPage) warnings.push(...project.compile(full).diagnostics.warnings);
        } catch (err) {
          if (!(err instanceof SinthError)) throw err;
          if (!errors.some(x => x.message === err.message && x.loc?.file === err.loc?.file)) errors.push(err);
        }
      }
    }
  };
  walk(project.root);
  return { pages, warnings: dedupeWarnings(warnings), errors };
}
