import { Lexer } from "../core/lexer";
import { Parser } from "../core/parser";
import { SinthFile, CompileCtx } from "../core/types";
import { buildRuntime, renderCompUse } from "../core/compiler";
import { fnv1a } from "../utils";
import { processStyleBlock } from "../core/style-processor";

export interface BrowserCompileResult {
  html: string;
  js: string;
}

export function compileSinth(source: string): BrowserCompileResult | null {
  const tokens = new Lexer(source, "<script>").tokenize();
  const parser = new Parser(tokens, "<script>");
  const file: SinthFile = parser.parse();

  if (!file.isPage) return null;

  const hash = fnv1a("<script>" + Math.random().toString(36));
  const instanceId = "s" + Math.random().toString(36).slice(2, 8);

  const ctx: CompileCtx = {
    allDefs: new Map(),
    functionDefs: file.functions,
    customEls: new Map(),
    cssLinks: [],
    jsLinks: [],
    scopeHash: hash,
    pageFile: "<script>",
    extraCSS: [],
    mixedBlocks: [],
    mixedCounter: 0,
    logicBlocks: [],
    ifIdCounter: 0,
    exprRegistry: [],
    exprMap: new Map(),
    varDecls: file.varDecls,
    actionButtons: [],
    diffingEnabled: false,
    declaredVars: new Set(file.varDecls.map(v => v.name)),
    namespace: instanceId,
  };

  const bodyHTML = file.uses.map(u => renderCompUse(u, ctx, new Map(), 0)).join("\n");
  const pageCSS = file.styles.map(s => processStyleBlock(s, hash, new Map())).join("\n");

  const assignedVars = new Set<string>();
  for (const v of file.varDecls) {
    if (v.value) assignedVars.add(v.name);
  }

  const runtime = buildRuntime({
    varDecls: file.varDecls,
    bodyHTML,
    logicBlocks: ctx.logicBlocks,
    mixedBlocks: ctx.mixedBlocks,
    assignedVars,
    exprRegistry: ctx.exprRegistry,
    sharedRuntime: false,
    functionsJS: "",
    namespace: instanceId,
  });

  const js = typeof runtime === 'string' ? runtime : runtime.page;
  const scopedJs = js;

  return {
    html: `<div data-s="${hash}">${bodyHTML}</div><style>${pageCSS}</style>`,
    js: scopedJs,
  };
}