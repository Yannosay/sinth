import { CompileCtx, FunctionDef, IfBlock, VarDeclaration, Expression, ForLoop, Child } from "../types";
import { compileExprToJS, compileIfToJS } from "../expr";

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
        bodyStatements.push(`${compileExprToJS(child.expression, undefined, ctx.namespace, ctx.declaredVars)};`);
        break;
      case "assign_stmt":
        bodyStatements.push(`${compileExprToJS(child.expression, undefined, ctx.namespace, ctx.declaredVars)};`);
        break;
      case "if":
        bodyStatements.push(compileIfToJS(child as IfBlock, undefined, ctx.namespace, ctx.declaredVars));
        break;
      case "for": {
        const fl = child as ForLoop;
        const itemVar = fl.itemVar;
        const arrayVar = (ctx.namespace && ctx.declaredVars && ctx.declaredVars.has(fl.arrayVar)) ? ctx.namespace + "_" + fl.arrayVar : fl.arrayVar;
        const bodyJS = fl.body.map((c: Child) => {
          if (c.kind === "assign_stmt") return `${compileExprToJS(c.expression, undefined, ctx.namespace, ctx.declaredVars)};`;
          if (c.kind === "if") return compileIfToJS(c, undefined, ctx.namespace, ctx.declaredVars);
          if (c.kind === "expr") return `${compileExprToJS(c.expression, undefined, ctx.namespace, ctx.declaredVars)};`;
          return "";
        }).filter(Boolean).join("\n");
        const bodyLines = bodyJS.split("\n");
        const indentedBody = bodyLines.map((line: string) => `    ${line}`).join("\n");
        if (fl.indexVar) {
          const alreadyDeclared = fn.body.some((bc: Child) => bc.kind === "var" && bc.name === fl.indexVar);
          if (!alreadyDeclared) {
            bodyStatements.push(`let ${fl.indexVar} = 0;`);
          }
          bodyStatements.push(`for (let ${itemVar} of ${arrayVar}) {\n${indentedBody}\n    ${fl.indexVar} = ${fl.indexVar} + 1;\n  }`);
        } else {
          bodyStatements.push(`for (let ${itemVar} of ${arrayVar}) {\n${indentedBody}\n  }`);
        }
        break;
      }
      case "var": {
        const vd = child as VarDeclaration;
        let initJS: string;
        if (vd.value) {
          const lit = vd.value;
          if (lit.kind === "str") {
            if (lit.value.startsWith("__ARR__")) {
              initJS = lit.value.slice(7);
            } else if (lit.value.startsWith("__EXPR__")) {
              try {
                const innerExpr: Expression = JSON.parse(lit.value.substring(8));
                initJS = compileExprToJS(innerExpr, undefined, ctx.namespace, ctx.declaredVars);
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
        bodyStatements.push(`let ${vd.name} = ${initJS};`);
        break;
      }
      case "return":
        bodyStatements.push(`return ${child.expression ? compileExprToJS(child.expression, undefined, ctx.namespace, ctx.declaredVars) : ""};`);
        break;
    }
  }
  return `function ${fn.name}(${paramsJS}) {\n${bodyStatements.map(s => `  ${s}`).join("\n")}\n}`;
}