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

const EVENT_RE = /^on[A-Z]/;
export function eventAttrName(name: string): string | null {
  return EVENT_RE.test(name) ? name.toLowerCase() : null;
}

/**
 * CSS property names that are allowed as inline style shorthand attributes on
 * any Sinth component:  Paragraph(color: "red", fontSize: "1.2rem") { "Hi" }
 */
export const INLINE_STYLE_PROPS = new Set([
  "color","backgroundColor","backgroundImage","backgroundSize","backgroundPosition",
  "fontSize","fontWeight","fontFamily","fontStyle","fontVariant","lineHeight","letterSpacing","textAlign",
  "textDecoration","textTransform","whiteSpace","wordBreak","wordWrap","textOverflow",
  "margin","marginTop","marginBottom","marginLeft","marginRight",
  "padding","paddingTop","paddingBottom","paddingLeft","paddingRight",
  "width","height","minWidth","maxWidth","minHeight","maxHeight",
  "display","flexDirection","flexWrap","flex","flexGrow","flexShrink","flexBasis",
  "justifyContent","alignItems","alignContent","alignSelf","gap","rowGap","columnGap",
  "gridTemplateColumns","gridTemplateRows","gridColumn","gridRow","gridArea",
  "position","top","right","bottom","left","zIndex",
  "border","borderTop","borderBottom","borderLeft","borderRight",
  "borderWidth","borderStyle","borderColor","borderRadius",
  "outline","outlineWidth","outlineStyle","outlineColor","outlineOffset",
  "boxShadow","textShadow","opacity","visibility",
  "overflow","overflowX","overflowY","objectFit","objectPosition",
  "cursor","userSelect","pointerEvents","resize",
  "transform","transition","animation","animationDuration","animationDelay",
  "listStyle","listStyleType","listStylePosition",
  "verticalAlign","float","clear",
  "content","quotes",
]);

function inlineFunctionBody(fnDef: FunctionDef, args: Expression[], ctx: CompileCtx): string | null {
  const paramMap = new Map<string, string>();
  for (let i = 0; i < fnDef.params.length && i < args.length; i++) {
    paramMap.set(fnDef.params[i].name, compileExprToJS(args[i], ctx.loopVars, ctx.namespace, ctx.declaredVars));
  }
  const subExpr = (expr: Expression): Expression => {
    if (expr.kind === "variable" && expr.name && paramMap.has(expr.name)) {
      return { kind: "variable", name: paramMap.get(expr.name)! };
    }
    if (expr.kind === "binary") {
      return { ...expr, left: expr.left ? subExpr(expr.left) : undefined, right: expr.right ? subExpr(expr.right) : undefined };
    }
    if (expr.kind === "unary") {
      return { ...expr, operand: expr.operand ? subExpr(expr.operand) : undefined };
    }
    if (expr.kind === "assign") {
      if (expr.target && paramMap.has(expr.target)) {
        return { ...expr, target: paramMap.get(expr.target)!, right: expr.right ? subExpr(expr.right) : undefined };
      }
      return { ...expr, right: expr.right ? subExpr(expr.right) : undefined };
    }
    if (expr.kind === "postfix" && expr.target && paramMap.has(expr.target)) {
      return { ...expr, target: paramMap.get(expr.target)!, op: expr.op };
    }
    if (expr.kind === "index") {
      return { ...expr, object: expr.object ? subExpr(expr.object) : undefined, key: expr.key ? subExpr(expr.key) : undefined };
    }
    if (expr.kind === "call") {
      return { ...expr, callee: expr.callee ? subExpr(expr.callee) : undefined, args: expr.args?.map(a => subExpr(a)) };
    }
    return expr;
  };
  const subChild = (child: Child): Child => {
    switch (child.kind) {
      case "assign_stmt":
        return { ...child, expression: subExpr(child.expression) as Expression };
      case "if": {
        const ib = child as IfBlock;
        return {
          ...ib,
          condition: subExpr(ib.condition),
          body: ib.body.map(subChild),
          elseBody: ib.elseBody?.map(subChild),
        };
      }
      case "return":
        return { ...child, expression: child.expression ? subExpr(child.expression) : undefined };
      default:
        return child;
    }
  };
  const statements: string[] = [];
  
  for (const c of fnDef.body) {
    const substituted = subChild(c);
    if (substituted.kind === "assign_stmt") {
      statements.push(compileExprToJS(substituted.expression, ctx.loopVars, ctx.namespace, ctx.declaredVars) + ";");
    } else if (substituted.kind === "expr") {
      statements.push(compileExprToJS((substituted as any).expression, ctx.loopVars, ctx.namespace, ctx.declaredVars) + ";");
    } else if (substituted.kind === "if") {
      statements.push(compileIfToJS(substituted as IfBlock, ctx.loopVars, ctx.namespace, ctx.declaredVars));
    } else if (substituted.kind === "return") {
    } else if (substituted.kind === "for") {
      const fl = substituted as any;
      const innerLoopVars = new Set<string>();
      if (ctx.loopVars) {
        for (const v of ctx.loopVars) {
          if (v !== fl.itemVar && v !== fl.indexVar && v !== fl.keyVar) {
            innerLoopVars.add(v);
          }
        }
      }
      const bodyStmts = fl.body.map((bc: any) => {
        const s = subChild(bc);
        if (s.kind === "assign_stmt") return compileExprToJS(s.expression, innerLoopVars, ctx.namespace, ctx.declaredVars) + ";";
        if (s.kind === "if") return compileIfToJS(s, innerLoopVars, ctx.namespace, ctx.declaredVars);
        if (s.kind === "expr") return compileExprToJS(s.expression, innerLoopVars, ctx.namespace, ctx.declaredVars) + ";";
        return "";
      }).filter(Boolean).join(" ");
      const nsArrayVar = (ctx.namespace && ctx.declaredVars && ctx.declaredVars.has(fl.arrayVar)) ? ctx.namespace + "_" + fl.arrayVar : fl.arrayVar;
      if (fl.indexVar) {
        const alreadyDeclared = fnDef.body.some((bc: any) => bc.kind === "var" && bc.name === fl.indexVar);
        if (!alreadyDeclared) {
          statements.push(`let ${fl.indexVar} = 0;`);
        }
        statements.push(`for (let ${fl.itemVar} of ${nsArrayVar}) { ${bodyStmts} ${fl.indexVar} = ${fl.indexVar} + 1; }`);
      } else {
        statements.push(`for (let ${fl.itemVar} of ${nsArrayVar}) { ${bodyStmts} }`);
      }
    } else if (substituted.kind === "var") {
      const vd = substituted as VarDeclaration;
      let initJS: string;
      if (vd.value) {
        const lit = vd.value;
        if (lit.kind === "str") {
          if (lit.value.startsWith("__VAR__")) {
            const varName = lit.value.slice(7);
            initJS = paramMap.has(varName) ? paramMap.get(varName)! : varName;
          } else if (lit.value.startsWith("__ARR__")) {
            initJS = lit.value.slice(7);
          } else if (lit.value.startsWith("__EXPR__")) {
            try {
              const innerExpr: Expression = JSON.parse(lit.value.substring(8));
              initJS = compileExprToJS(subExpr(innerExpr), ctx.loopVars, ctx.namespace, ctx.declaredVars);
            } catch { initJS = JSON.stringify(lit.value); }
          } else {
            initJS = JSON.stringify(lit.value);
          }
        } else if (lit.kind === "num") {
          initJS = String(lit.value);
        } else if (lit.kind === "bool") {
          initJS = String(lit.value);
        } else if (lit.kind === "null") {
          initJS = "null";
        } else {
          initJS = "null";
        }
      } else {
        const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]", obj: "{}" };
        initJS = defaults[vd.varType] ?? "undefined";
      }
      statements.push(`let ${vd.name} = ${initJS};`);
    }
  }
  if (statements.length === 0) return null;
  return statements.join(" ");
}

export function resolveBuiltinTag(
  name:  string,
  attrs: Attr[],
): { tag: string; defaultClass?: string; voidEl: boolean } {
  if (name === "Heading") {
    const la = attrs.find(a => a.name === "level");
    const lv = la?.value?.kind === "num" ? Math.min(6, Math.max(1, la.value.value)) : 1;
    if (!la) SinthWarning.emit(`Heading used without 'level' attribute, defaulting to h1`);
    return { tag: `h${lv}`, voidEl: false };
  }
  const info = BUILTIN_MAP[name];
  if (info) return { tag: info.tag, defaultClass: info.defaultClass, voidEl: info.voidEl ?? false };
  SinthWarning.emit(`Unknown component '${name}', treating as <${name.toLowerCase()}>`);
  return { tag: name.toLowerCase(), voidEl: false };
}

export function registerExpr(ctx: CompileCtx, expr: Expression): number {
  let jsExpr = compileExprToJS(expr, ctx.loopVars, ctx.namespace, ctx.declaredVars);
  if (ctx.scopePrefix && ctx.scopeVar && expr.kind === "variable" && expr.name && ctx.varDecls?.some(v => v.name === expr.name)) {
    jsExpr = `_ctx.${ctx.scopePrefix}${expr.name}`;
  }
  const existing = ctx.exprMap.get(jsExpr);
  if (existing !== undefined) return existing;
  const id = ctx.exprRegistry.length;
  ctx.exprRegistry.push(jsExpr);
  ctx.exprMap.set(jsExpr, id);
  return id;
}

function emitCEAction(ctx: CompileCtx, eventName: string, handlerBody: string): string {
  if (!ctx.ceActionHandlers) ctx.ceActionHandlers = [];
  const idx = ctx.ceActionHandlers.length;
  ctx.ceActionHandlers.push(`function(e, host) { ${handlerBody} }`);
  return `data-sinth-ce-${eventName}="${idx}"`;
}


export function renderAttr(attr: Attr, paramMap: Map<string, string>, ctx: CompileCtx): string {
  const { name, value } = attr;
  const renderFn = ctx.namespace ? "sinthRender_" + ctx.namespace : "sinthRender";
  if (value === null)        return name;
  if (value.kind === "null") return "";
  if (value.kind === "bool") return value.value ? name : "";

if (name === "model" && value?.kind === "str") {
  let vName = interpolateAttr(value.value, paramMap);
  if (ctx.scopePrefix && ctx.scopeVar && ctx.varDecls?.some(v => v.name === vName)) {
    vName = `${ctx.scopePrefix}${vName}`;
  }
  if (ctx.namespace) vName = ctx.namespace + "_" + vName;
  const varDecl = ctx?.varDecls?.find(v => v.name === vName);
  const rhs = (varDecl && varDecl.varType === "int")
    ? `Number(e.target.value) || 0`
    : `e.target.value`;
  const renderCall = ctx.scopeVar ? `${ctx.scopeVar}._render()` : renderFn + "()";
  const handlerBody = `${vName} = ${rhs}; ${renderCall}`;
  if (ctx.scopePrefix) {
    const oninputAttr = emitCEAction(ctx, 'input', handlerBody);
    return `${oninputAttr} value="${escAttr(vName)}"`;
  }
  return `oninput="(function(e){ ${handlerBody} })(event)" value="${escAttr(vName)}"`;
}

if (name === "step" && value?.kind === "str") {
  const raw = value.value;
  if (raw.startsWith("__EXPR__")) {
    try {
      const expr: Expression = JSON.parse(raw.substring(8));
      if (expr.kind === "variable" && expr.name) {
        const stepExprId = registerExpr(ctx, expr);
        return `data-sinth-step="${stepExprId}"`;
      }
    } catch {}
  }
}



if (name === "delay") {
    if (value.kind === "num") {
      return `data-sinth-delay="${value.value}"`;
    }
    const v = litToString(value);
    if (/^\d+$/.test(v)) return `data-sinth-delay="${escAttr(v)}"`;
    if (v.startsWith("__EXPR__")) {
      try {
        const expr: Expression = JSON.parse(v.substring(8));
        const id = registerExpr(ctx, expr);
        return `data-sinth-delay-expr-id="${id}"`;
      } catch {}
    }
    const id = registerExpr(ctx, { kind: "variable", name: v });
    return `data-sinth-delay-expr-id="${id}"`;
  }

  if (name === "hide") {
    if (value === null) return `data-sinth-hide=""`;
    if (value && (value as any).kind === "bool") {
      return (value as any).value ? `data-sinth-hide=""` : "";
    }
    if (value?.kind === "str") {
      const v = value.value;
      if (v === "true") return `data-sinth-hide=""`;
      if (v === "false") return "";
      if (v.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(v.substring(8));
          const id = registerExpr(ctx, expr);
          return `data-sinth-hide="${id}"`;
        } catch { return ""; }
      }
    }
    return "";
  }

  if (name === "fullscreen") {
    if (value?.kind === "str") {
      const v = value.value;
      if (v.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(v.substring(8));
          const id = registerExpr(ctx, expr);
          return `data-sinth-fullscreen="${id}"`;
        } catch { return ""; }
      }
    }
    return "";
  }

  if (name === "fullscreenSync") {
    if (value?.kind === "str") {
      const raw = value.value;
      if (raw.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(raw.substring(8));
          if (expr.kind === "variable" && expr.name) {
            return `data-sinth-fullscreen-sync="${escAttr(expr.name)}"`;
          }
        } catch {}
      }
      return `data-sinth-fullscreen-sync="${escAttr(raw)}"`;
    }
    return "";
  } 

  if (name === "checked") {
    return (value as any)?.kind === "bool" && (value as any).value ? "checked" : "";
  }

  if (value.kind === "num") return `${name}="${value.value}"`;

  let raw = value.value;

  if (raw.startsWith("__ACTION_JS__")) {
    const js = raw.substring("__ACTION_JS__".length);
    const ev = eventAttrName(name);
    if (ev) return `${ev}="(function(){ ${js.replace(/"/g, "&quot;")}; ${renderFn}(); })()"`;
    return `${name}="${escAttr(js)}"`;
  }  
  if (raw.startsWith("__MULTI_EXPR__")) {
    const exprJson = raw.substring("__MULTI_EXPR__".length);
    try {
      const exprs: Expression[] = JSON.parse(exprJson);
      const jsExprs = exprs.map(e => compileExprToJS(e, undefined, ctx.namespace, ctx.declaredVars)).join("; ");
      const ev = eventAttrName(name);
      let bumps = "";
      if (ctx.diffingEnabled) {
        const targets: string[] = [];
        for (const e of exprs) {
          if (e.kind === "assign" && e.target) targets.push(e.target);
        }
        if (targets.length) bumps = ";" + targets.map(t => `window._bump&&window._bump('${t.replace(/'/g, "\\'")}')`).join(";");
      }
      if (ev) return `${ev}="(function(){ ${jsExprs.replace(/"/g, "&quot;")}${bumps}; ${renderFn}(); })()"`;
      return `${name}="${escAttr(jsExprs)}"`;
    } catch { }
  }
  if (raw.startsWith("__EXPR__")) {
    const exprJson = raw.substring("__EXPR__".length);
    try {
      const expr: Expression = JSON.parse(exprJson);
      const ev = eventAttrName(name);
      if (ev && expr.kind === "call" && expr.callee?.kind === "variable") {
        const fnName = expr.callee.name;
        const fnDef = fnName ? ctx.functionDefs.find(f => f.name === fnName) : undefined;
        if (fnDef) {
          const inlinedJS = inlineFunctionBody(fnDef, expr.args ?? [], ctx);
          if (inlinedJS) {
            return `${ev}="(function(){ ${inlinedJS.replace(/"/g, "&quot;")}; ${renderFn}(); })()"`;
          }
        }
      }
      let jsExpr = compileExprToJS(expr, ctx?.loopVars, ctx.namespace, ctx.declaredVars);
      if (ctx.scopePrefix && ctx.scopeVar) {
        if (expr.kind === "variable" && expr.name && ctx.varDecls?.some(v => v.name === expr.name)) {
          jsExpr = `${ctx.scopePrefix}${expr.name}`;
        } else if (expr.kind === "assign" && expr.target && ctx.varDecls?.some(v => v.name === expr.target)) {
          jsExpr = jsExpr.replace(new RegExp(`^${expr.target}\\b`), `${ctx.scopePrefix}${expr.target}`);
        }
      }
      if (ev && expr.kind === "variable" && expr.name && ctx.functionDefs.some(f => f.name === expr.name)) {
        jsExpr = jsExpr + "()";
      }
      const renderCall = ctx.scopeVar ? `${ctx.scopeVar}._render()` : renderFn + "()";
      let bump = "";
      if (ctx.diffingEnabled && expr.kind === "assign" && expr.target) {
        bump = `;window._bump&&window._bump('${expr.target.replace(/'/g, "\\'")}')`;
      }
      if (ev) {
        const handlerBody = `${jsExpr}${bump}; ${renderCall}`;
        if (ctx.scopePrefix) {
          return emitCEAction(ctx, ev, handlerBody);
        }
        return `${ev}="(function(){ ${handlerBody.replace(/"/g, "&quot;")} })()"`;
      }
      return `${name}="${escAttr(jsExpr)}"`;
    } catch { }
  }

  raw = interpolateAttr(raw, paramMap);

  const ev = eventAttrName(name);
  if (ev) {
    const call = raw.includes("(") ? raw : raw + "()";
    return `${ev}="${escAttr(call)};${renderFn}()"`;
  }
  return `${name}="${escAttr(raw)}"`;
}






function substituteParamsInExpr(expr: Expression, params: Map<string, string>): Expression {
  if (expr.kind === "variable" && expr.name && params.has(expr.name)) {
    const val = params.get(expr.name)!;
    if (val.startsWith("__LIT__")) {
      return { kind: "literal", value: { kind: "str", value: val.slice(7) } };
    }
    if (val.startsWith("__EXPR__")) {
      try {
        return JSON.parse(val.substring(8));
      } catch { return expr; }
    }
    return { kind: "literal", value: { kind: "str", value: val } };
  }
  if (expr.kind === "binary") {
    return {
      ...expr,
      left: expr.left ? substituteParamsInExpr(expr.left, params) : undefined,
      right: expr.right ? substituteParamsInExpr(expr.right, params) : undefined,
    };
  }
  if (expr.kind === "unary" && expr.operand) {
    return { ...expr, operand: substituteParamsInExpr(expr.operand, params) };
  }
  return expr;
}

function exprDeps(expr: Expression, declaredVars: Set<string>): string {
  const deps = new Set<string>();
  function walk(e: Expression | undefined): void {
    if (!e) return;
    if (e.kind === "variable" && e.name && declaredVars.has(e.name)) deps.add(e.name);
    if (e.kind === "binary")  { walk(e.left); walk(e.right); }
    if (e.kind === "unary")   walk(e.operand);
    if (e.kind === "call")    { e.args?.forEach(walk); }
    if (e.kind === "index")   { walk(e.object); walk(e.key); }
    if (e.kind === "assign")  { if (e.target && declaredVars.has(e.target)) deps.add(e.target); walk(e.right); }
  }
  walk(expr);
  return [...deps].join(",");
}

export function renderChild(
  child:  Child,
  ctx:    CompileCtx,
  params: Map<string, string>,
  depth:  number,
): string {
  if (depth > 64) throw new SinthError("Maximum component nesting depth (64) exceeded.");

  switch (child.kind) {
    case "text":
      return renderText(child.value, params);

    case "expr": {
      if (!child.expression) return "";
      
      if (child.expression.kind === "variable" && child.expression.name && params.has(child.expression.name)) {
        const val = params.get(child.expression.name)!;
        if (val.startsWith("__LIT__")) {
          return esc(val.slice(7));
        }
        if (val.startsWith("__RAW__")) {
          return val.slice(7);
        }        
        if (val.startsWith("__VAR__")) {
          const exprId = registerExpr(ctx, { kind: "variable", name: val.slice(7) });
          return `<span class="sinth-expr" data-expr-id="${exprId}"${ctx.diffingEnabled ? ` data-sinth-deps="${exprDeps(child.expression, ctx.declaredVars ?? new Set())}"` : ""}></span>`;
        }
        if (val.startsWith("__EXPR__")) {
          try {
            const expr: Expression = JSON.parse(val.substring(8));
            const exprId = registerExpr(ctx, expr);
            return `<span class="sinth-expr" data-expr-id="${exprId}"${ctx.diffingEnabled ? ` data-sinth-deps="${exprDeps(child.expression, ctx.declaredVars ?? new Set())}"` : ""}></span>`;
          } catch { return esc(val); }
        }
        return esc(val);
      }
      if (child.expression.kind === "call" && child.expression.callee?.kind === "variable") {
        const fnName = child.expression.callee.name;
        const isMemo = child.expression.memo === true;
        if (isMemo) {
          if (fnName && fnName.includes(".")) {
            SinthWarning.emit(`'$' on '${fnName}()' has no effect — dotted calls cannot be memoized.`);
            ctx.logicBlocks.push(compileExprToJS(child.expression, undefined, ctx.namespace, ctx.declaredVars) + ";");
            return "";
          }
          const js = compileExprToJS(child.expression, undefined, ctx.namespace, ctx.declaredVars);
          ctx.logicBlocks.push(`if(!_memo_${fnName}_done){_memo_${fnName}=${js};_memo_${fnName}_done=true;}`);
          const exprId = registerExpr(ctx, { kind: "variable", name: `_memo_${fnName}` });
          return `<span class="sinth-expr" data-expr-id="${exprId}"></span>`;
        }
        if (fnName && fnName.includes(".")) {
          ctx.logicBlocks.push(compileExprToJS(child.expression, undefined, ctx.namespace, ctx.declaredVars) + ";");
          return "";
        }
        if (fnName === "remove" && child.expression.args && child.expression.args.length === 1) {
          const arg = child.expression.args[0];
          if (arg.kind === "literal" && arg.value?.kind === "str") {
            return `<span data-sinth-remove="${esc(arg.value.value)}"></span>`;
          }
        }
        const fnDef = fnName ? ctx.functionDefs.find(f => f.name === fnName) : undefined;
        if (fnDef && fnDef.returnType === "ui") {
          const callArgs = child.expression.args ?? [];
          const localParams = new Map<string, string>();
          for (let i = 0; i < fnDef.params.length && i < callArgs.length; i++) {
            const arg = callArgs[i];
            if (arg.kind === "literal" && arg.value?.kind === "str") {
              localParams.set(fnDef.params[i].name, "__LIT__" + arg.value.value);
            } else if (arg.kind === "variable" && arg.name) {
              localParams.set(fnDef.params[i].name, "__VAR__" + arg.name);
            } else {
              const exprId = registerExpr(ctx, arg);
              localParams.set(fnDef.params[i].name, "__EXPRID__" + exprId);
            }
          }
          const substituteExpr = (expr: Expression, pm: Map<string, string>): Expression => {
            if (expr.kind === "variable" && pm.has(expr.name!)) {
              const pv = pm.get(expr.name!)!;
              if (pv.startsWith("__LIT__")) return { kind: "literal", value: { kind: "str", value: pv.slice(7) } };
              if (pv.startsWith("__EXPRID__")) {
                const id = parseInt(pv.slice(10), 10);
                return { kind: "expr_ref", exprId: id };
              }
              return { kind: "variable", name: pv.slice(7) };
            }
            if (expr.kind === "binary") return { ...expr, left: substituteExpr(expr.left!, pm), right: substituteExpr(expr.right!, pm) };
            if (expr.kind === "unary") return { ...expr, operand: substituteExpr(expr.operand!, pm) };
            if (expr.kind === "call") return { ...expr, callee: substituteExpr(expr.callee!, pm), args: expr.args?.map(a => substituteExpr(a, pm)) };
            if (expr.kind === "index") return { ...expr, object: substituteExpr(expr.object!, pm), key: substituteExpr(expr.key!, pm) };
            if (expr.kind === "assign") {
              const target = expr.target;
              if (target && pm.has(target)) {
                const pv = pm.get(target)!;
                if (pv.startsWith("__VAR__")) {
                  return { ...expr, target: pv.slice(7), right: expr.right ? substituteExpr(expr.right, pm) : undefined };
                }
              }
              return { ...expr, right: expr.right ? substituteExpr(expr.right, pm) : undefined };
            }
            return expr;
          };
          const substituteChild = (c: Child, pm: Map<string, string>): Child => {
            if (c.kind === "expr") return { ...c, expression: substituteExpr(c.expression, pm) };
            if (c.kind === "assign_stmt") return { ...c, expression: substituteExpr(c.expression, pm) as Expression };
            if (c.kind === "return" && (c as ReturnStmt).expression) return { ...c, expression: substituteExpr((c as ReturnStmt).expression!, pm) } as Child;
            if (c.kind === "if") {
              const ib = c as IfBlock;
              return { ...ib, condition: substituteExpr(ib.condition, pm), body: ib.body.map(bc => substituteChild(bc, pm)), elseBody: ib.elseBody?.map(bc => substituteChild(bc, pm)) };
            }
            if (c.kind === "for") {
              const fl = c as ForLoop;
              return { ...fl, body: fl.body.map(bc => substituteChild(bc, pm)) };
            }
            if (c.kind === "use") {
              const u = c as CompUse;
              const sa: Attr[] = u.attrs.map(a => {
                if (a.value?.kind === "str") {
                  let raw = a.value.value;
                  if (raw.startsWith("__EXPR__")) {
                    try {
                      const expr: Expression = JSON.parse(raw.substring(8));
                      const substituted = substituteExpr(expr, pm);
                      return { ...a, value: { kind: "str" as const, value: "__EXPR__" + JSON.stringify(substituted) } };
                    } catch {}
                  }
                  if (raw.startsWith("__ACTION_JS__")) {
                    return { ...a, value: { kind: "str" as const, value: raw } };
                  }                  
                  if (raw.startsWith("__MULTI_EXPR__")) {
                    try {
                      const exprs: Expression[] = JSON.parse(raw.substring("__MULTI_EXPR__".length));
                      const substituted = exprs.map(e => substituteExpr(e, pm));
                      return { ...a, value: { kind: "str" as const, value: "__MULTI_EXPR__" + JSON.stringify(substituted) } };
                    } catch {}
                  }
                  for (const [pn, pv] of pm) {
                    if (pv.startsWith("__LIT__")) raw = raw.replace(new RegExp(`\\b${pn}\\b`, 'g'), pv.slice(7));
                    if (pv.startsWith("__VAR__")) raw = raw.replace(new RegExp(`\\b${pn}\\b`, 'g'), pv.slice(7));
                  }
                  return { ...a, value: { kind: "str" as const, value: raw } };
                }
                return a;
              });
              return { ...u, attrs: sa, children: u.children.map(cc => substituteChild(cc, pm)) };
            }
            return c;
          };
          return fnDef.body.map(c => renderChild(substituteChild(c, localParams), ctx, localParams, depth + 1)).join("");
        }
      }
      if (child.expression.kind === "expr_ref" && child.expression.exprId !== undefined) {
        return `<span class="sinth-expr" data-expr-id="${child.expression.exprId}"></span>`;
      }
      if (child.expression.kind === "literal" && child.expression.value) {
        return esc(litToString(child.expression.value));
      }
      if (child.expression.kind === "variable" && child.expression.name && !ctx.loopVars?.has(child.expression.name)) {
        const exprId = registerExpr(ctx, child.expression);
        return `<span class="sinth-expr" data-expr-id="${exprId}"${ctx.diffingEnabled ? ` data-sinth-deps="${exprDeps(child.expression, ctx.declaredVars ?? new Set())}"` : ""}></span>`;
      }
      let expr = child.expression;
      if (params.size > 0) {
        expr = substituteParamsInExpr(expr, params);
      }
      const exprId = registerExpr(ctx, expr);
      return `<span class="sinth-expr" data-expr-id="${exprId}"${ctx.diffingEnabled ? ` data-sinth-deps="${exprDeps(child.expression, ctx.declaredVars ?? new Set())}"` : ""}></span>`;
    }

    case "assign_stmt": {
      ctx.logicBlocks.push(compileExprToJS(child.expression, undefined, ctx.namespace, ctx.declaredVars) + ";");
      return "";
    }

    case "remove": {
      return `<span data-sinth-remove="${esc((child as RemoveStmt).target)}"></span>`;
    } 

    case "return":
      return "";    

    case "var":
      return "";

    case "if":
      return renderIfBlock(child, ctx, params, depth);

    case "for": {
      const loopVars = new Set<string>();
      loopVars.add(child.itemVar);
      if (child.keyVar) loopVars.add(child.keyVar);
      if (child.indexVar) loopVars.add(child.indexVar);
      const prev = ctx.loopVars;
      ctx.loopVars = loopVars;
      const bodyHTML = child.body.map(c => renderChild(c, ctx, params, depth + 1)).join("");
      ctx.loopVars = prev;
      const keyAttr = child.keyVar ? ` data-sinth-key="${escAttr(child.keyVar)}"` : "";
      const idxAttr = child.indexVar ? ` data-sinth-index="${escAttr(child.indexVar)}"` : "";
      return (
        `<template data-sinth-for="${escAttr(child.arrayVar)}" data-sinth-item="${escAttr(child.itemVar)}"${keyAttr}${idxAttr}>${bodyHTML}</template>`
      );
    }

    case "use":
      return renderCompUse(child, ctx, params, depth);

    case "component_expr":
      return child.children.map(c => renderChild(c, ctx, params, depth + 1)).join("");
  }
}

export function renderIfBlock(
ifBlock: IfBlock,
ctx:     CompileCtx,
params:  Map<string, string>,
depth:   number,
): string {
  if (depth > 64) throw new SinthError("Maximum if-block nesting depth (64) exceeded.", ifBlock.loc);

  const condJS = compileExprToJS(ifBlock.condition, undefined, ctx.namespace, ctx.declaredVars);
  const allChildren  = [...ifBlock.body, ...(ifBlock.elseBody ?? [])];
  const hasAssign = allChildren.some(c => c.kind === "assign_stmt");
  const hasComp = allChildren.some(c => c.kind === "use");

  if (!hasAssign && !hasComp) {
    const tplId = ctx.ifIdCounter++;
    const condId = registerExpr(ctx, ifBlock.condition);
    const bodyHTML = ifBlock.body.map(c => renderChild(c, ctx, params, depth + 1)).join("");
    const elseHTML = (ifBlock.elseBody ?? []).map(c => renderChild(c, ctx, params, depth + 1)).join("");
    const persistAttr = ifBlock.persist ? ` data-sinth-if-persist="true"` : "";
    return (
      `<template data-sinth-if-id="${tplId}" data-sinth-if-expr="${condId}"${persistAttr}>${bodyHTML}</template>` +
      (elseHTML ? `<template data-sinth-else data-sinth-if-id="${tplId}">${elseHTML}</template>` : "")
    );
  }

  // pure logic
  if (hasAssign && !hasComp) {
    ctx.logicBlocks.push(compileIfToJS(ifBlock));
    return "";
  }

  // pure DOM (components need replace/persist/delay handling)
  if (!hasAssign && hasComp) {
    const tplId = ctx.ifIdCounter++;
    const condId = registerExpr(ctx, ifBlock.condition);
    const bodyHTML = ifBlock.body.map(c => renderChild(c, ctx, params, depth + 1)).join("");
    const elseHTML = (ifBlock.elseBody ?? []).map(c => renderChild(c, ctx, params, depth + 1)).join("");
    let replaceAttr = "";
    const hasStatefulComp = ifBlock.body.some(c => {
      if (c.kind !== "use") return false;
      const u = c as CompUse;
      if (u.name === "__IF_ROOT__") return false;
      if (ctx.customEls.has(u.name)) return true;
      return u.attrs.some(a => a.name === "bind" || a.name === "model" || a.name === "fullscreenSync");
    }) || (ifBlock.elseBody ?? []).some(c => {
      if (c.kind !== "use") return false;
      const u = c as CompUse;
      if (u.name === "__IF_ROOT__") return false;
      if (ctx.customEls.has(u.name)) return true;
      return u.attrs.some(a => a.name === "bind" || a.name === "model" || a.name === "fullscreenSync");
    });
    let persistAttr = (ifBlock.persist || hasStatefulComp) ? ` data-sinth-if-persist="true"` : "";
    const firstComp = ifBlock.body.find(c => c.kind === "use") as CompUse | undefined;
    if (firstComp) {
      const idAttr = firstComp.attrs.find(a => a.name === "id");
      const replAttr = firstComp.attrs.find(a => a.name === "replace");
      const wantsReplace = replAttr && (replAttr.value === null || (replAttr.value?.kind === "bool" && replAttr.value.value));
      if (idAttr && idAttr.value?.kind === "str" && wantsReplace) {
        replaceAttr = ` data-sinth-if-replace="${escAttr(idAttr.value.value)}"`;
      }
    }
    let delayAttr = "";
    let delayHideAttr = "";
    if (firstComp) {
      const delayA = firstComp.attrs.find(a => a.name === "delay");
      const hideA = firstComp.attrs.find(a => a.name === "hide");
      if (delayA && hideA && hideA.value && (hideA.value as any).kind === "bool" && !(hideA.value as any).value) {
        if (delayA.value?.kind === "num") {
          delayAttr = ` data-sinth-if-delay="${delayA.value.value}"`;
        } else if (delayA.value?.kind === "str") {
          const v = litToString(delayA.value);
          if (/^\d+$/.test(v)) delayAttr = ` data-sinth-if-delay="${v}"`;
        }
        delayHideAttr = ` data-sinth-if-delay-hide="false"`;
      }
    }
    let elseDelayAttr = "";
    let elseDelayHideAttr = "";
    const elseFirstComp = (ifBlock.elseBody ?? []).find(c => c.kind === "use") as CompUse | undefined;
    if (elseFirstComp) {
      const delayA = elseFirstComp.attrs.find(a => a.name === "delay");
      const hideA = elseFirstComp.attrs.find(a => a.name === "hide");
      if (delayA && hideA && hideA.value && (hideA.value as any).kind === "bool" && !(hideA.value as any).value) {
        if (delayA.value?.kind === "num") {
          elseDelayAttr = ` data-sinth-if-delay="${delayA.value.value}"`;
        } else if (delayA.value?.kind === "str") {
          const v = litToString(delayA.value);
          if (/^\d+$/.test(v)) elseDelayAttr = ` data-sinth-if-delay="${v}"`;
        }
        elseDelayHideAttr = ` data-sinth-if-delay-hide="false"`;
      }
    }
    return (
      `<template data-sinth-if-id="${tplId}" data-sinth-if-expr="${condId}"${replaceAttr}${delayAttr}${delayHideAttr}${persistAttr}>${bodyHTML}</template>` +
      (elseHTML ? `<template data-sinth-else data-sinth-if-id="${tplId}"${elseDelayAttr}${elseDelayHideAttr}>${elseHTML}</template>` : "")
    );
  }

  // mixed
  const id = `__sm${ctx.mixedCounter++}__`;

  const ifAssignJS = ifBlock.body
    .filter(c => c.kind === "assign_stmt")
    .map(c => {
      const e = (c as AssignStmt).expression;
      const js = compileExprToJS(e, undefined, ctx.namespace, ctx.declaredVars);
      let bump = "";
      if (ctx.diffingEnabled && e.kind === "assign" && e.target) {
        bump = `;window._bump&&window._bump('${e.target.replace(/'/g, "\\'")}')`;
      }
      return `  ${js};${bump}`;
    })
    .join("\n");

  const ifHTML = ifBlock.body
    .filter(c => c.kind !== "assign_stmt")
    .map(c => renderChild(c, ctx, params, depth + 1))
    .join("");

  const elseAssignJS = (ifBlock.elseBody ?? [])
    .filter(c => c.kind === "assign_stmt")
    .map(c => {
      const e = (c as AssignStmt).expression;
      const js = compileExprToJS(e, undefined, ctx.namespace, ctx.declaredVars);
      let bump = "";
      if (ctx.diffingEnabled && e.kind === "assign" && e.target) {
        bump = `;window._bump&&window._bump('${e.target.replace(/'/g, "\\'")}')`;
      }
      return `  ${js};${bump}`;
    })
    .join("\n");

  const elseHTML = (ifBlock.elseBody ?? [])
    .filter(c => c.kind !== "assign_stmt")
    .map(c => renderChild(c, ctx, params, depth + 1))
    .join("");

  let replaceId: string | undefined;
  const ifFirstComp = ifBlock.body.find(c => c.kind === "use") as CompUse | undefined;
  const elseFirstComp = (ifBlock.elseBody ?? []).find(c => c.kind === "use") as CompUse | undefined;
  if (ifFirstComp) {
    const ifId = ifFirstComp.attrs.find(a => a.name === "id")?.value;
    const ifReplace = ifFirstComp.attrs.find(a => a.name === "replace");
    const ifReplaceVal = ifReplace?.value;
    const ifWantsReplace = ifReplace && (ifReplaceVal === null || (ifReplaceVal?.kind === "bool" && ifReplaceVal.value));
    
    if (ifId && ifId.kind === "str" && ifWantsReplace) {
      if (elseFirstComp) {
        const elseId = elseFirstComp.attrs.find(a => a.name === "id")?.value;
        const elseReplace = elseFirstComp.attrs.find(a => a.name === "replace");
        const elseReplaceVal = elseReplace?.value;
        const elseWantsReplace = elseReplace && (elseReplaceVal === null || (elseReplaceVal?.kind === "bool" && elseReplaceVal.value));
        
        if (elseId && elseId.kind === "str" && elseId.value === ifId.value && elseWantsReplace) {
          replaceId = ifId.value;
        }
      }
    }
  }

  const condId = registerExpr(ctx, ifBlock.condition);
  
  const hasFullscreen = ifHTML.includes("data-sinth-fullscreen") || elseHTML.includes("data-sinth-fullscreen");
  
  ctx.mixedBlocks.push({ id, conditionJS: String(condId), ifJS: ifAssignJS, ifHTML, elseJS: elseAssignJS, elseHTML, replaceId });

  if (hasFullscreen) {
    return `<span id="${replaceId || id}" data-sinth-mixed data-sinth-mixed-fullscreen="${condId}"></span>`;
  }
  return `<span id="${replaceId || id}" data-sinth-mixed></span>`;
}

export function renderCompUse(
  use:    CompUse,
  ctx:    CompileCtx,
  params: Map<string, string>,
  depth:  number,
): string {
  const renderFn = ctx.namespace ? "sinthRender_" + ctx.namespace : "sinthRender";
  if (use.name === "__IF_ROOT__") {
    return use.children.map(c => renderChild(c, ctx, params, depth)).join("");
  }


  if (use.name === "RawHTML") {
    const ca = use.attrs.find(a => a.name === "content");
    if (!ca || !ca.value) return "";
    return interpolateAttr(litToString(ca.value), params);
  }

  // user-defined component
  const userDef = ctx.allDefs.get(use.name);
  if (userDef) return expandUserComp(use, userDef, ctx, params, depth + 1);

  // custom element
  // const customEl = ctx.customEls.get(use.name);
  // if (customEl) {
  //  const attrParts = [`data-s="${ctx.scopeHash}"`];
  //  for (const attr of use.attrs) {
  //    if (attr.name === "bind" || attr.name === "model") continue;
  //    const r = renderAttr(attr, params, ctx);
  //    if (r) attrParts.push(r);
  //  }
  //  const inner = use.children.map(c => renderChild(c, ctx, params, depth + 1)).join("");
  //  return `<${customEl.tagName} ${attrParts.join(" ")}>${inner}</${customEl.tagName}>`;
  // }

  // built-in component
  const { tag, defaultClass, voidEl } = resolveBuiltinTag(use.name, use.attrs);
  const isVoid = voidEl || VOID_TAGS.has(tag);

  let attrParts: string[] = [`data-s="${ctx.scopeHash}"`];
  let userClass: string | undefined;
  const inlineStyleParts: string[] = [];

  for (const attr of use.attrs) {
    if (attr.name === "level" && use.name === "Heading") continue;

    if (INLINE_STYLE_PROPS.has(attr.name) && attr.value) {
      if (attr.value.kind === "str" && attr.value.value.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(attr.value.value.substring(8));
          const exprId = registerExpr(ctx, expr);
          inlineStyleParts.push(`${camelToKebab(attr.name)}:__EXPR__${exprId}`);
        } catch {
          inlineStyleParts.push(`${camelToKebab(attr.name)}: ${interpolateAttr(attr.value.value, params)}`);
        }
      } else {
        const val = attr.value.kind === "str"
          ? interpolateAttr(attr.value.value, params)
          : litToString(attr.value);
        inlineStyleParts.push(`${camelToKebab(attr.name)}: ${val}`);
      }
      continue;
    }

    if (attr.name === "class") {
      if (attr.value?.kind === "str") userClass = interpolateAttr(attr.value.value, params);
      continue;
    }
    if (use.name === "Checkbox" && (attr.name === "checked" || attr.name === "onChange" || attr.name === "label")) continue;
    if (attr.name === "hide") {
      const rendered = renderAttr(attr, params, ctx);
      if (rendered) attrParts.push(rendered);
      continue;
    }
    const rendered = renderAttr(attr, params, ctx);
    if (rendered) attrParts.push(rendered);
  }

  const classes = [defaultClass, userClass].filter(Boolean).join(" ");
  if (classes) attrParts.push(`class="${escAttr(classes)}"`);
  if (inlineStyleParts.length > 0) {
    const staticParts: string[] = [];
    const exprParts: string[] = [];
    for (const p of inlineStyleParts) {
      if (p.includes(':__EXPR__')) {
        exprParts.push(p.replace('__EXPR__', ''));
      } else {
        staticParts.push(p);
      }
    }
    if (staticParts.length > 0) attrParts.push(`style="${escAttr(staticParts.join("; "))}"`);
    if (exprParts.length > 0) attrParts.push(`data-sinth-style="${escAttr(exprParts.join(";"))}"`);
  }
  if (tag === "button" && !use.attrs.some(a => a.name === "type")) attrParts.push(`type="button"`);
  
  const delayAttrVal = use.attrs.find(a => a.name === "delay");
  if (delayAttrVal) {
    const delayMs = delayAttrVal.value?.kind === "num" ? delayAttrVal.value.value : 1000;
    const eventNames = ["onClick", "onChange", "onInput", "onSubmit"];
    let hasEvent = false;
    for (const en of eventNames) {
      const evName = en.toLowerCase();
      const idx = attrParts.findIndex(p => p.startsWith(evName + "="));
      if (idx >= 0) {
        hasEvent = true;
        const current = attrParts[idx];
        const match = current.match(/\(function\(\)\{\s*(.+?);\s*sinthRender\(\)/);
        if (match) {
          const action = match[1];
          const qid = `__sq${ctx.ifIdCounter++}`;
          const hideAttr = use.attrs.find(a => a.name === "hide");
          const hideVal = hideAttr
            ? (hideAttr.value === null
                ? true
                : (hideAttr.value.kind === "bool"
                    ? hideAttr.value.value
                    : (hideAttr.value.kind === "str" && hideAttr.value.value !== "false")))
            : true;
          ctx.actionButtons.push({ qid, delayMs, hide: hideVal });
          const delayIdx = attrParts.findIndex(p => p.startsWith("data-sinth-delay"));
          if (delayIdx >= 0) attrParts.splice(delayIdx, 1);
          const hideIdx = attrParts.findIndex(p => p.startsWith("data-sinth-delay-hide"));
          if (hideIdx >= 0) attrParts.splice(hideIdx, 1);
          const doneIdx = attrParts.findIndex(p => p.startsWith("data-sinth-delay-done"));
          if (doneIdx >= 0) attrParts.splice(doneIdx, 1);
          attrParts.push(`data-sinth-queue-id="${qid}"`);
          if (hideVal) {
            attrParts.push(`style="display:none"`);
          }
          attrParts[idx] = `${evName}="${escAttr(`(function(e){ var el=document.querySelector('[data-sinth-queue-id=${qid}]'); if(!el)return; var hide=${hideVal}; if(hide)el.style.display='none'; var q=window._sinthQ=q||{}; var sq=q.${qid}=q.${qid}||[]; sq.push(function(){ if(hide)el.style.display=''; ${action}; ${renderFn}(); }); if(sq.length===1){ (function p(first){ if(!sq||sq.length===0){delete q.${qid};return;} var a=sq[0]; sq.shift(); var d=first?${delayMs}:0; setTimeout(function(){ a(); if(sq.length>0)setTimeout(function(){p(false)},${delayMs}); },d); })(true); } })()`)}"`;
        }
      }
    }
    if (!hasEvent) {
      if (use.attrs.some(a => a.name === "hide")) {
        const hideAttr = use.attrs.find(a => a.name === "hide")!;
        const hideVal = hideAttr.value;
        const isHidden = (hideVal === null) ||
                         (hideVal?.kind === "bool" && hideVal.value) ||
                         (hideVal?.kind === "str" && hideVal.value !== "false");
        attrParts.push(`data-sinth-delay-hide="${isHidden ? "true" : "false"}"`);
        if (!isHidden) {
          attrParts.push(`data-sinth-delay-done="1"`);
        }
      } else {
        attrParts.push(`data-sinth-delay-hide="true"`);
      }
    }
  }
  if (use.name === "Input") {
    const bindAttr = use.attrs.find(a => a.name === "bind");
    const modelAttr = use.attrs.find(a => a.name === "model");
    const bindOrModel = bindAttr || modelAttr;
    if (bindOrModel?.value?.kind === "str") {
      let vName = bindOrModel.value.value;
      if (vName.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(vName.substring(8));
          if (expr.kind === "variable" && expr.name) vName = expr.name;
        } catch {}
      }
      const varDecl = ctx.varDecls?.find(v => v.name === vName);
      if (!use.attrs.some(a => a.name === "type")) {
        if (varDecl && varDecl.varType === "int") {
          attrParts.push(`type="number"`);
        } else {
          attrParts.push(`type="text"`);
        }
      }
      if (varDecl && varDecl.varType === "int" && !use.attrs.some(a => a.name === "step")) {
        attrParts.push(`step="1"`);
      }
      const rhs = (varDecl && varDecl.varType === "int")
        ? `Number(e.target.value) || 0`
        : `e.target.value`;
      const initialVal = varDecl?.value ? litToString(varDecl.value).replace(/"/g, '&quot;') : "";
      let resolvedName = vName;
      if (ctx.scopePrefix && ctx.scopeVar && ctx.varDecls?.some(v => v.name === vName)) {
        resolvedName = `${ctx.scopePrefix}${vName}`;
      }
      if (ctx.namespace) resolvedName = ctx.namespace + "_" + resolvedName;
      const renderCall = ctx.scopeVar ? `${ctx.scopeVar}._render()` : renderFn + "()";
      const handlerBody = `${resolvedName} = ${rhs}; ${renderCall}`;
      if (ctx.scopePrefix) {
        attrParts.push(emitCEAction(ctx, 'input', handlerBody));
      } else {
        attrParts.push(`oninput="(function(e){ ${handlerBody} })(event)"`);
      }
      attrParts.push(`value="${escAttr(initialVal)}"`);
      const valueExprId = registerExpr(ctx, { kind: "variable", name: vName });
      attrParts.push(`data-sinth-value="${valueExprId}"`);
    }
  }
  if (use.name === "Checkbox") {
    if (!use.attrs.some(a => a.name === "type")) attrParts.push(`type="checkbox"`);
    
    const checkedAttr = use.attrs.find(a => a.name === "checked");
    const onChangeAttr = use.attrs.find(a => a.name === "onChange");
    
    // Resolve bound variable name (same pattern as Input's bind/model)
    let boundVarName: string | null = null;
    if (checkedAttr && checkedAttr.value?.kind === "str") {
      let raw = checkedAttr.value.value;
      if (raw.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(raw.substring(8));
          if (expr.kind === "variable" && expr.name) {
            boundVarName = expr.name;
          }
        } catch {}
      } else if (raw.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        boundVarName = raw;
      }
    }
    
    let resolvedName = boundVarName;
    if (resolvedName && ctx.scopePrefix && ctx.scopeVar && ctx.varDecls?.some(v => v.name === resolvedName)) {
      resolvedName = `${ctx.scopePrefix}${resolvedName}`;
    }
    if (resolvedName && ctx.namespace) resolvedName = ctx.namespace + "_" + resolvedName;
    
    if (checkedAttr && checkedAttr.value) {
      if (checkedAttr.value.kind === "bool") {
        if (checkedAttr.value.value) attrParts.push(`checked`);
      } else if (checkedAttr.value.kind === "str" && boundVarName) {
        const checkedExprId = registerExpr(ctx, { kind: "variable", name: boundVarName });
        attrParts.push(`data-sinth-checked="${checkedExprId}"`);
      }
    }
    
    if (onChangeAttr && onChangeAttr.value?.kind === "str") {
      let raw = onChangeAttr.value.value;
      if (raw.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(raw.substring(8));
          const jsExpr = compileExprToJS(expr, undefined, ctx.namespace, ctx.declaredVars);
          attrParts.push(`onchange="(function(){ ${jsExpr}; ${renderFn}(); })(event)"`);
        } catch {}
      } else {
        attrParts.push(`onchange="${escAttr(raw)};${renderFn}()"`);
      }
    } else if (!onChangeAttr && resolvedName) {
      attrParts.push(`onchange="(function(e){ ${resolvedName} = e.target.checked; ${renderFn}(); })(event)"`);
    }
    
    const labelAttr = use.attrs.find(a => a.name === "label");
    const labelText = labelAttr?.value?.kind === "str" ? esc(interpolateAttr(labelAttr.value.value, params)) : "";
    
    if (labelText) {
      const checkAttrStr = attrParts.length ? " " + attrParts.join(" ") : "";
      return `<label data-s="${ctx.scopeHash}"><input${checkAttrStr}> ${labelText}</label>`;
    }
  }
  
  attrParts = attrParts.filter(p => !p.startsWith("bind="));
  const attrStr = attrParts.length ? " " + attrParts.join(" ") : "";

  if (isVoid) {
    if (use.children.length > 0) SinthWarning.emit(`<${tag}> is void and cannot have children.`, use.loc);
    return `<${tag}${attrStr}>`;
  }

  const inner = use.children.map(c => renderChild(c, ctx, params, depth + 1)).join("");
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

export function expandUserComp(
  use:    CompUse,
  def:    CompDef,
  ctx:    CompileCtx,
  params: Map<string, string>,
  depth:  number,
): string {
  if (use.name === def.name && depth > 4) {
    throw new SinthError(`Recursive component '${def.name}' is not allowed.`, use.loc);
  }

  const local = new Map<string, string>();

  for (const p of def.params) {
    if (p.defaultVal !== undefined) local.set(p.name, litToString(p.defaultVal));
  }

  for (const attr of use.attrs) {
    if (attr.value === null) {
      local.set(attr.name, "true");
    } else if (attr.value.kind !== "null") {
      const raw = litToString(attr.value);
      if (raw.startsWith("__EXPR__")) {
        local.set(attr.name, raw);
      } else {
        local.set(attr.name, attr.value.kind === "str" ? interpolateAttr(raw, params) : raw);
      }
    }
  }

  for (const p of def.params) {
    if (!local.has(p.name)) {
      throw new SinthError(
        `Component '${def.name}' requires parameter '${p.name}' but it was not provided.`,
        use.loc,
      );
    }
  }

  const slotHTML = use.children.map(c => renderChild(c, ctx, params, depth)).join("");
  local.set("slot", "__RAW__" + slotHTML);

  for (const block of def.styles) {
    ctx.extraCSS.push(processStyleBlock(block, ctx.scopeHash, local));
  }

  return def.body.map(c => renderChild(c, ctx, local, depth)).join("");
}



export function collectScripts(
  file:    SinthFile,
  allDefs: Map<string, CompDef>,
): { componentScripts: string[]; pageScripts: { raw: string; attrs: Record<string, string> }[] } {
  const componentScripts: string[] = [];
  const pageScripts: { raw: string; attrs: Record<string, string> }[] = [];
  const seenFunctions = new Set<string>();

  for (const [, def] of allDefs) {
    for (const block of def.scripts) {
      for (const fn of extractFunctionNames(block.raw)) {
        if (seenFunctions.has(fn)) throw new SinthError(`Function '${fn}' defined in multiple component scripts.`);
        seenFunctions.add(fn);
      }
      componentScripts.push(`(function(){\n${block.raw}\n})();`);
    }
  }

  for (const block of file.scripts) {
    for (const fn of extractFunctionNames(block.raw)) {
      if (seenFunctions.has(fn)) throw new SinthError(`Function '${fn}' conflicts with a component script.`);
      seenFunctions.add(fn);
    }
    pageScripts.push({ raw: block.raw, attrs: block.attrs });
  }

  return { componentScripts, pageScripts };
}

export function extractFunctionNames(js: string): string[] {
  const names: string[] = [];
  const re = /^\s*(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) names.push(m[1]);
  return names;
}




// sinth runtime


export function buildRuntime(opts: {
  varDecls:     VarDeclaration[];
  bodyHTML:     string;
  logicBlocks:  string[];
  mixedBlocks:  MixedBlockEntry[];
  assignedVars: Set<string>;
  exprRegistry: string[];
  sharedRuntime: boolean;
  functionsJS:  string;
  namespace?:   string;
  declaredVars?: Set<string>;
}): string | { page: string; shared: string } {
  
  const { varDecls, bodyHTML, logicBlocks, mixedBlocks, assignedVars, exprRegistry, functionsJS } = opts;
  const ns = opts.namespace ? "_" + opts.namespace : "";
  const renderFn = "sinthRender" + ns;
  const needsMixed  = mixedBlocks.length > 0;
  const needsExpr   = bodyHTML.includes("sinth-expr") || needsMixed;
  const needsIf     = bodyHTML.includes("data-sinth-if") || needsMixed;
  const needsFor    = bodyHTML.includes("data-sinth-for") || bodyHTML.includes("data-sinth-for-expr");  const needsDelay  = bodyHTML.includes("data-sinth-delay") || bodyHTML.includes("data-sinth-delay-expr-id") || mixedBlocks.some(mb => mb.ifHTML.includes("data-sinth-delay") || mb.ifHTML.includes("data-sinth-delay-expr-id") || mb.elseHTML.includes("data-sinth-delay") || mb.elseHTML.includes("data-sinth-delay-expr-id"));
  const needsLogic  = logicBlocks.length > 0;
  const needsFullscreen = bodyHTML.includes("data-sinth-fullscreen");
  const needsFullscreenSync = bodyHTML.includes("data-sinth-fullscreen-sync");
  const needsRender = needsExpr || needsIf || needsFor || needsMixed || needsLogic || bodyHTML.includes("data-sinth-hide") || needsFullscreen || needsFullscreenSync || needsDelay;

  const varLines = varDecls.map(v => {
    const vn = ns ? ns.slice(1) + "_" + v.name : v.name;
    if (!v.value) {
      if (!assignedVars.has(v.name)) {
        const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]" };
        SinthWarning.emit(
          `Variable '${v.name}' is declared but never assigned. Defaulting to ${defaults[v.varType] ?? "undefined"}.`,
          v.loc,
        );
      }
      const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]" };
      return `var ${vn} = ${defaults[v.varType] ?? "undefined"};`;
    }
    const val = litToString(v.value);
    if (val.startsWith("__VAR__")) return `var ${vn} = ${val.slice(7)};`;
    if (val.startsWith("__ARR__")) return `var ${vn} = ${val.slice(7)};`;
    if (val.startsWith("__EXPR__")) {
      try {
        const expr: Expression = JSON.parse(val.substring(8));
        const js = compileExprToJS(expr, undefined, opts.namespace, opts.declaredVars);
        const id = exprRegistry.length;
        exprRegistry.push(js);
        return `var ${vn} = __X${ns}[${id}]({});`;
      } catch { return `var ${vn} = ${val};`; }
    }
    if (v.varType === "obj") return `var ${vn} = ${val};`;
    if (v.varType === "str")  return `var ${vn} = ${JSON.stringify(val)};`;
    if (v.varType === "str[]" && typeof val === 'string' && val.startsWith("__ARR__")) {
      try {
        const arr = JSON.parse(val.slice(7));
        return `var ${vn} = ${JSON.stringify(arr)};`;
      } catch { return `var ${vn} = ${val.slice(7)};`; }
    }
    return `var ${vn} = ${val};`;
  }).join("\n");

  const memoVars = new Set<string>();
  for (const lb of logicBlocks) {
    let matches = lb.match(/_memo_(\w+)/g);
    if (matches) matches.forEach(m => memoVars.add(m));
    matches = lb.match(/_memo_(\w+)_done/g);
    if (matches) matches.forEach(m => memoVars.add(m));
  }
  for (const e of exprRegistry) {
    let matches = e.match(/_memo_(\w+)/g);
    if (matches) matches.forEach(m => memoVars.add(m));
  }
  const memoVarDecls = [...memoVars].map(m => `var ${m};`).join("\n");

  if (!needsRender) {
    const out = [varLines, memoVarDecls].filter(Boolean).join("\n");
    return out ? `// Sinth compiled runtime\n${out}` : "";
  }


  const helpers = generateHelpers({ needsExpr, needsIf, needsFor, needsDelay, needsMixed, ns });

  const exprVarUpdates = varDecls
    .filter(v => v.value && litToString(v.value).startsWith("__EXPR__"))
    .map(v => {
      try {
        const expr: Expression = JSON.parse(litToString(v.value!).substring(8));
        const js = compileExprToJS(expr, undefined, opts.namespace, opts.declaredVars);
        const idx = exprRegistry.indexOf(js);
        const vn2 = ns ? ns.slice(1) + "_" + v.name : v.name;
        return `${vn2} = __X${ns}[${idx}]({});`;
      } catch { return ""; }
    })
    .filter(Boolean)
    .join("\n    ");

  const renderBody = buildRenderBody({
    bodyHTML, logicBlocks, mixedBlocks,
    needsLogic, needsMixed, needsIf, needsFor, needsExpr, needsDelay,
    exprVarUpdates: exprVarUpdates || undefined,
    ns
  });

  let forDataJS = "";
  let forSyncBlock = "";
  if (needsFor) {
    const forArrays = new Set<string>();
    const forRegex = /data-sinth-for="([^"]+)"/g;
    let m;
    while ((m = forRegex.exec(bodyHTML)) !== null) {
      forArrays.add(m[1]);
    }
    if (forArrays.size > 0) {
      forDataJS = `var _sinthForData = {};\n`;
      forSyncBlock = [...forArrays].map(v => {
        const bare = v.replace(/&quot;/g, '"');
        const namespaced = opts.namespace ? opts.namespace + "_" + bare : bare;
        return `_sinthForData['${bare}'] = ${namespaced};`;
      }).join("\n    ") + "\n    ";
    }
  }

  const exprArrayJS = exprRegistry.length > 0
    ? `let __X${ns} = [${exprRegistry.map((js) => `function(_ctx){ return ${js}; }`).join(",")}];\n`
    : "";

  let renderFunc = '';
  if (needsRender) {
    renderFunc = `function ${renderFn}() {\n    ${forSyncBlock}${renderBody.replace(/^/gm, "  ")}\n}\n${renderFn}();`;
  }

  if (needsFullscreenSync) {
    renderFunc += `
(function() {
  let syncedEls = document.querySelectorAll('[data-sinth-fullscreen-sync]');
  if (syncedEls.length > 0) {
    let vars = [];
    syncedEls.forEach(function(el) { vars.push(el.dataset.sinthFullscreenSync); });
    document.addEventListener('fullscreenchange', function() {
      let state = !!document.fullscreenElement;
      vars.forEach(function(varName) { 
        switch(varName) {
          ${[...new Set(varDecls.filter(v => v.name).map(v => {
            const vn3 = ns ? ns.slice(1) + "_" + v.name : v.name;
            return `case '${v.name}': ${vn3} = state; break;`;
          }))].join('\n          ')}
        }
      });
      ${renderFn}();
    });
  }
})();`;
  }

  const pageCode = `// Sinth Page Runtime
${forDataJS}
${exprArrayJS}
${memoVarDecls}
${varLines}
${renderFunc}`;
  if (opts.sharedRuntime && helpers.trim()) {
    const sharedCode = `// Sinth shared runtime
${helpers}`;
    return { page: pageCode, shared: sharedCode };
  }

  return `// Sinth compiled runtime
${forDataJS}
${functionsJS ? functionsJS + "\n" : ""}${helpers}
${exprArrayJS}
${memoVarDecls}
${varLines}
${renderFunc}`;
}