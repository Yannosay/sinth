import { CompileCtx, FunctionDef, IfBlock } from "../types.ts";
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
        bodyStatements.push(`${compileExprToJS(child.expression)};`);
        break;
      case "assign_stmt":
        bodyStatements.push(`${compileExprToJS(child.expression)};`);
        break;
      case "if":
        bodyStatements.push(compileIfToJS(child as IfBlock));
        break;
      case "for": {
        const fl = child as any;
        const itemVar = fl.itemVar;
        const arrayVar = fl.arrayVar;
        const bodyJS = fl.body.map((c: any) => {
          if (c.kind === "assign_stmt") return `${compileExprToJS(c.expression)};`;
          if (c.kind === "if") return compileIfToJS(c);
          if (c.kind === "expr") return `${compileExprToJS(c.expression)};`;
          return "";
        }).filter(Boolean).join("\n");
        const bodyLines = bodyJS.split("\n");
        const indentedBody = bodyLines.map((line: string) => `    ${line}`).join("\n");
        bodyStatements.push(`for (let ${itemVar} of ${arrayVar}) {\n${indentedBody}\n  }`);
        break;
      }
      case "return":
        bodyStatements.push(`return ${child.expression ? compileExprToJS(child.expression) : ""};`);
        break;
    }
  }
  return `function ${fn.name}(${paramsJS}) {\n${bodyStatements.map(s => `  ${s}`).join("\n")}\n}`;
}