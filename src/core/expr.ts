import { Expression, Child, AssignStmt, IfBlock, ReturnStmt, LitStr, LitNum, LitBool, CompileCtx } from "./types";

export function compileExprToJS(expr: Expression, loopVars?: Set<string>, namespace?: string, declaredVars?: Set<string>): string {
  switch (expr.kind) {
    case "literal":
      if (!expr.value) return "null";
      if (expr.value.kind === "str") {
        const sv = (expr.value as LitStr).value;
        if (sv.startsWith("__ARR__")) return sv.slice(7);
        if (sv.startsWith("__VAR__")) return sv.slice(7);
        return JSON.stringify(sv);
      }
      if (expr.value.kind === "num")  return String((expr.value as LitNum).value);
      if (expr.value.kind === "bool") return String((expr.value as LitBool).value);
      return "null";
    case "variable":
      if (loopVars && expr.name) {
        const dotIdx = expr.name.indexOf('.');
        const root = dotIdx !== -1 ? expr.name.substring(0, dotIdx) : expr.name;
        if (loopVars.has(root)) {
          return `_ctx.${expr.name}`;
        }
      }
      if (namespace && declaredVars && expr.name) {
        const dotIdx2 = expr.name.indexOf('.');
        const root2 = dotIdx2 !== -1 ? expr.name.substring(0, dotIdx2) : expr.name;
        if (declaredVars.has(root2)) {
          return namespace + "_" + expr.name;
        }
      }
      return expr.name ?? "undefined";
    case "binary": {
      const l = compileExprToJS(expr.left!, loopVars, namespace, declaredVars);
      const r = compileExprToJS(expr.right!, loopVars, namespace, declaredVars);
      const o = expr.op === "and" ? "&&" : expr.op === "or" ? "||" : expr.op!;
      return `(${l} ${o} ${r})`;
    }
    case "unary": {
      const o = expr.op === "not" ? "!" : expr.op!;
      return `${o}(${compileExprToJS(expr.operand!, loopVars, namespace, declaredVars)})`;
    }
    case "assign": {
      const v = expr.right ? compileExprToJS(expr.right, loopVars, namespace, declaredVars) : "null";
      let t = expr.target ?? "undefined";
      if (namespace && declaredVars && expr.target) {
        const dotIdx = expr.target.indexOf('.');
        const root = dotIdx !== -1 ? expr.target.substring(0, dotIdx) : expr.target;
        if (declaredVars.has(root)) {
          t = namespace + "_" + expr.target;
        }
      }
      return `${t} ${expr.op} ${v}`;
    }
    case "index":
      return `${compileExprToJS(expr.object!, loopVars, namespace, declaredVars)}[${compileExprToJS(expr.key!, loopVars, namespace, declaredVars)}]`;
    case "postfix": {
      let t2 = expr.target ?? "undefined";
      if (namespace && declaredVars && expr.target) {
        const dotIdx = expr.target.indexOf('.');
        const root = dotIdx !== -1 ? expr.target.substring(0, dotIdx) : expr.target;
        if (declaredVars.has(root)) {
          t2 = namespace + "_" + expr.target;
        }
      }
      return `${t2}${expr.op}`;
    }
    case "call": {
      const callee = compileExprToJS(expr.callee!, loopVars, namespace, declaredVars);
      if (callee === "remove") {
        const arg = expr.args && expr.args[0] ? compileExprToJS(expr.args[0], loopVars, namespace, declaredVars) : "''";
        return `(function(){ var _el=document.getElementById(${arg}); if(_el)_el.remove(); })()`;
      }
      const args = (expr.args ?? []).map(a => compileExprToJS(a, loopVars, namespace, declaredVars)).join(", ");
      if (expr.args && expr.args.length === 0 && /\.length$/.test(callee)) {
        return callee;
      }
      return `${callee}(${args})`;
    }
    default:
      return "";
  }
}


export function compileIfToJS(ifBlock: IfBlock, loopVars?: Set<string>, namespace?: string, declaredVars?: Set<string>): string {
  const cond = compileExprToJS(ifBlock.condition, loopVars, namespace, declaredVars);
  const ifJS = bodyToJS(ifBlock.body, loopVars, namespace, declaredVars);
  const elseJS = ifBlock.elseBody ? bodyToJS(ifBlock.elseBody, loopVars, namespace, declaredVars) : "";
  let js = `if (${cond}) {\n${ifJS}}\n`;
  if (elseJS) js += `else {\n${elseJS}}\n`;
  return js;
}



export function bodyToJS(children: Child[], loopVars?: Set<string>, namespace?: string, declaredVars?: Set<string>): string {
  return children
    .filter(c => c.kind === "assign_stmt" || c.kind === "if" || c.kind === "return" || c.kind === "expr")
    .map(c => {
      if (c.kind === "assign_stmt") return `  ${compileExprToJS((c as AssignStmt).expression, loopVars, namespace, declaredVars)};\n`;
      if (c.kind === "return")      return `  return ${(c as ReturnStmt).expression ? compileExprToJS((c as ReturnStmt).expression!, loopVars, namespace, declaredVars) : ""};\n`;
      if (c.kind === "if")          return compileIfToJS(c as IfBlock, loopVars, namespace, declaredVars).replace(/^/gm, "  ") + "\n";
      if (c.kind === "expr")        return `  ${compileExprToJS((c as { expression: Expression }).expression, loopVars, namespace, declaredVars)};\n`;
      return "";
    })
    .join("");
}
export function scopeVariableName(name: string, ctx?: CompileCtx): string {
  if (ctx?.scopePrefix && ctx?.scopeVar && ctx?.varDecls?.some(v => v.name === name)) {
    return `${ctx.scopePrefix}${name}`;
  }
  return name;
}