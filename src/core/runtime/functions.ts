import { CompileCtx, FunctionDef } from "../types.ts";
import { compileExprToJS, compileIfToJS } from "../expr.ts";

export function compileFunctionDef(fn: FunctionDef, ctx: CompileCtx): string {
  const paramsJS = fn.params.map(p => p.name).join(", ");

  if (fn.returnType === "ui") {
    return "";
  }

  const bodyStatements: string[] = [];
  for (const child of fn.body) {
    switch (child.kind) {
      case "text":
        break;
      case "expr":
        bodyStatements.push(`return ${compileExprToJS(child.expression)};`);
        break;
      case "assign_stmt":
        bodyStatements.push(`${compileExprToJS(child.expression)};`);
        break;
      case "if":
        bodyStatements.push(compileIfToJS(child as IfBlock));
        break;
      case "for":
        break;
      case "return":
        bodyStatements.push(`return ${child.expression ? compileExprToJS(child.expression) : ""};`);
        break;
    }
  }
  return `function ${fn.name}(${paramsJS}) {\n${bodyStatements.map(s => `  ${s}`).join("\n")}\n}`;
}
