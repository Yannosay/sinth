import { SinthFile } from "../compiler/ast";
import { collectExports, compileModule, ModuleOutput, ResolvedImport } from "../compiler/codegen";
import { Diagnostic, SinthError } from "../compiler/diagnostics";
import { buildHead, renderDocument } from "../compiler/html";
import { parseSinth } from "../compiler/parser";
import { prerenderPage, PrerenderHost } from "../compiler/prerender";

/**
 * Compiles a set of in-memory files without touching the file system or a bundler, for the
 * playground, editor previews and other hosts that run the compiler outside Node.js.
 * Paths are POSIX-style and absolute, e.g. "/pages/index.sinth".
 */

export interface CompileFilesOptions {
  /** Page to compile. Default: "/pages/index.sinth". */
  entry?: string;
  /** Sources for `sinth:` imports, e.g. { "sinth:ui": "<source of lib/ui/index.sinth>" }. */
  builtins?: Record<string, string>;
  /** Rewrites bare npm imports, e.g. to a CDN. Default: https://esm.sh/<name>. */
  resolvePackage?: (specifier: string) => string;
  dev?: boolean;
}

export interface CompiledModule {
  id: string;
  js: string;
  /** Module ids this module imports, in dependency order. */
  deps: string[];
}

export interface CompileFilesResult {
  /** Every Sinth module the page needs, dependencies before dependents. Imports use the module ids. */
  modules: CompiledModule[];
  entry: string;
  /** Combined CSS of the page, its components and imported stylesheets. */
  css: string;
  /** The prerendered document, as `sinth build` would write it (without scripts and styles). */
  html: string;
  /** External scripts and stylesheets the page imports by URL. */
  externalScripts: string[];
  externalStyles: string[];
  warnings: Diagnostic[];
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

function normalize(p: string): string {
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

const URL_SPEC = /^(https?:)?\/\//;

export function compileFiles(files: Record<string, string>, options: CompileFilesOptions = {}): CompileFilesResult {
  const entry = normalize(options.entry ?? "/pages/index.sinth");
  const builtins = options.builtins ?? {};
  const resolvePackage = options.resolvePackage ?? ((s: string) => `https://esm.sh/${s}`);
  const parsed = new Map<string, SinthFile>();
  const resolved = new Map<string, ResolvedImport[]>();
  const compiled = new Map<string, ModuleOutput>();
  const order: string[] = [];
  const styles: string[] = [];
  const externalScripts: string[] = [];
  const externalStyles: string[] = [];

  const read = (id: string): string | undefined => (id.startsWith("sinth:") ? builtins[id] : files[id]);

  const getFile = (id: string): SinthFile => {
    const cached = parsed.get(id);
    if (cached) return cached;
    const source = read(id);
    if (source === undefined) throw new SinthError("E0600", `File not found: ${id}`);
    const file = parseSinth(source, id);
    file.isPage = id === entry;
    parsed.set(id, file);
    return file;
  };

  const findFile = (base: string, exts: string[]): string | undefined =>
    [base, ...exts.map(e => base + e), ...exts.map(e => base + "/index" + e)].find(c => read(c) !== undefined);

  const resolveImports = (file: SinthFile): ResolvedImport[] => {
    const cached = resolved.get(file.path);
    if (cached) return cached;
    const out: ResolvedImport[] = [];
    for (const raw of file.imports) {
      let decl = raw;
      if (decl.kind === "library") decl = { ...decl, kind: "sinth", source: "sinth:ui", sideEffect: true };
      const source = decl.source;
      const local = source.startsWith("/") && !source.startsWith("//") ? normalize(source) : normalize(dirname(file.path) + "/" + source);
      const isLocal = source.startsWith(".") || (source.startsWith("/") && !source.startsWith("//"));
      const notFound = (): never => { throw new SinthError("E0601", `Cannot find '${source}'`, decl.loc); };
      const sinth = (id: string): ResolvedImport => {
        const other = getFile(id);
        if (other.isPage) throw new SinthError("E0608", `Cannot import page '${source}'; pages are entry points`, decl.loc);
        return { decl: { ...decl, kind: "sinth" }, kind: "sinth", specifier: id, exports: collectExports(other) };
      };
      if (source.startsWith("sinth:")) {
        if (builtins[source] === undefined) throw new SinthError("E0605", `Unknown built-in library '${source}'`, decl.loc);
        out.push(sinth(source));
        continue;
      }
      switch (decl.kind) {
        case "style": {
          if (URL_SPEC.test(source)) {
            externalStyles.push(source);
            out.push({ decl, kind: "style", specifier: source });
            break;
          }
          const id = findFile(local, [".css"]) ?? notFound();
          styles.push(read(id) ?? "");
          out.push({ decl, kind: "style", specifier: source });
          break;
        }
        case "font":
          out.push({ decl, kind: "font", specifier: source });
          break;
        case "json": {
          const id = findFile(local, []) ?? notFound();
          try {
            out.push({ decl, kind: "json", specifier: id, json: JSON.parse(read(id) ?? "") });
          } catch (err) {
            throw new SinthError("E0606", `Invalid JSON in '${source}': ${(err as Error).message}`, decl.loc);
          }
          break;
        }
        case "script":
          if (!URL_SPEC.test(source)) throw new SinthError("E0607", `Only URL scripts can be imported here: '${source}'`, decl.loc);
          externalScripts.push(source);
          out.push({ decl, kind: "script", specifier: source });
          break;
        default: {
          if (URL_SPEC.test(source)) {
            out.push({ decl: { ...decl, kind: "module" }, kind: "module", specifier: source });
            break;
          }
          if (isLocal) {
            const id = findFile(local, [".sinth"]);
            if (id?.endsWith(".sinth")) {
              out.push(sinth(id));
              break;
            }
            throw new SinthError("E0601", `Cannot find '${source}'`, decl.loc, "Only .sinth, .css and .json files can be imported here");
          }
          out.push({ decl: { ...decl, kind: "module" }, kind: "module", specifier: resolvePackage(source) });
        }
      }
    }
    resolved.set(file.path, out);
    return out;
  };

  const compile = (id: string, stack: string[]): ModuleOutput => {
    const cached = compiled.get(id);
    if (cached) return cached;
    if (stack.includes(id)) throw new SinthError("E0609", `Circular import: ${[...stack.slice(stack.indexOf(id)), id].join(" -> ")}`);
    const file = getFile(id);
    const imports = resolveImports(file);
    for (const imp of imports) if (imp.kind === "sinth") compile(imp.specifier, [...stack, id]);
    const out = compileModule(file, imports, { runtime: "sinth-runtime", dev: !!options.dev, persistPrefix: "sinth:" + id.replace(/^\//, "").replace(/\.sinth$/, "") });
    compiled.set(id, out);
    order.push(id);
    return out;
  };

  compile(entry, []);
  const host: PrerenderHost = { getFile, getImports: resolveImports };
  const pre = prerenderPage(getFile(entry), host);
  const head = buildHead(pre.meta.map(m => (m.known ? m : { ...m, known: true, value: undefined })), v => v);
  const modules = order.map(id => {
    const out = compiled.get(id) as ModuleOutput;
    const deps = resolveImports(getFile(id)).filter(i => i.kind === "sinth").map(i => i.specifier);
    return { id, js: out.js.replace(/^import "sinth-css:[^"]*";\n/gm, ""), deps };
  });
  const css = [...styles, ...order.map(id => compiled.get(id)?.css ?? "").filter(Boolean)].join("\n\n");
  const warnings = order.flatMap(id => compiled.get(id)?.diagnostics.warnings ?? []);
  return {
    modules, entry, css, externalScripts, externalStyles, warnings,
    html: renderDocument(head, pre.html, { styles: [], scripts: [], preloads: [], inlineHead: [] }),
  };
}
