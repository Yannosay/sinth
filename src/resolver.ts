import * as fs from "fs";
import * as path from "path";
import { SinthFile, CompDef, CustomElInfo, SinthError, SinthWarning } from "./core/types";
import { Lexer } from "./core/lexer";
import { Parser } from "./core/parser";
import { BUILTIN_MAP } from "./core/builtins";
import { resolveBuiltinImport } from "./builtins";



export interface ResolverConfig { projectRoot: string; libraryPaths: string[] }

export interface ResolvedImports {
  allDefs:   Map<string, CompDef>;
  customEls: Map<string, CustomElInfo>;
  cssLinks:  string[];
  jsLinks:   { src: string; attrs: Record<string, string> }[];
  builtinCss: { name: string; content: string }[];
}

export const IMPORT_STACK: string[] = [];

export function parseFile(filePath: string): SinthFile {
  if (!fs.existsSync(filePath)) throw new SinthError(`File not found: ${filePath}`);
  const src     = fs.readFileSync(filePath, "utf-8");
  const srcLines = src.split("\n");
  try {
    const tokens = new Lexer(src, filePath).tokenize();
    return new Parser(tokens, filePath).parse();
  } catch (e) {
    if (e instanceof SinthError) throw e.withSource(srcLines);
    throw e;
  }
}

export function resolveImports(
  file:    SinthFile,
  cfg:     ResolverConfig,
  visited: Set<string> = new Set(),
): ResolvedImports {
  const allDefs   = new Map<string, CompDef>();
  const customEls = new Map<string, CustomElInfo>();
  const cssLinks: string[] = [];
  const jsLinks:  { src: string; attrs: Record<string, string> }[] = [];
  const builtinCss: { name: string; content: string }[] = [];

  for (const def of file.defs) {
    if (BUILTIN_MAP[def.name]) {
      throw new SinthError(`'${def.name}' is a built-in Sinth component and cannot be redefined.`, def.loc);
    }
    if (allDefs.has(def.name)) throw new SinthError(`Duplicate component definition '${def.name}'`, def.loc);
    allDefs.set(def.name, def);
  }

  for (const el of file.customEls) {
    customEls.set(el.sinthName, { tagName: el.tagName, params: el.params });
  }

  if (!file.isPage && file.meta.length > 0) {
    for (const m of file.meta) {
      SinthWarning.emit(`Metadata '${m.key}' in component file '${file.filePath}' has no effect.`, m.loc);
    }
  }

  const importBuiltinNames = Object.keys(require("./builtins").BUILTIN_REGISTRY);

  for (const imp of file.imports) {
    if (imp.kind === "builtin") {
      const builtinImport = resolveBuiltinImport(imp.name);
      if (builtinImport) {
        if (builtinImport.css && !builtinCss.some(b => b.name === imp.name)) {
          builtinCss.push({ name: imp.name, content: builtinImport.css });
        }
        continue;
      }
      const suggestions = importBuiltinNames
        .map(name => ({ name, distance: levenshtein(imp.name.toLowerCase(), name.toLowerCase()) }))
        .filter(s => s.distance <= Math.max(3, Math.floor(nameLength(imp.name) / 2)))
        .sort((a, b) => a.distance - b.distance)
        .map(s => s.name);

      throw new SinthError(
        `Unknown built-in import '${imp.name}'.` +
        (suggestions.length > 0 ? ` Did you mean '${suggestions[0]}'?` : ""),
        imp.loc
      );
    }
    if (imp.kind === "css") {
      const r = resolveRelative(imp.path, file.filePath);
      if (!cssLinks.includes(r)) cssLinks.push(r);
      continue;
    }

    if (imp.kind === "js") {
      const builtinImport = resolveBuiltinImport(imp.name);
      if (builtinImport) {
        if (builtinImport.css && !builtinCss.some(b => b.name === imp.name)) {
          builtinCss.push({ name: imp.name, content: builtinImport.css });
        }
        continue;
      }
      const src = resolveLibrary(imp.name, cfg);
      if (src.startsWith("/libraries/") && !fs.existsSync(src)) {
        throw new SinthError(`Cannot resolve JS import '${imp.name}'. No such file in library paths.`, imp.loc);
      }
      jsLinks.push({ src, attrs: {} });

      for (const libDir of cfg.libraryPaths) {
        const companion = path.join(libDir, imp.name + ".sinth");
        if (fs.existsSync(companion) && !visited.has(companion)) {
          visited.add(companion);
          IMPORT_STACK.push(companion);
          const sub = resolveImports(parseFile(companion), cfg, visited);
          IMPORT_STACK.pop();
          for (const [n, d] of sub.allDefs)   allDefs.set(n, d);
          for (const [n, e] of sub.customEls) customEls.set(n, e);
          for (const b of sub.builtinCss) if (!builtinCss.some(x => x.name === b.name)) builtinCss.push(b);
        }
      }
      continue;
    }

    const builtinImport = resolveBuiltinImport(imp.path);
    if (builtinImport) {
      if (builtinImport.css && !builtinCss.some(b => b.name === imp.path)) {
        builtinCss.push({ name: imp.path, content: builtinImport.css });
      }
      continue;
    }

    throw new SinthError(
      `Unknown import '${imp.path}'. Expected a file path, library name, css import, or built-in: ${importBuiltinNames.join(", ")}`,
      imp.loc
    );
  }

  return { allDefs, customEls, cssLinks, jsLinks, builtinCss };
}

function nameLength(s: string): number {
  return s.length;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return curr[b.length];
}

export function resolveRelative(p: string, fromFile: string): string {
  if (path.isAbsolute(p)) return path.normalize(p);
  if (p.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(p)) return p;
  return path.resolve(path.dirname(fromFile), p);
}

export function resolveLibrary(name: string, cfg: ResolverConfig): string {
  const base = name.endsWith(".js") ? name : name + ".js";
  for (const libDir of cfg.libraryPaths) {
    const c = path.join(libDir, base);
    if (fs.existsSync(c)) return c;
  }
  return `/libraries/${base}`;
}

export function resolveSinthPath(p: string, fromFile: string, cfg: ResolverConfig): string {
  if (p.startsWith("./") || p.startsWith("../")) {
    const r  = path.resolve(path.dirname(fromFile), p);
    if (fs.existsSync(r)) return r;
    const w = r.endsWith(".sinth") ? "" : r + ".sinth";
    if (w && fs.existsSync(w)) return w;
    throw new SinthError(`Cannot resolve import '${p}' from '${fromFile}'`);
  }

  const relToFile    = path.resolve(path.dirname(fromFile), p);
  if (fs.existsSync(relToFile)) return relToFile;
  const relToFileExt = relToFile.endsWith(".sinth") ? relToFile : relToFile + ".sinth";
  if (fs.existsSync(relToFileExt)) return relToFileExt;

  for (const libDir of cfg.libraryPaths) {
    const c1 = path.join(libDir, p);
    if (fs.existsSync(c1)) return c1;
    const c2 = c1.endsWith(".sinth") ? c1 : c1 + ".sinth";
    if (fs.existsSync(c2)) return c2;
  }

  throw new SinthError(
    `Cannot resolve import '${p}'\n  Tried: ${relToFileExt}\n  Library paths: ${cfg.libraryPaths.join(", ")}`
  );
}