import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import { ImportDecl, SinthFile } from "../compiler/ast";
import { compileModule, collectExports, ModuleExports, ModuleOutput, ResolvedImport } from "../compiler/codegen";
import { Diagnostic, SinthError, suggest } from "../compiler/diagnostics";
import { evaluatePaths, prerenderPage, PrerenderHost } from "../compiler/prerender";
import { MetaValue } from "../compiler/html";
import { parseSinth } from "../compiler/parser";
import { ScssCompiler } from "../compiler/style";
import { SinthConfig } from "./config";

export const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
export const RUNTIME_PATH = path.join(PACKAGE_ROOT, "dist", "runtime", "index.js");
export const LIB_ROOT = path.join(PACKAGE_ROOT, "lib");

const LEGACY_LIBRARIES: Record<string, string> = { SinthUI: "sinth:ui" };
const IGNORED_DIRS = new Set(["node_modules", ".git", ".sinth", ".wrangler", ".vscode", ".idea"]);
const ROOT_MODULE_DIRS = new Set(["components", "libraries", "lib", "styles", "assets", "public"]);

export interface PageInfo {
  file: string;
  route: string;
  outFile: string;
}

export interface PageInstance {
  page: PageInfo;
  prerendered: string;
  meta: MetaValue[];
  params?: Record<string, string>;
}

export interface CompiledPage {
  page: PageInfo;
  module: ModuleOutput;
  graph: string[];
  interactive: boolean;
  /** One entry per generated HTML file. Static routes have exactly one; dynamic routes one per `paths` item. */
  instances: PageInstance[];
  styleImports: string[];
  externalStyles: string[];
  externalScripts: { src: string; attrs: Record<string, string | boolean> }[];
  fonts: string[];
  warnings: Diagnostic[];
}

export class Project {
  private readonly parsed = new Map<string, { mtime: number; file: SinthFile }>();
  private compiled = new Map<string, ModuleOutput>();
  private readonly resolved = new Map<string, ResolvedImport[]>();
  private scssCompiler: ScssCompiler | undefined | null = null;

  constructor(readonly root: string, readonly config: SinthConfig, readonly dev: boolean) {}

  invalidate(): void {
    this.compiled = new Map();
    this.resolved.clear();
  }

  getFile(file: string): SinthFile {
    const abs = path.resolve(file);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      throw new SinthError("E0600", `File not found: ${path.relative(this.root, abs) || abs}`);
    }
    const cached = this.parsed.get(abs);
    if (cached && cached.mtime === stat.mtimeMs) return cached.file;
    const source = fs.readFileSync(abs, "utf-8");
    const parsed = parseSinth(source, abs);
    parsed.isPage = this.isPageFile(abs, parsed);
    if (parsed.isPage) {
      const rel = relativeInside(this.pagesBase(), abs);
      const params = rel ? routeParams(rel) : [];
      if (params.length) parsed.params = params;
    }
    this.parsed.set(abs, { mtime: stat.mtimeMs, file: parsed });
    return parsed;
  }

  /**
   * A file is a page when it lives in the pages folder (or, without one, in the project root),
   * is not hidden behind a leading underscore, and is not a pure component module.
   */
  private isPageFile(abs: string, parsed: SinthFile): boolean {
    const pagesDir = this.config.pagesDir;
    const hasPagesDir = fs.existsSync(pagesDir);
    const base = hasPagesDir ? pagesDir : this.root;
    const rel = relativeInside(base, abs);
    if (!rel) return false;
    const parts = rel.split(/[\\/]/);
    if (parts.some(p => p.startsWith("_") || p.startsWith(".") || IGNORED_DIRS.has(p))) return false;
    if (relativeInside(this.config.outDir, abs)) return false;
    if (!hasPagesDir && parts.length > 1 && ROOT_MODULE_DIRS.has(parts[0])) return false;
    const hasPageContent = parsed.body.length > 0 || parsed.meta.length > 0;
    if (hasPageContent) return true;
    const isModule = parsed.components.length > 0 || parsed.functions.length > 0;
    return hasPagesDir && !isModule;
  }

  scss(): ScssCompiler | undefined {
    if (this.scssCompiler !== null) return this.scssCompiler;
    const loaders = [createRequire(path.join(this.root, "package.json")), createRequire(__filename)];
    for (const load of loaders) {
      try {
        const sass = load("sass") as { compileString(src: string, opts: { loadPaths: string[]; style: string }): { css: string } };
        this.scssCompiler = (src: string, file: string): string => {
          try {
            return sass.compileString(src, { loadPaths: [path.dirname(file), this.root], style: "expanded" }).css;
          } catch (err) {
            throw new SinthError("E0402", `SCSS error: ${(err as Error).message.split("\n")[0]}`, { file, line: 1, col: 1 });
          }
        };
        return this.scssCompiler;
      } catch {
        continue;
      }
    }
    this.scssCompiler = undefined;
    return undefined;
  }

  findPages(): PageInfo[] {
    const pagesDir = this.config.pagesDir;
    const base = fs.existsSync(pagesDir) ? pagesDir : this.root;
    const out: PageInfo[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".") || full === this.config.outDir) continue;
          if (base === this.root && ROOT_MODULE_DIRS.has(entry.name)) continue;
          walk(full);
        } else if (entry.name.endsWith(".sinth") && !entry.name.startsWith("_")) {
          if (!this.getFile(full).isPage) continue;
          out.push(this.pageInfo(full, base));
        }
      }
    };
    walk(base);
    return out.sort((a, b) => a.route.localeCompare(b.route));
  }

  private pagesBase(): string {
    return fs.existsSync(this.config.pagesDir) ? this.config.pagesDir : this.root;
  }

  pageInfo(file: string, base = this.pagesBase()): PageInfo {
    const rel = path.relative(base, file).replace(/\\/g, "/").replace(/\.sinth$/, "");
    const outRel = rel + ".html";
    const route = "/" + (rel === "index" ? "" : rel.endsWith("/index") ? rel.slice(0, -6) : rel);
    return { file: path.resolve(file), route, outFile: outRel };
  }

  private resolveFile(candidate: string, exts: string[]): string | undefined {
    const tries = [candidate, ...exts.map(e => candidate + e), ...exts.map(e => path.join(candidate, "index" + e))];
    for (const t of tries) {
      try {
        if (fs.statSync(t).isFile()) return t;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  private resolveBare(spec: string, from: string): { kind: "sinth" | "module"; path: string } | undefined {
    for (const lib of this.config.libraryPaths) {
      const sinth = this.resolveFile(path.join(lib, spec), [".sinth"]);
      if (sinth) return { kind: "sinth", path: sinth };
      const js = this.resolveFile(path.join(lib, spec), [".js", ".mjs", ".ts"]);
      if (js) return { kind: "module", path: js };
    }
    const parts = spec.split("/");
    const pkgName = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    const sub = spec.slice(pkgName.length + 1);
    for (let dir = path.dirname(from); ; dir = path.dirname(dir)) {
      const pkgDir = path.join(dir, "node_modules", pkgName);
      const pkgJson = path.join(pkgDir, "package.json");
      if (fs.existsSync(pkgJson)) {
        if (sub.endsWith(".sinth")) return { kind: "sinth", path: path.join(pkgDir, sub) };
        try {
          const meta = JSON.parse(fs.readFileSync(pkgJson, "utf-8")) as { sinth?: string };
          if (!sub && typeof meta.sinth === "string") return { kind: "sinth", path: path.join(pkgDir, meta.sinth) };
          if (sub) {
            const sinth = this.resolveFile(path.join(pkgDir, sub), [".sinth"]);
            if (sinth) return { kind: "sinth", path: sinth };
          }
        } catch {
          return undefined;
        }
        return undefined;
      }
      if (path.dirname(dir) === dir) return undefined;
    }
  }

  resolveImports(file: SinthFile): ResolvedImport[] {
    const cached = this.resolved.get(file.path);
    if (cached) return cached;
    const out: ResolvedImport[] = [];
    for (const decl of file.imports) out.push(this.resolveImport(decl, file));
    this.resolved.set(file.path, out);
    return out;
  }

  private notFound(decl: ImportDecl, tried?: string): never {
    throw new SinthError("E0601", `Cannot find '${decl.source}'`, decl.loc, tried ? `Looked for ${path.relative(this.root, tried) || tried}` : undefined);
  }

  private resolveImport(decl: ImportDecl, file: SinthFile): ResolvedImport {
    const from = file.path;
    let source = decl.source;
    if (decl.kind === "library") {
      const mapped = LEGACY_LIBRARIES[source];
      if (!mapped) {
        const s = suggest(source, Object.keys(LEGACY_LIBRARIES));
        throw new SinthError("E0605", `Unknown library '${source}'`, decl.loc, s ? `Did you mean '${s}'?` : "Import files with a path, e.g. import \"./components/Card.sinth\"");
      }
      source = mapped;
      decl = { ...decl, kind: "sinth", source, sideEffect: true };
    }
    if (source.startsWith("sinth:")) {
      const name = source.slice(6);
      const target = this.resolveFile(path.join(LIB_ROOT, name), [".sinth"]);
      if (!target) {
        const available = fs.existsSync(LIB_ROOT) ? fs.readdirSync(LIB_ROOT) : [];
        throw new SinthError("E0605", `Unknown built-in library '${source}'`, decl.loc, available.length ? `Available: ${available.map(a => "sinth:" + a).join(", ")}` : undefined);
      }
      return this.sinthImport({ ...decl, kind: "sinth" }, target);
    }
    const isRelative = source.startsWith("./") || source.startsWith("../");
    const isRootAbs = source.startsWith("/") && !source.startsWith("//");
    const isUrl = /^(https?:)?\/\//.test(source);
    const localBase = isRootAbs ? path.join(this.root, source) : path.resolve(path.dirname(from), source);

    switch (decl.kind) {
      case "style": {
        if (isUrl) return { decl, kind: "style", specifier: source };
        if (isRelative || isRootAbs) {
          const target = this.resolveFile(localBase, [".css", ".scss", ".sass"]);
          if (!target) this.notFound(decl, localBase);
          return { decl, kind: "style", specifier: target };
        }
        return { decl, kind: "style", specifier: source };
      }
      case "font":
        return { decl, kind: "font", specifier: source };
      case "json": {
        const target = this.resolveFile(localBase, []);
        if (!target) this.notFound(decl, localBase);
        try {
          return { decl, kind: "json", specifier: target, json: JSON.parse(fs.readFileSync(target, "utf-8")) };
        } catch (err) {
          throw new SinthError("E0606", `Invalid JSON in '${source}': ${(err as Error).message}`, decl.loc);
        }
      }
      case "script": {
        if (isUrl) return { decl, kind: "script", specifier: source };
        const target = this.resolveFile(localBase, [".js", ".mjs", ".ts"]);
        if (!target) this.notFound(decl, localBase);
        return { decl: { ...decl, kind: "module" }, kind: "module", specifier: target };
      }
      case "sinth": {
        if (isRelative || isRootAbs) {
          const target = this.resolveFile(localBase, [".sinth"]);
          if (!target) {
            const js = this.resolveFile(localBase, [".js", ".mjs", ".ts", ".tsx", ".jsx"]);
            if (js) return { decl: { ...decl, kind: "module" }, kind: "module", specifier: js };
            this.notFound(decl, localBase + (localBase.endsWith(".sinth") ? "" : ".sinth"));
          }
          return this.sinthImport(decl, target);
        }
        const bare = this.resolveBare(source, from);
        if (bare?.kind === "sinth") return this.sinthImport(decl, bare.path);
        if (bare) return { decl: { ...decl, kind: "module" }, kind: "module", specifier: bare.path };
        throw new SinthError("E0601", `Cannot find Sinth module '${source}'`, decl.loc);
      }
      case "module": {
        if (isUrl) return { decl, kind: "script", specifier: source };
        if (isRelative || isRootAbs) {
          const target = this.resolveFile(localBase, [".js", ".mjs", ".ts", ".tsx", ".jsx"]);
          if (!target) {
            const sinth = this.resolveFile(localBase, [".sinth"]);
            if (sinth) return this.sinthImport({ ...decl, kind: "sinth" }, sinth);
            this.notFound(decl, localBase);
          }
          return { decl, kind: "module", specifier: target };
        }
        const bare = this.resolveBare(source, from);
        if (bare?.kind === "sinth") return this.sinthImport({ ...decl, kind: "sinth" }, bare.path);
        if (bare) return { decl, kind: "module", specifier: bare.path };
        if (LEGACY_LIBRARIES[source]) return this.resolveImport({ ...decl, kind: "library" }, file);
        return { decl, kind: "module", specifier: source };
      }
      default:
        throw new SinthError("E0607", `Unsupported import '${source}'`, decl.loc);
    }
  }

  private sinthImport(decl: ImportDecl, target: string): ResolvedImport {
    const other = this.getFile(target);
    if (other.isPage) throw new SinthError("E0608", `Cannot import page '${decl.source}'; pages are entry points`, decl.loc, "Pages are entry points. Move shared components to components/ (or a file starting with '_') and import that");
    const exports: ModuleExports = collectExports(other);
    return { decl: { ...decl, kind: "sinth" }, kind: "sinth", specifier: target, exports };
  }

  persistPrefix(file: string): string {
    return "sinth:" + path.relative(this.root, file).replace(/\\/g, "/").replace(/\.sinth$/, "");
  }

  compile(file: string, stack: string[] = []): ModuleOutput {
    const abs = path.resolve(file);
    const cached = this.compiled.get(abs);
    if (cached) return cached;
    if (stack.includes(abs)) {
      const cycle = [...stack.slice(stack.indexOf(abs)), abs].map(p => path.relative(this.root, p)).join(" -> ");
      throw new SinthError("E0609", `Circular import: ${cycle}`);
    }
    const parsed = this.getFile(abs);
    const imports = this.resolveImports(parsed);
    for (const imp of imports) if (imp.kind === "sinth") this.compile(imp.specifier, [...stack, abs]);
    const out = compileModule(parsed, imports, {
      runtime: "sinth-runtime",
      dev: this.dev,
      scss: this.hasScss(parsed) ? this.scss() : undefined,
      persistPrefix: this.persistPrefix(abs),
    });
    this.compiled.set(abs, out);
    return out;
  }

  private hasScss(file: SinthFile): boolean {
    return file.styles.some(s => s.lang === "scss") || file.components.some(c => c.styles.some(s => s.lang === "scss"));
  }

  moduleGraph(entry: string): string[] {
    const seen = new Set<string>();
    const order: string[] = [];
    const visit = (f: string): void => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const imp of this.resolveImports(this.getFile(f))) if (imp.kind === "sinth") visit(imp.specifier);
      order.push(f);
    };
    visit(path.resolve(entry));
    return order;
  }

  compilePage(page: PageInfo): CompiledPage {
    const module = this.compile(page.file);
    const graph = this.moduleGraph(page.file);
    let interactive = this.needsRuntime(page.file);
    const styleImports: string[] = [];
    const externalStyles: string[] = [];
    const externalScripts: CompiledPage["externalScripts"] = [];
    const fonts: string[] = [];
    const warnings: Diagnostic[] = [];
    for (const f of graph) {
      const out = this.compile(f);
      warnings.push(...out.diagnostics.warnings);
      for (const imp of this.resolveImports(this.getFile(f))) {
        if (imp.kind === "style") (/^(https?:)?\/\//.test(imp.specifier) ? externalStyles : styleImports).push(imp.specifier);
        if (imp.kind === "script") externalScripts.push({ src: imp.specifier, attrs: imp.decl.attrs });
        if (imp.kind === "font") fonts.push(imp.specifier);
      }
    }
    const host: PrerenderHost = { getFile: f => this.getFile(f), getImports: f => this.resolveImports(f) };
    const file = this.getFile(page.file);
    const instances: PageInstance[] = [];
    for (const params of this.expandParams(page, file, host)) {
      const pre = prerenderPage(file, host, params);
      if (!pre.complete) interactive = true;
      const inst: PageInstance = { page: params ? fillRoute(page, params) : page, prerendered: pre.html, meta: pre.meta, params };
      for (const m of inst.meta) {
        if (!m.known) throw new SinthError("E0700", `Metadata '${m.key}' must be computable at build time`, m.loc, "Use literals, imported JSON, constants and route params. Values that need the browser (fetch, localStorage, user input) can't go in the page head");
      }
      instances.push(inst);
    }
    return {
      page, module, graph, interactive, instances, styleImports: unique(styleImports),
      externalStyles: unique(externalStyles), externalScripts, fonts: unique(fonts), warnings,
    };
  }

  private expandParams(page: PageInfo, file: SinthFile, host: PrerenderHost): (Record<string, string> | undefined)[] {
    const names = file.params;
    const pathsMeta = file.meta.find(m => m.key === "paths");
    if (!names?.length) {
      if (pathsMeta) throw new SinthError("E0713", "'paths' is only used by dynamic routes", pathsMeta.loc, "Name the file with a [param] segment, e.g. pages/blog/[slug].sinth");
      return [undefined];
    }
    const where = path.relative(this.root, page.file).replace(/\\/g, "/");
    if (!pathsMeta) {
      throw new SinthError("E0710", `Dynamic route '${where}' needs 'paths'`, { file: page.file, line: 1, col: 1 },
        names.length === 1 ? `List the values to generate, e.g. paths = posts.map((p) => p.${names[0]})` : `List objects with ${names.join(", ")}, e.g. paths = [{ ${names.map(n => n + ": \"...\"").join(", ")} }]`);
    }
    const res = evaluatePaths(file, host, names);
    if (!res.known || !Array.isArray(res.value)) {
      throw new SinthError("E0711", "'paths' must be an array that can be computed at build time", pathsMeta.loc, "Build it from literals, imported JSON or constants");
    }
    const seen = new Set<string>();
    return res.value.map((item, i) => {
      const params: Record<string, string> = {};
      for (const n of names) {
        const raw = typeof item === "object" && item !== null ? (item as Record<string, unknown>)[n] : names.length === 1 ? item : undefined;
        if (typeof raw !== "string" && typeof raw !== "number") {
          throw new SinthError("E0712", `paths[${i}] has no string value for '${n}'`, pathsMeta.loc, names.length === 1 ? "Use strings, or objects with that key" : `Each item needs ${names.join(", ")}`);
        }
        const v = String(raw);
        // eslint-disable-next-line no-control-regex
        if (!v || v === "." || v === ".." || /[\\/?#\u0000-\u001f]/.test(v)) {
          throw new SinthError("E0712", `paths[${i}].${n} is not a valid URL segment: ${JSON.stringify(v)}`, pathsMeta.loc, "Values can't be empty or contain / \\ ? #");
        }
        params[n] = v;
      }
      const key = JSON.stringify(names.map(n => params[n]));
      if (seen.has(key)) throw new SinthError("E0712", `paths contains a duplicate: ${JSON.stringify(params)}`, pathsMeta.loc);
      seen.add(key);
      return params;
    });
  }

  private needsRuntime(pageFile: string): boolean {
    const seen = new Set<string>();
    const visit = (file: string, component?: string): boolean => {
      const key = file + "#" + (component ?? "");
      if (seen.has(key)) return false;
      seen.add(key);
      const out = this.compile(file);
      if (out.base) return true;
      const info = component ? out.components[component] : out.page;
      if (!info) return true;
      if (info.interactive) return true;
      return info.uses.some(ref => {
        const i = ref.lastIndexOf("#");
        return visit(ref.slice(0, i), ref.slice(i + 1));
      });
    };
    return visit(path.resolve(pageFile));
  }

  resolveAsset(value: string, fromFile: string): string {
    if (/^([a-z]+:|\/\/|#|data:)/i.test(value) || value.startsWith("/")) return value;
    const candidates = [path.resolve(path.dirname(fromFile), value), path.resolve(this.root, value)];
    for (const c of candidates) {
      if (!fs.existsSync(c)) continue;
      if (c.startsWith(this.config.publicDir + path.sep)) return this.config.base + path.relative(this.config.publicDir, c).replace(/\\/g, "/");
      for (const d of this.config.staticDirs) {
        const dir = path.resolve(this.root, d);
        if (c.startsWith(dir + path.sep)) return this.config.base + path.relative(this.root, c).replace(/\\/g, "/");
      }
    }
    return this.config.base + value.replace(/^\.\//, "");
  }
}

/**
 * Path of `file` relative to `dir`, or undefined when it is outside. Falls back to real paths,
 * because bundlers resolve symlinks (macOS /var -> /private/var, junctions, linked workspaces).
 */
function relativeInside(dir: string, file: string): string | undefined {
  const check = (d: string, f: string): string | undefined => {
    const rel = path.relative(d, f);
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : undefined;
  };
  const direct = check(dir, file);
  if (direct) return direct;
  try {
    return check(fs.realpathSync.native(dir), fs.realpathSync.native(file));
  } catch {
    return undefined;
  }
}

export function routeParams(rel: string): string[] {
  const names: string[] = [];
  const shown = rel.replace(/\\/g, "/");
  for (const m of rel.replace(/\.sinth$/, "").matchAll(/\[([^\]]*)\]/g)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(m[1])) throw new SinthError("E0714", `Invalid route parameter '[${m[1]}]' in ${shown}`, undefined, "Use a plain name like [slug] or [id]");
    if (names.includes(m[1])) throw new SinthError("E0714", `Route parameter '${m[1]}' is used twice in ${shown}`);
    names.push(m[1]);
  }
  return names;
}

function fillRoute(page: PageInfo, params: Record<string, string>): PageInfo {
  const fill = (s: string, enc: (v: string) => string): string => s.replace(/\[([A-Za-z_][A-Za-z0-9_]*)\]/g, (_, n: string) => enc(params[n]));
  return { file: page.file, route: fill(page.route, encodeURIComponent), outFile: fill(page.outFile, v => v) };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function fontHref(spec: string): string {
  const [family, weights] = spec.split(":");
  const fam = family.trim().replace(/\s+/g, "+");
  const w = (weights ?? "400;700").split(/[;,]/).map(s => s.trim()).filter(s => /^\d{3}$/.test(s)).sort();
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%2B/g, "+")}:wght@${w.join(";")}&display=swap`;
}
