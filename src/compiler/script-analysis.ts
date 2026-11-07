import * as acorn from "acorn";
import { Loc, SinthError } from "./diagnostics";

interface AcornNode {
  type: string;
  start: number;
  end: number;
  id?: AcornNode | null;
  name?: string;
  declarations?: AcornNode[];
  properties?: AcornNode[];
  elements?: (AcornNode | null)[];
  value?: AcornNode;
  argument?: AcornNode;
  left?: AcornNode;
  key?: AcornNode;
  specifiers?: AcornNode[];
  local?: AcornNode;
  body?: AcornNode[];
}

export interface ScriptInfo {
  declared: string[];
  hasImports: boolean;
}

function collectPattern(node: AcornNode | null | undefined, out: string[]): void {
  if (!node) return;
  switch (node.type) {
    case "Identifier":
      if (node.name) out.push(node.name);
      break;
    case "ObjectPattern":
      for (const p of node.properties ?? []) collectPattern(p.type === "RestElement" ? p.argument : p.value, out);
      break;
    case "ArrayPattern":
      for (const el of node.elements ?? []) collectPattern(el, out);
      break;
    case "RestElement":
      collectPattern(node.argument, out);
      break;
    case "AssignmentPattern":
      collectPattern(node.left, out);
      break;
    default:
      break;
  }
}

export function analyzeScript(code: string, loc: Loc, inComponent: boolean): ScriptInfo {
  let program: AcornNode;
  try {
    program = acorn.parse(code, {
      ecmaVersion: "latest",
      sourceType: inComponent ? "script" : "module",
      allowReturnOutsideFunction: inComponent,
      allowAwaitOutsideFunction: !inComponent,
      locations: true,
    }) as unknown as AcornNode;
  } catch (err) {
    const e = err as { message: string; loc?: { line: number; column: number } };
    const line = e.loc ? loc.line + e.loc.line - 1 : loc.line;
    const col = e.loc ? (e.loc.line === 1 ? loc.col + e.loc.column : e.loc.column + 1) : loc.col;
    throw new SinthError("E0500", `JavaScript syntax error in script block: ${e.message.replace(/\s*\(\d+:\d+\)$/, "")}`, { file: loc.file, line, col });
  }
  const declared: string[] = [];
  let hasImports = false;
  for (const stmt of program.body ?? []) {
    switch (stmt.type) {
      case "FunctionDeclaration":
      case "ClassDeclaration":
        if (stmt.id?.name) declared.push(stmt.id.name);
        break;
      case "VariableDeclaration":
        for (const d of stmt.declarations ?? []) collectPattern(d.id, declared);
        break;
      case "ImportDeclaration":
        hasImports = true;
        for (const s of stmt.specifiers ?? []) if (s.local?.name) declared.push(s.local.name);
        break;
      default:
        break;
    }
  }
  return { declared, hasImports };
}
