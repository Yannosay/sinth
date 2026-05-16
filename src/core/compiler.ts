import * as path from "path";
import * as fs from "fs";
import { Loc, Literal, Expression, Child, Attr, CompUse, IfBlock, ForLoop, RemoveStmt, ReturnStmt, StyleBlock, CompDef, ParamDecl, VarDeclaration, SinthFile, CompileCtx, MixedBlockEntry, SinthError, SinthWarning, TT, AssignStmt, MetaEntry } from "./types.ts";
import { Parser } from "./parser.ts";
import { fnv1a, camelToKebab, esc, escAttr, litToString, tagNameToPascal, interpolateAttr, renderText } from "../utils.ts";
import { compileExprToJS, compileIfToJS, bodyToJS } from "./expr.ts";
import { FunctionDef } from "./types.ts";
import { parseFile, resolveImports, ResolverConfig, ResolvedImports } from "../resolver.ts";
import { compileFunctionDef } from "./runtime/functions.ts";
import { generateHelpers } from "./runtime/helpers.ts";
import { buildRenderBody } from "./runtime/render.ts";
import { BUILTIN_MAP, VOID_TAGS, BuiltinInfo } from "./builtins.ts";
import { processStyleBlock } from "./style-processor.ts";
import { buildHeadData, renderHead, HeadData } from "./head-builder.ts";


const EVENT_RE = /^on[A-Z]/;
function eventAttrName(name: string): string | null {
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
  const jsExpr = compileExprToJS(expr, ctx.loopVars);
  const existing = ctx.exprMap.get(jsExpr);
  if (existing !== undefined) return existing;
  const id = ctx.exprRegistry.length;
  ctx.exprRegistry.push(jsExpr);
  ctx.exprMap.set(jsExpr, id);
  return id;
}


export function renderAttr(attr: Attr, paramMap: Map<string, string>, ctx?: CompileCtx): string {
  const { name, value } = attr;
  if (value === null)        return name;
  if (value.kind === "null") return "";
  if (value.kind === "bool") return value.value ? name : "";

if (name === "model" && value?.kind === "str") {
  const vName = interpolateAttr(value.value, paramMap);
  return `oninput="(function(e){ ${vName} = e.target.value; sinthRender(); })(event)" value="${escAttr(vName)}"`;
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

  if (name === "checked") {
    return (value as any)?.kind === "bool" && (value as any).value ? "checked" : "";
  }

  if (value.kind === "num") return `${name}="${value.value}"`;

  let raw = value.value;

  if (raw.startsWith("__MULTI_EXPR__")) {
    const exprJson = raw.substring("__MULTI_EXPR__".length);
    try {
      const exprs: Expression[] = JSON.parse(exprJson);
      const jsExprs = exprs.map(e => compileExprToJS(e)).join("; ");
      const ev = eventAttrName(name);
      if (ev) return `${ev}="(function(){ ${jsExprs.replace(/"/g, "&quot;")}; sinthRender(); })()"`;
      return `${name}="${escAttr(jsExprs)}"`;
    } catch { }
  }
  if (raw.startsWith("__EXPR__")) {
    const exprJson = raw.substring("__EXPR__".length);
    try {
      const expr: Expression = JSON.parse(exprJson);
      const jsExpr = compileExprToJS(expr, ctx?.loopVars);
      const ev = eventAttrName(name);
      if (ev) return `${ev}="(function(){ ${jsExpr.replace(/"/g, "&quot;")}; sinthRender(); })()"`;
      return `${name}="${escAttr(jsExpr)}"`;
    } catch { }
  }

  raw = interpolateAttr(raw, paramMap);

  const ev = eventAttrName(name);
  if (ev) {
    const call = raw.includes("(") ? raw : raw + "()";
    return `${ev}="${escAttr(call)};sinthRender()"`;
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
          return `<span class="sinth-expr" data-expr-id="${exprId}"></span>`;
        }
        if (val.startsWith("__EXPR__")) {
          try {
            const expr: Expression = JSON.parse(val.substring(8));
            const exprId = registerExpr(ctx, expr);
            return `<span class="sinth-expr" data-expr-id="${exprId}"></span>`;
          } catch { return esc(val); }
        }
        return esc(val);
      }
      if (child.expression.kind === "call" && child.expression.callee?.kind === "variable") {
        const fnName = child.expression.callee.name;
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
            }
          }
          const substituteExpr = (expr: Expression, pm: Map<string, string>): Expression => {
            if (expr.kind === "variable" && pm.has(expr.name!)) {
              const pv = pm.get(expr.name!)!;
              if (pv.startsWith("__LIT__")) return { kind: "literal", value: { kind: "str", value: pv.slice(7) } };
              return { kind: "variable", name: pv.slice(7) };
            }
            if (expr.kind === "binary") return { ...expr, left: substituteExpr(expr.left!, pm), right: substituteExpr(expr.right!, pm) };
            if (expr.kind === "unary") return { ...expr, operand: substituteExpr(expr.operand!, pm) };
            if (expr.kind === "call") return { ...expr, callee: substituteExpr(expr.callee!, pm), args: expr.args?.map(a => substituteExpr(a, pm)) };
            if (expr.kind === "index") return { ...expr, object: substituteExpr(expr.object!, pm), key: substituteExpr(expr.key!, pm) };
            if (expr.kind === "assign") return { ...expr, right: expr.right ? substituteExpr(expr.right, pm) : undefined };
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
      if (child.expression.kind === "literal" && child.expression.value) {
        return esc(litToString(child.expression.value));
      }
      if (child.expression.kind === "variable" && child.expression.name && !ctx.loopVars?.has(child.expression.name)) {
        const exprId = registerExpr(ctx, child.expression);
        return `<span class="sinth-expr" data-expr-id="${exprId}"></span>`;
      }
      let expr = child.expression;
      if (params.size > 0) {
        expr = substituteParamsInExpr(expr, params);
      }
      const exprId = registerExpr(ctx, expr);
      return `<span class="sinth-expr" data-expr-id="${exprId}"></span>`;
    }

    case "assign_stmt": {
      ctx.logicBlocks.push(compileExprToJS(child.expression) + ";");
      return "";
    }

    case "remove": {
      return `<span data-sinth-remove="${esc((child as RemoveStmt).target)}"></span>`;
    } 

    case "return":
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

  const condJS = compileExprToJS(ifBlock.condition);
  const allChildren  = [...ifBlock.body, ...(ifBlock.elseBody ?? [])];
  const hasAssign = allChildren.some(c => c.kind === "assign_stmt");
  const hasComp   = allChildren.some(c => c.kind === "use");

  // pure logic
  if (hasAssign && !hasComp) {
    ctx.logicBlocks.push(compileIfToJS(ifBlock));
    return "";
  }

  // pure DOM
  if (!hasAssign && hasComp) {
    const tplId = ctx.ifIdCounter++;
    const condId = registerExpr(ctx, ifBlock.condition);
    const bodyHTML = ifBlock.body.map(c => renderChild(c, ctx, params, depth + 1)).join("");
    const elseHTML = (ifBlock.elseBody ?? []).map(c => renderChild(c, ctx, params, depth + 1)).join("");
    let replaceAttr = "";
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
      `<template data-sinth-if-id="${tplId}" data-sinth-if-expr="${condId}"${replaceAttr}${delayAttr}${delayHideAttr}>${bodyHTML}</template>` +
      (elseHTML ? `<template data-sinth-else data-sinth-if-id="${tplId}"${elseDelayAttr}${elseDelayHideAttr}>${elseHTML}</template>` : "")
    );
  }

  // mixed
  const id = `__sm${ctx.mixedCounter++}__`;

  const ifAssignJS = ifBlock.body
    .filter(c => c.kind === "assign_stmt")
    .map(c => `  ${compileExprToJS((c as AssignStmt).expression)};`)
    .join("\n");

  const ifHTML = ifBlock.body
    .filter(c => c.kind !== "assign_stmt")
    .map(c => renderChild(c, ctx, params, depth + 1))
    .join("");

  const elseAssignJS = (ifBlock.elseBody ?? [])
    .filter(c => c.kind === "assign_stmt")
    .map(c => `  ${compileExprToJS((c as AssignStmt).expression)};`)
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
  ctx.mixedBlocks.push({ id, conditionJS: String(condId), ifJS: ifAssignJS, ifHTML, elseJS: elseAssignJS, elseHTML, replaceId });

  return `<span id="${replaceId || id}" data-sinth-mixed></span>`;
}

export function renderCompUse(
  use:    CompUse,
  ctx:    CompileCtx,
  params: Map<string, string>,
  depth:  number,
): string {
  if (use.name === "__IF_ROOT__") {
    return use.children.map(c => renderChild(c, ctx, params, depth)).join("");
  }

  // RawHTML
  if (use.name === "RawHTML") {
    const ca = use.attrs.find(a => a.name === "content");
    if (!ca || !ca.value) return "";
    return interpolateAttr(litToString(ca.value), params);
  }

  // user-defined component
  const userDef = ctx.allDefs.get(use.name);
  if (userDef) return expandUserComp(use, userDef, ctx, params, depth + 1);

  // custom element
  const customEl = ctx.customEls.get(use.name);
  if (customEl) {
    const attrParts = [`data-s="${ctx.scopeHash}"`];
    for (const attr of use.attrs) {
      const r = renderAttr(attr, params, ctx);
      if (r) attrParts.push(r);
    }
    const inner = use.children.map(c => renderChild(c, ctx, params, depth + 1)).join("");
    return `<${customEl.tagName} ${attrParts.join(" ")}>${inner}</${customEl.tagName}>`;
  }

  // built-in component
  const { tag, defaultClass, voidEl } = resolveBuiltinTag(use.name, use.attrs);
  const isVoid = voidEl || VOID_TAGS.has(tag);

  const attrParts: string[] = [`data-s="${ctx.scopeHash}"`];
  let userClass: string | undefined;
  const inlineStyleParts: string[] = [];

  for (const attr of use.attrs) {
    if (attr.name === "level" && use.name === "Heading") continue;

    if (INLINE_STYLE_PROPS.has(attr.name) && attr.value) {
      const val = attr.value.kind === "str"
        ? interpolateAttr(attr.value.value, params)
        : litToString(attr.value);
      inlineStyleParts.push(`${camelToKebab(attr.name)}: ${val}`);
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
  if (inlineStyleParts.length > 0) attrParts.push(`style="${escAttr(inlineStyleParts.join("; "))}"`);
  if (tag === "button" && !use.attrs.some(a => a.name === "type")) attrParts.push(`type="button"`);
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
      if (!use.attrs.some(a => a.name === "type")) attrParts.push(`type="text"`);
      attrParts.push(`oninput="(function(e){ ${vName} = e.target.value; sinthRender(); })(event)"`);
      attrParts.push(`data-sinth-value="${escAttr(vName)}"`);
    }
  }
  if (use.name === "Checkbox") {
    if (!use.attrs.some(a => a.name === "type")) attrParts.push(`type="checkbox"`);
    
    const checkedAttr = use.attrs.find(a => a.name === "checked");
    if (checkedAttr && checkedAttr.value) {
      if (checkedAttr.value.kind === "bool") {
        if (checkedAttr.value.value) attrParts.push(`checked`);
      } else if (checkedAttr.value.kind === "str") {
        let raw = checkedAttr.value.value;
        if (raw.startsWith("__EXPR__")) {
          try {
            const expr: Expression = JSON.parse(raw.substring(8));
            if (expr.kind === "variable" && expr.name) {
              attrParts.push(`data-sinth-checked="${escAttr(expr.name)}"`);
            } else {
              const exprId = registerExpr(ctx, expr);
              attrParts.push(`data-sinth-checked-expr="${exprId}"`);
            }
          } catch {}
        } else {
          attrParts.push(`data-sinth-checked="${escAttr(raw)}"`);
        }
      }
    }
    
    const onChangeAttr = use.attrs.find(a => a.name === "onChange");
    if (onChangeAttr && onChangeAttr.value?.kind === "str") {
      let raw = onChangeAttr.value.value;
      if (raw.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(raw.substring(8));
          const jsExpr = compileExprToJS(expr);
          attrParts.push(`onchange="(function(){ ${jsExpr}; sinthRender(); })(event)"`);
        } catch {}
      } else {
        attrParts.push(`onchange="${escAttr(raw)};sinthRender()"`);
      }
    } else if (!onChangeAttr && checkedAttr) {
      const raw = checkedAttr.value?.kind === "str" ? checkedAttr.value.value : "";
      if (raw.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(raw.substring(8));
          if (expr.kind === "variable" && expr.name) {
            attrParts.push(`onchange="(function(e){ ${expr.name} = e.target.checked; sinthRender(); })(event)"`);
          }
        } catch {}
      } else if (raw.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        attrParts.push(`onchange="(function(e){ ${raw} = e.target.checked; sinthRender(); })(event)"`);
      }
    }
    
    const labelAttr = use.attrs.find(a => a.name === "label");
    const labelText = labelAttr?.value?.kind === "str" ? esc(interpolateAttr(labelAttr.value.value, params)) : "";
    
    if (labelText) {
      const checkAttrStr = attrParts.length ? " " + attrParts.join(" ") : "";
      return `<label data-s="${ctx.scopeHash}"><input${checkAttrStr}> ${labelText}</label>`;
    }
  }

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
}): string | { page: string; shared: string } {
  const { varDecls, bodyHTML, logicBlocks, mixedBlocks, assignedVars, exprRegistry, functionsJS } = opts;

  const needsExpr   = bodyHTML.includes("sinth-expr");
  const needsIf     = bodyHTML.includes("data-sinth-if");
  const needsFor    = bodyHTML.includes("data-sinth-for");
  const needsDelay  = bodyHTML.includes("data-sinth-delay") || bodyHTML.includes("data-sinth-delay-expr-id") || mixedBlocks.some(mb => mb.ifHTML.includes("data-sinth-delay") || mb.ifHTML.includes("data-sinth-delay-expr-id") || mb.elseHTML.includes("data-sinth-delay") || mb.elseHTML.includes("data-sinth-delay-expr-id"));
  const needsMixed  = mixedBlocks.length > 0;
  const needsLogic  = logicBlocks.length > 0;
  const needsRender = needsExpr || needsIf || needsFor || needsMixed || needsLogic || bodyHTML.includes("data-sinth-hide");

  const varLines = varDecls.map(v => {
    if (!v.value) {
      if (!assignedVars.has(v.name)) {
        const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]" };
        SinthWarning.emit(
          `Variable '${v.name}' is declared but never assigned. Defaulting to ${defaults[v.varType] ?? "undefined"}.`,
          v.loc,
        );
      }
      const defaults: Record<string, string> = { str: '""', int: "0", bool: "false", "str[]": "[]" };
      return `var ${v.name} = ${defaults[v.varType] ?? "undefined"};`;
    }
    const val = litToString(v.value);
    if (val.startsWith("__VAR__")) return `var ${v.name} = ${val.slice(7)};`;
    if (val.startsWith("__ARR__")) return `var ${v.name} = ${val.slice(7)};`;
    if (v.varType === "obj") return `var ${v.name} = ${val};`;
    if (v.varType === "str")  return `var ${v.name} = ${JSON.stringify(val)};`;
    if (v.varType === "str[]" && typeof val === 'string' && val.startsWith("__ARR__")) {
      try {
        const arr = JSON.parse(val.slice(7));
        return `var ${v.name} = ${JSON.stringify(arr)};`;
      } catch { return `var ${v.name} = ${val.slice(7)};`; }
    }
    return `var ${v.name} = ${val};`;
  }).join("\n");

  if (!needsRender && !needsDelay) {
    return varLines ? `// Sinth compiled runtime\n${varLines}` : "";
  }


  const helpers = generateHelpers({ needsExpr, needsIf, needsFor, needsDelay, needsMixed });

  const renderBody = buildRenderBody({
    bodyHTML, logicBlocks, mixedBlocks,
    needsLogic, needsMixed, needsIf, needsFor, needsExpr, needsDelay
  });

  const exprArrayJS = exprRegistry.length > 0
    ? `var __X = [${exprRegistry.map((js) => `function(_ctx){ return ${js}; }`).join(",")}];\n`
    : "";

  const renderFunc = needsRender ? `function sinthRender() {\n${renderBody}}\nsinthRender();` : "";

  const pageCode = `// Sinth page runtime
${varLines}
${exprArrayJS}
${renderFunc}`;

  if (opts.sharedRuntime && helpers.trim()) {
    const sharedCode = `// Sinth shared runtime
${helpers}`;
    return { page: pageCode, shared: sharedCode };
  }

  return `// Sinth compiled runtime
${varLines}
${functionsJS ? functionsJS + "\n" : ""}${helpers}
${exprArrayJS}
${renderFunc}`;
}

// main compilation pipeline

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
  const hash = fnv1a(absPath);

  const allVarDecls: VarDeclaration[] = file.varDecls;
  const functionDefs: FunctionDef[]   = file.functions;

  const ctx: CompileCtx = {
    allDefs, functionDefs, customEls, cssLinks, jsLinks,
    scopeHash:    hash,
    pageFile:     absPath,
    extraCSS:     [],
    mixedBlocks:  [],
    mixedCounter: 0,
    logicBlocks:  [],
    ifIdCounter:  0,
    exprRegistry: [],
    exprMap:      new Map(),
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
    varDecls:     allVarDecls,
    bodyHTML,
    logicBlocks:  ctx.logicBlocks,
    mixedBlocks:  ctx.mixedBlocks,
    assignedVars,
    exprRegistry: ctx.exprRegistry,
    sharedRuntime: opts.sharedRuntime,
    functionsJS:  compiledFunctions,   // ← pass compiled functions
  });
  const runtimeJS = typeof runtimeResult === 'string' ? runtimeResult : runtimeResult.page;
  const sharedJS = typeof runtimeResult === 'string' ? null : runtimeResult.shared;


  const head = renderHead(headData, relativeCssLinks, relativeJsLinks, scopedCSS, companionJS);
  const scriptTags: string[] = [];
  if (componentScripts.length > 0) {
    scriptTags.push(`<script>\n${componentScripts.join("\n\n")}\n</script>`);
  }

  for (const s of pageScripts) {
    const extra = Object.entries(s.attrs)
      .map(([k, v]) => v === "true" ? k : `${k}="${escAttr(v)}"`)
      .join(" ");
    const globalised = s.raw.replace(/\b(let|const)\b/g, "var");
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

  const html = [
    "<!DOCTYPE html>",
    `<html lang="${escAttr(headData.lang)}">`,
    head,
    `<body data-s="${hash}">`,
    bodyHTML,
    sharedRuntimeTag,
    runtimeJS.trim() ? `<script>\n${runtimeJS}\n</script>` : "",
    scriptTags.join("\n"),
    "</body>",
    "</html>",
  ].filter(Boolean).join("\n");

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

