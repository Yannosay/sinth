import { Expression, Child, AssignStmt, IfBlock, ReturnStmt, LitStr, LitNum, LitBool } from "./types.ts";


export function compileExprToJS(expr: Expression, loopVars?: Set<string>): string {
  switch (expr.kind) {
    case "literal":
      if (!expr.value) return "null";
      if (expr.value.kind === "str")  return JSON.stringify((expr.value as LitStr).value);
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
      return expr.name ?? "undefined";
    case "binary": {
      const l = compileExprToJS(expr.left!, loopVars);
      const r = compileExprToJS(expr.right!, loopVars);
      const o = expr.op === "and" ? "&&" : expr.op === "or" ? "||" : expr.op!;
      return `(${l} ${o} ${r})`;
    }
    case "unary": {
      const o = expr.op === "not" ? "!" : expr.op!;
      return `${o}(${compileExprToJS(expr.operand!, loopVars)})`;
    }
    case "assign": {
      const v = expr.right ? compileExprToJS(expr.right, loopVars) : "null";
      return `${expr.target} ${expr.op} ${v}`;
    }
    case "index":
      return `${compileExprToJS(expr.object!, loopVars)}[${compileExprToJS(expr.key!, loopVars)}]`;
    case "postfix":
      return `${expr.target}${expr.op}`;
    case "call": {
      const callee = compileExprToJS(expr.callee!, loopVars);
      const args = (expr.args ?? []).map(a => compileExprToJS(a, loopVars)).join(", ");
      return `${callee}(${args})`;
    }
    default:
      return "";
  }
}


export function compileIfToJS(ifBlock: IfBlock): string {
  const cond = compileExprToJS(ifBlock.condition);
  const ifJS = bodyToJS(ifBlock.body);
  const elseJS = ifBlock.elseBody ? bodyToJS(ifBlock.elseBody) : "";
  let js = `if (${cond}) {\n${ifJS}}\n`;
  if (elseJS) js += `else {\n${elseJS}}\n`;
  return js;
}



export function bodyToJS(children: Child[]): string {
  return children
    .filter(c => c.kind === "assign_stmt" || c.kind === "if" || c.kind === "return")
    .map(c => {
      if (c.kind === "assign_stmt") return `  ${compileExprToJS((c as AssignStmt).expression)};\n`;
      if (c.kind === "return")      return `  return ${(c as ReturnStmt).expression ? compileExprToJS((c as ReturnStmt).expression!) : ""};\n`;
      if (c.kind === "if")          return compileIfToJS(c as IfBlock).replace(/^/gm, "  ") + "\n";
      return "";
    })
    .join("");
}