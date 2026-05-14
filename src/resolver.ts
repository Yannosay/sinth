import * as fs from "fs";
import * as path from "path";
import { SinthFile, CompDef, CustomElInfo, SinthError, SinthWarning } from "./core/types.ts";
import { Lexer } from "./core/lexer.ts";
import { Parser } from "./core/parser.ts";
import { BUILTIN_MAP } from "./core/compiler.ts";



export interface ResolverConfig { projectRoot: string; libraryPaths: string[] }

export interface ResolvedImports {
  allDefs:   Map<string, CompDef>;
  customEls: Map<string, CustomElInfo>;
  cssLinks:  string[];
  jsLinks:   { src: string; attrs: Record<string, string> }[];
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

  for (const imp of file.imports) {
    if (imp.kind === "css") {
      const r = resolveRelative(imp.path, file.filePath);
      if (!cssLinks.includes(r)) cssLinks.push(r);

    } else if (imp.kind === "js") {
      const src = resolveLibrary(imp.name, cfg);
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
        }
      }

    } else if (imp.kind === "sinth") {
      const resolved = resolveSinthPath(imp.path, file.filePath, cfg);

      if (IMPORT_STACK.includes(resolved)) {
        throw new SinthError(
          `Circular import: ${[...IMPORT_STACK, resolved].join(" → ")}`
        );
      }
      if (visited.has(resolved)) continue;
      visited.add(resolved);

      IMPORT_STACK.push(resolved);
      const imported = parseFile(resolved);
      IMPORT_STACK.pop();

      const sub = resolveImports(imported, cfg, visited);
      for (const [name, def] of sub.allDefs) {
        if (allDefs.has(name)) throw new SinthError(`Component '${name}' defined in multiple imported files.`);
        allDefs.set(name, def);
      }
      for (const [n, e] of sub.customEls) customEls.set(n, e);
      for (const l of sub.cssLinks)  if (!cssLinks.includes(l)) cssLinks.push(l);
      for (const j of sub.jsLinks)   jsLinks.push(j);
    }
  }

  return { allDefs, customEls, cssLinks, jsLinks };
}

export function resolveRelative(p: string, fromFile: string): string {
  if (p.startsWith("./") || p.startsWith("../")) return path.resolve(path.dirname(fromFile), p);
  return p;
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