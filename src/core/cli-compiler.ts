import * as path from "path";
import * as fs from "fs";
import { Loc, Literal, Expression, Child, Attr, CompUse, IfBlock, ForLoop, RemoveStmt, ReturnStmt, StyleBlock, CompDef, ParamDecl, VarDeclaration, SinthFile, CompileCtx, MixedBlockEntry, SinthError, SinthWarning, TT, AssignStmt, MetaEntry } from "./types";
import { Parser } from "./parser";
import { fnv1a, camelToKebab, esc, escAttr, litToString, tagNameToPascal, interpolateAttr, renderText } from "../utils";
import { compileExprToJS, compileIfToJS, bodyToJS } from "./expr";
import { FunctionDef } from "./types";
import { parseFile, resolveImports, ResolverConfig, ResolvedImports } from "../resolver";
import { compileFunctionDef } from "./runtime/functions";
import { generateHelpers } from "./runtime/helpers";
import { buildRenderBody } from "./runtime/render";
import { BUILTIN_MAP, VOID_TAGS, BuiltinInfo } from "./builtins";
import { processStyleBlock } from "./style-processor";
import { buildHeadData, renderHead, HeadData } from "./head-builder";
import { compileCustomElement } from "./runtime/custom-element";
import { eventAttrName, INLINE_STYLE_PROPS, resolveBuiltinTag, registerExpr, renderAttr, renderChild, renderIfBlock, renderCompUse, expandUserComp, collectScripts, extractFunctionNames, buildRuntime } from "./compiler";

export interface CompileOptions {
  projectRoot:  string;
  outDir:       string;
  libraryPaths: string[];
  minify:       boolean;
  checkOnly:    boolean;
  sharedRuntime: boolean;
}

export function compileFile(filePath: string, opts: CompileOptions): { html: string; shared?: string } | null {
  const absPath = path.resolve(filePath);
  const file    = parseFile(absPath);
  const cfg: ResolverConfig = { projectRoot: opts.projectRoot, libraryPaths: opts.libraryPaths };
  const { allDefs, customEls, cssLinks, jsLinks } = resolveImports(file, cfg);
  const hash = "_" + fnv1a(absPath);
  const allVarDecls: VarDeclaration[] = file.varDecls;
  const functionDefs: FunctionDef[]   = file.functions;

  const fnLocalVarNames = new Set<string>();
  const collectFnVars = (child: Child): void => {
    if (child.kind === "var") {
      fnLocalVarNames.add((child as VarDeclaration).name);
    } else if (child.kind === "if") {
      (child as IfBlock).body.forEach(collectFnVars);
      (child as IfBlock).elseBody?.forEach(collectFnVars);
    } else if (child.kind === "for") {
      (child as ForLoop).body.forEach(collectFnVars);
    } else if (child.kind === "use") {
      (child as CompUse).children.forEach(collectFnVars);
    }
  };
  for (const fn of file.functions) {
    fn.body.forEach(collectFnVars);
  }

  const pageVarDecls = allVarDecls.filter(v => !fnLocalVarNames.has(v.name));
  const declaredVars = new Set(pageVarDecls.map(v => v.name));
  const declaredFuncs = new Set(file.functions.map(f => f.name));

  function collectExprVars(expr: Expression | undefined, vars: Set<string>): void {
    if (!expr) return;
    if (expr.kind === "variable" && expr.name && !declaredFuncs.has(expr.name)) vars.add(expr.name);
    if (expr.kind === "assign" && expr.target) vars.add(expr.target);
    if (expr.left) collectExprVars(expr.left, vars);
    if (expr.right) collectExprVars(expr.right, vars);
    if (expr.operand) collectExprVars(expr.operand, vars);
    if (expr.object) collectExprVars(expr.object, vars);
    if (expr.key) collectExprVars(expr.key, vars);
    if (expr.args) expr.args.forEach(a => collectExprVars(a, vars));
  }

  function collectChildVars(child: Child, vars: Set<string>): void {
    if (child.kind === "expr" || child.kind === "assign_stmt" || child.kind === "return") {
      collectExprVars(child.expression, vars);
    }
    if (child.kind === "if") {
      collectExprVars((child as IfBlock).condition, vars);
      (child as IfBlock).body.forEach(c => collectChildVars(c, vars));
      (child as IfBlock).elseBody?.forEach(c => collectChildVars(c, vars));
    }
    if (child.kind === "for") {
      (child as ForLoop).body.forEach(c => collectChildVars(c, vars));
    }
    if (child.kind === "use") {
      (child as CompUse).attrs.forEach(a => {
        if (a.name === "id") return;
        if (a.value?.kind === "str") {
          const v = a.value.value;          
          if (v.startsWith("__EXPR__") || v.startsWith("__MULTI_EXPR__")) {
            try {
              const exprs: Expression[] = v.startsWith("__MULTI_EXPR__")
                ? JSON.parse(v.substring("__MULTI_EXPR__".length))
                : [JSON.parse(v.substring(8))];
              exprs.forEach(e => collectExprVars(e, vars));
            } catch {}
          }
        }
      });
      (child as CompUse).children.forEach(c => collectChildVars(c, vars));
    }
  }
  const pageVars = new Set<string>();
  file.uses.forEach(u => collectChildVars(u, pageVars));
  
  const pageLoopVars = new Set<string>();
  const gatherLoopVars = (child: Child): void => {
    if (child.kind === "for") {
      const fl = child as ForLoop;
      if (fl.itemVar) pageLoopVars.add(fl.itemVar);
      if (fl.keyVar) pageLoopVars.add(fl.keyVar);
      if (fl.indexVar) pageLoopVars.add(fl.indexVar);
      fl.body.forEach(gatherLoopVars);
    } else if (child.kind === "if") {
      (child as IfBlock).body.forEach(gatherLoopVars);
      (child as IfBlock).elseBody?.forEach(gatherLoopVars);
    } else if (child.kind === "use") {
      (child as CompUse).children.forEach(gatherLoopVars);
    }
  };
  file.uses.forEach(gatherLoopVars);
  
  for (const v of pageVars) {
    if (pageLoopVars.has(v)) continue;
    const rootVar = v.split('.')[0];
    if (declaredVars.has(rootVar) || fnLocalVarNames.has(rootVar)) continue;
    let foundInFn = false;
    for (const fn of file.functions) {
      if (fn.params.some(p => p.name === rootVar)) { foundInFn = true; break; }
      const fnLoopVars = new Set<string>();
      const gatherFnLoopVars = (child: Child): void => {
        if (child.kind === "for") {
          const fl = child as ForLoop;
          if (fl.itemVar) fnLoopVars.add(fl.itemVar);
          if (fl.keyVar) fnLoopVars.add(fl.keyVar);
          if (fl.indexVar) fnLoopVars.add(fl.indexVar);
          fl.body.forEach(gatherFnLoopVars);
        } else if (child.kind === "if") {
          (child as IfBlock).body.forEach(gatherFnLoopVars);
          (child as IfBlock).elseBody?.forEach(gatherFnLoopVars);
        } else if (child.kind === "use") {
          (child as CompUse).children.forEach(gatherFnLoopVars);
        }
      };
      fn.body.forEach(gatherFnLoopVars);
      if (fnLoopVars.has(rootVar)) { foundInFn = true; break; }
    }
    if (!foundInFn) {
      throw new SinthError(
        `Variable '${rootVar}' is used but never declared. Add 'var str ${rootVar}' or 'var int ${rootVar}' before using it.`
      );
    }
  }
  for (const fn of file.functions) {
    const fnParamNames = new Set(fn.params.map(p => p.name));
    const fnBodyVars = new Set<string>();
    fn.body.forEach(c => collectChildVars(c, fnBodyVars));
    
    const fnLoopVars = new Set<string>();
    const gatherFnLoopVars = (child: Child): void => {
      if (child.kind === "for") {
        const fl = child as ForLoop;
        if (fl.itemVar) fnLoopVars.add(fl.itemVar);
        if (fl.keyVar) fnLoopVars.add(fl.keyVar);
        if (fl.indexVar) fnLoopVars.add(fl.indexVar);
        fl.body.forEach(gatherFnLoopVars);
      } else if (child.kind === "if") {
        (child as IfBlock).body.forEach(gatherFnLoopVars);
        (child as IfBlock).elseBody?.forEach(gatherFnLoopVars);
      } else if (child.kind === "use") {
        (child as CompUse).children.forEach(gatherFnLoopVars);
      }
    };
    fn.body.forEach(gatherFnLoopVars);
    
    const fnLocalDeclared = new Set<string>();
    const collectFnLocalDeclared = (child: Child): void => {
      if (child.kind === "var") {
        fnLocalDeclared.add((child as VarDeclaration).name);
      } else if (child.kind === "if") {
        (child as IfBlock).body.forEach(collectFnLocalDeclared);
        (child as IfBlock).elseBody?.forEach(collectFnLocalDeclared);
      } else if (child.kind === "for") {
        (child as ForLoop).body.forEach(collectFnLocalDeclared);
      } else if (child.kind === "use") {
        (child as CompUse).children.forEach(collectFnLocalDeclared);
      }
    };
    fn.body.forEach(collectFnLocalDeclared);

    for (const v of fnBodyVars) {
      if (fnLoopVars.has(v)) continue;
      const rootVar = v.split('.')[0];
      if (!fnParamNames.has(rootVar) && !declaredVars.has(rootVar) && !declaredFuncs.has(rootVar) && !fnLocalDeclared.has(rootVar)) {
        throw new SinthError(
          `Variable '${rootVar}' used in function '${fn.name}' is not declared. It must be a parameter or a page-level variable.`
        );
      }
    }
    for (const child of fn.body) {
      checkTypeInChild(child, allVarDecls, functionDefs);
    }
  }
  for (const use of file.uses) {
    checkTypeInChild(use, allVarDecls, functionDefs);
  }

  function inferType(expr: Expression, varDecls: VarDeclaration[], functionDefs: FunctionDef[]): string | null {
    if (expr.kind === "literal" && expr.value) {
      if (expr.value.kind === "str") return "str";
      if (expr.value.kind === "num") return "int";
      if (expr.value.kind === "bool") return "bool";
      return null;
    }
    if (expr.kind === "variable" && expr.name) {
      const vd = varDecls.find(v => v.name === expr.name);
      if (vd) return vd.varType === "str[]" ? "str[]" : vd.varType;
      return null;
    }
    if (expr.kind === "call" && expr.callee?.kind === "variable" && expr.callee.name) {
      const fd = functionDefs.find(f => f.name === expr.callee!.name);
      if (fd?.returnType) return fd.returnType;
      return null;
    }
    if (expr.kind === "binary" && expr.op === "+") return "str";
    if (expr.kind === "unary" && expr.op === "not") return "bool";
    return null;
  }

  function checkCallArgs(fnDef: FunctionDef, args: Expression[], loc: Loc, varDecls: VarDeclaration[], functionDefs: FunctionDef[]): void {
    for (let i = 0; i < fnDef.params.length && i < args.length; i++) {
      const param = fnDef.params[i];
      const arg = args[i];
      if (!param.paramType) continue;
      const argType = inferType(arg, varDecls, functionDefs);
      if (argType && argType !== param.paramType) {
        if (param.paramType === "int" && argType === "str" && arg.kind === "literal" && arg.value?.kind === "str") {
          if (!isNaN(Number(arg.value.value))) continue;
        }
        throw new SinthError(
          `Function '${fnDef.name}' parameter '${param.name}' expects '${param.paramType}' but got '${argType}'`,
          loc
        );
      }
    }
  }

  function checkTypeInExpr(expr: Expression | undefined, varDecls: VarDeclaration[], functionDefs: FunctionDef[]): void {
    if (!expr) return;
    if (expr.kind === "call" && expr.callee?.kind === "variable" && expr.callee.name) {
      const fnDef = functionDefs.find(f => f.name === expr.callee!.name);
      if (fnDef) checkCallArgs(fnDef, expr.args ?? [], fnDef.loc, varDecls, functionDefs);
    }
    if (expr.left) checkTypeInExpr(expr.left, varDecls, functionDefs);
    if (expr.right) checkTypeInExpr(expr.right, varDecls, functionDefs);
    if (expr.operand) checkTypeInExpr(expr.operand, varDecls, functionDefs);
    if (expr.args) expr.args.forEach(a => checkTypeInExpr(a, varDecls, functionDefs));
  }

  function checkTypeInChild(child: Child, varDecls: VarDeclaration[], functionDefs: FunctionDef[]): void {
    if (child.kind === "expr" && child.expression) {
      checkTypeInExpr(child.expression, varDecls, functionDefs);
    }
    if (child.kind === "assign_stmt" && child.expression) {
      checkTypeInExpr(child.expression, varDecls, functionDefs);
    }
    if (child.kind === "return" && (child as ReturnStmt).expression) {
      checkTypeInExpr((child as ReturnStmt).expression, varDecls, functionDefs);
    }
    if (child.kind === "if") {
      const ib = child as IfBlock;
      checkTypeInExpr(ib.condition, varDecls, functionDefs);
      ib.body.forEach(c => checkTypeInChild(c, varDecls, functionDefs));
      ib.elseBody?.forEach(c => checkTypeInChild(c, varDecls, functionDefs));
    }
    if (child.kind === "for") {
      (child as ForLoop).body.forEach(c => checkTypeInChild(c, varDecls, functionDefs));
    }
    if (child.kind === "use") {
      const u = child as CompUse;
      u.attrs.forEach(a => {
        if (a.value?.kind === "str" && a.value.value.startsWith("__EXPR__")) {
          try {
            const expr: Expression = JSON.parse(a.value.value.substring(8));
            checkTypeInExpr(expr, varDecls, functionDefs);
          } catch {}
        }
      });
      u.children.forEach(c => checkTypeInChild(c, varDecls, functionDefs));
    }
  }

  const enableDiffing = file.meta.some(m =>
    m.key === "domdiffing" &&
    (m.value.kind === "bool" ? m.value.value === true : (m.value.kind === "str" && m.value.value === "true"))
  );
  const topLevelLogicIfs: string[] = [];
  file.scripts = file.scripts.filter(s => {
    const trimmed = s.raw.trim();
    if (/^if\s*\(/.test(trimmed) || /^\{/.test(trimmed)) {
      topLevelLogicIfs.push(trimmed);
      return false;
    }
    return true;
  });

  const ctx: CompileCtx = {
    allDefs, functionDefs, customEls, cssLinks, jsLinks,
    scopeHash:    hash,
    pageFile:     absPath,
    extraCSS:     [],
    mixedBlocks:  [],
    mixedCounter: 0,
    logicBlocks:  [...topLevelLogicIfs],
    ifIdCounter:  0,
    exprRegistry: [],
    exprMap:      new Map(),
    varDecls:     pageVarDecls,
    actionButtons: [],
    diffingEnabled: enableDiffing,
    declaredVars: declaredVars,
    namespace: hash,
  };

  if (!file.isPage) {
    const body    = file.uses.map(u => renderCompUse(u, ctx, new Map(), 0)).join("\n");
    const pageCSS = file.styles.map(s => processStyleBlock(s, hash)).join("\n");
    const allCSS  = [pageCSS, ...ctx.extraCSS].join("\n");
       const h = `${body}\n<style>\n${allCSS}\n</style>`;
    return { html: h };
  }

  const headData = buildHeadData(file.meta);
  const bodyHTML = file.uses.map(u => renderCompUse(u, ctx, new Map(), 0)).join("\n");
  const pageCSS   = file.styles.map(s => processStyleBlock(s, hash, new Map())).join("\n");
  const scopedCSS = [pageCSS, ...ctx.extraCSS].filter(c => c.trim()).join("\n");
  const { componentScripts, pageScripts } = collectScripts(file, allDefs);

  // collect all assigned variables for default-value warnings
  const assignedVars = new Set<string>();
  for (const s of file.scripts) {
    for (const m of s.raw.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:[+\-]?=)/g)) assignedVars.add(m[1]);
  }
  for (const v of file.varDecls) { if (v.value) assignedVars.add(v.name); }

  // warn about reserved browser globals
  const RESERVED_GLOBALS = new Set(["name", "location", "history", "status", "closed", "length", "top", "self", "parent", "frames", "origin"]);
  for (const v of file.varDecls) {
    if (RESERVED_GLOBALS.has(v.name)) {
      SinthWarning.emit(`Variable '${v.name}' shadows a reserved browser global. This may cause unexpected behavior. Consider renaming.`, v.loc);
    }
  }

  // compile function definitions to JS
  const compiledFunctions = functionDefs.map(f => compileFunctionDef(f, ctx)).join("\n");

  // companion JS file (needs same name as .sinth, adds support for JS libraries)
  const companionJS = (() => {
    const base = absPath.replace(/\.sinth$/, ".js");
    return fs.existsSync(base) ? path.basename(base) : undefined;
  })();

  const relativeCssLinks = cssLinks.map(css => {
    const rel = path.relative(path.dirname(absPath), css).replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
  });
  const relativeJsLinks = jsLinks.map(js => ({
    ...js,
    src: (() => {
      const rel = path.relative(path.dirname(absPath), js.src).replace(/\\/g, "/");
      return rel.startsWith(".") ? rel : "./" + rel;
    })(),
  }));

  const runtimeResult = buildRuntime({
    varDecls:     pageVarDecls,
    bodyHTML,
    logicBlocks:  ctx.logicBlocks,
    mixedBlocks:  ctx.mixedBlocks,
    assignedVars,
    exprRegistry: ctx.exprRegistry,
    sharedRuntime: opts.sharedRuntime,
    functionsJS:  compiledFunctions,
    namespace:    hash,
    declaredVars: ctx.declaredVars,
  });
  const runtimeJS = typeof runtimeResult === 'string' ? runtimeResult : runtimeResult.page;
  const sharedJS = typeof runtimeResult === 'string' ? null : runtimeResult.shared;
  let finalRuntimeJS = runtimeJS;
  if (enableDiffing) {
    finalRuntimeJS = runtimeJS.replace('sinthRender();',
      'var _bump=function(v){_bump._v[v]=(_bump._v[v]||0)+1;};' +
      '_bump._v={};' +
      'window._bump=_bump;' +
      'var _exprCache=new WeakMap();' +
      'var _origSinthExpr=sinthExpr;' +
      'sinthExpr=function(el){' +
      'var deps=el.dataset.sinthDeps;' +
      'if(deps!=null){' +
      'var list=deps.split(",").filter(Boolean);' +
      'if(list.length){' +
      'var h="";' +
      'for(var i=0;i<list.length;i++){var v=list[i].trim();h+=v+":"+(_bump._v[v]||0)+";";}' +
      'var old=_exprCache.get(el);' +
      'if(old===h)return;' +
      '_exprCache.set(el,h);' +
      '}else{' +
      'if(_exprCache.has(el))return;' +
      '_exprCache.set(el,1);' +
      '}' +
      '}' +
      '_origSinthExpr(el);' +
      '};' +
      'sinthRender();'
    );
  }


  const head = renderHead(headData, relativeCssLinks, relativeJsLinks, scopedCSS, companionJS);
  const scriptTags: string[] = [];
  if (componentScripts.length > 0) {
    scriptTags.push(`<script>\n${componentScripts.join("\n\n")}\n</script>`);
  }

  for (const s of pageScripts) {
    const extra = Object.entries(s.attrs)
      .map(([k, v]) => v === "true" ? k : `${k}="${escAttr(v)}"`)
      .join(" ");
    const globalised = s.raw.replace(/\b(let|const)\b/g, "let");
    scriptTags.push(`<script${extra ? " " + extra : ""}>\n${globalised}\n</script>`);
  }


const sharedRuntimeTag = (() => {
  if (!opts.sharedRuntime || !sharedJS) return "";
  
  const relPath = path.relative(opts.projectRoot, absPath);
  const htmlOutputDir = path.dirname(relPath.replace(/\.sinth$/, '.html'));
  const relativeRuntimePath = path.relative(htmlOutputDir, '.').replace(/\\/g, '/');
  const runtimeSrc = relativeRuntimePath ? `${relativeRuntimePath}/sinth-runtime.js` : './sinth-runtime.js';
  
  return `<script src="${runtimeSrc}"></script>`;
})();

  let actionInitScript = '';
  if (ctx.actionButtons.length > 0) {
    actionInitScript = '<script>' +
      ctx.actionButtons.map(b =>
        `setTimeout(function(){ var el=document.querySelector('[data-sinth-queue-id="${b.qid}"]'); if(el)el.style.display=''; },${b.delayMs});`
      ).join('') +
      '</script>';
  }

  const html = [
    "<!DOCTYPE html>",
    `<html lang="${escAttr(headData.lang)}">`,
    head,
    `<body data-s="${hash}">`,
    bodyHTML,
    actionInitScript,
    sharedRuntimeTag,
    finalRuntimeJS.trim() ? `<script>\n${finalRuntimeJS}\n</script>` : "",
    scriptTags.join("\n"),
    "</body>",
    "</html>",
  ].filter(Boolean).join("\n");

  for (const cel of file.customEls) {
    if (cel.exportTag) {
      try {
        const compJs = compileCustomElement(cel, opts, hash, ctx);
        const relPath = path.relative(opts.projectRoot, path.dirname(absPath));
        const outPath = path.join(opts.outDir, relPath, cel.exportTag + ".js");
        if (!opts.checkOnly) {
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, compJs);
          process.stdout.write(`  \x1b[32m✓\x1b[0m ${cel.exportTag}.js (custom element)\n`);
        }
      } catch (e: unknown) {
        SinthWarning.emit(`Failed to compile custom element '${cel.exportTag}': ${(e as Error).message}`, cel.loc);
      }
    }
  }

  const finalHTML = opts.minify ? minifyHTML(html) : html;
  return sharedJS ? { html: finalHTML, shared: sharedJS } : { html: finalHTML };
}



export function minifyHTML(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\n\s*\n/g, "\n").trim();
}

// file discovery & asset copy

export function findSinthPages(dir: string, outDir?: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (outDir && path.resolve(full) === path.resolve(outDir)) continue;
    if (entry.isDirectory()) results.push(...findSinthPages(full, outDir));
    else if (entry.name.endsWith(".sinth")) results.push(full);
  }
  return results;
}

export function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

