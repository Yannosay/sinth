#!/usr/bin/env node
// Sinth Compiler

import * as fs   from "fs";
import * as path from "path";
import * as http from "http";


export interface Loc { file: string; line: number; col: number }

export enum TT {
  LBRACE, RBRACE, LPAREN, RPAREN, COLON, COMMA, EQUALS, DOT,
  LBRACKET, RBRACKET,
  STRING, NUMBER, BOOL_TRUE, BOOL_FALSE, NULL_LIT,
  RAW_BLOCK,
  IDENT,
  KW_IMPORT, KW_AS, KW_CSS,
  KW_COMPONENT, KW_STYLE, KW_SCRIPT,
  KW_GLOBAL, KW_PAGE, KW_LANG,
  KW_CUSTOM_EL, KW_CUSTOM,
  KW_IF, KW_ELSE, KW_FOR, KW_IN, KW_REMOVE,
  KW_FUNCTION, KW_RETURN,
  OP_PLUS, OP_MINUS, OP_STAR, OP_SLASH, OP_SEMI,
  OP_LT, OP_GT, OP_NEQ, OP_EQEQ, OP_LTEQ, OP_GTEQ,
  OP_ARROW,
  OP_NOT,
  EOF,
}

export interface Token { type: TT; value: string; loc: Loc }

export type LitStr  = { kind: "str";  value: string };
export type LitNum  = { kind: "num";  value: number };
export type LitBool = { kind: "bool"; value: boolean };
export type LitNull = { kind: "null" };
export type Literal = LitStr | LitNum | LitBool | LitNull;

export type UnaryOp  = "not" | "-";
export type BinaryOp = "+" | "-" | "*" | "/" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "and" | "or";
export type AssignOp = "=" | "+=" | "-=";
export type PostfixOp = "++" | "--";

export interface Expression {
  kind:     "literal" | "variable" | "unary" | "binary" | "assign" | "postfix" | "index" | "call";
  value?:   Literal;
  name?:    string;
  op?:      UnaryOp | BinaryOp | AssignOp | PostfixOp;
  operand?: Expression;
  left?:    Expression;
  right?:   Expression;
  target?:  string;
  object?:  Expression;
  key?:     Expression;
  callee?:  Expression;
  args?:    Expression[];
}

export interface Attr       { name: string; value: Literal | null; loc: Loc }
export interface TextNode   { kind: "text";        value: string;                       loc: Loc }
export interface CompUse    { kind: "use";         name: string; attrs: Attr[]; children: Child[]; loc: Loc }
export interface ExprNode   { kind: "expr";        expression: Expression;              loc: Loc }
export interface AssignStmt { kind: "assign_stmt"; expression: Expression;              loc: Loc }
export interface IfBlock    { kind: "if";          condition: Expression; body: Child[]; elseBody?: Child[]; loc: Loc }
export interface ForLoop    { kind: "for";         keyVar?: string; itemVar: string; indexVar?: string; arrayVar: string; body: Child[]; loc: Loc }
export interface RemoveStmt  { kind: "remove";      target: string; loc: Loc }
export interface ReturnStmt  { kind: "return";      expression?: Expression; loc: Loc }
export interface ComponentExpr { kind: "component_expr"; children: Child[]; loc: Loc }


export type Child = TextNode | CompUse | ExprNode | AssignStmt | IfBlock | ForLoop | RemoveStmt | ReturnStmt | ComponentExpr;

export interface ParamDecl   { name: string; defaultVal?: Literal; loc: Loc }

export interface StyleBlock {
  global:     boolean;
  lang:       "css" | "scss";
  raw:        string;
  target?:    string;
  extraAttrs: Record<string, string>;
  loc:        Loc;
}

export interface ScriptBlock  { raw: string; attrs: Record<string, string>; loc: Loc }
export interface CompDef      { name: string; params: ParamDecl[]; body: Child[]; styles: StyleBlock[]; scripts: ScriptBlock[]; loc: Loc }
export interface CustomElDecl { sinthName: string; tagName: string; params: ParamDecl[]; loc: Loc }
export interface CustomElInfo { tagName: string; params: ParamDecl[] }

export type VarType = "int" | "str" | "bool" | "str[]" | "obj" | "ui";
export interface VarDeclaration { kind: "var"; name: string; varType: VarType; value: Literal | null; loc: Loc }

export type ImportNode =
  | { kind: "sinth"; path: string; loc: Loc }
  | { kind: "css";   path: string; loc: Loc }
  | { kind: "js";    name: string; alias?: string; loc: Loc };

export interface MetaEntry { key: string; value: Literal; loc: Loc }

export interface FunctionDef {
  name:       string;
  params:     ParamDecl[];
  returnType?: VarType;
  body:       Child[];
  loc:        Loc;
}

export interface SinthFile {
  filePath:  string;
  isPage:    boolean;
  imports:   ImportNode[];
  meta:      MetaEntry[];
  defs:      CompDef[];
  functions: FunctionDef[];
  uses:      CompUse[];
  styles:    StyleBlock[];
  scripts:   ScriptBlock[];
  customEls: CustomElDecl[];
  varDecls:  VarDeclaration[];
}

export interface MixedBlockEntry {
  id:          string;
  conditionJS: string;
  ifJS:        string;
  ifHTML:      string;
  elseJS:      string;
  elseHTML:    string;
  replaceId?:  string;
}

export interface CompileCtx {
  allDefs:      Map<string, CompDef>;
  functionDefs: FunctionDef[];
  customEls:    Map<string, CustomElInfo>;
  cssLinks:     string[];
  jsLinks:      { src: string; attrs: Record<string, string> }[];
  scopeHash:    string;
  pageFile:     string;
  extraCSS:     string[];
  mixedBlocks:  MixedBlockEntry[];
  mixedCounter: number;
  logicBlocks:  string[];
  ifIdCounter:  number;
  exprRegistry: string[];
  exprMap:      Map<string, number>;
  loopVars?:    Set<string>;
}

export class SinthError extends Error {
  constructor(
    public readonly rawMsg: string,
    public readonly loc?: Loc,
    public readonly sourceLine?: string,
  ) {
    super(SinthError.buildMessage(rawMsg, loc, sourceLine));
    Object.setPrototypeOf(this, SinthError.prototype);
  }

  static buildMessage(msg: string, loc?: Loc, sourceLine?: string): string {
    let s = `Error: ${msg}`;
    if (loc) {
      s += `\n  at: ${loc.file} (line ${loc.line}, col ${loc.col})`;
      if (sourceLine !== undefined) {
        const lineNum = String(loc.line).padStart(4);
        const pointer = " ".repeat(Math.max(0, loc.col - 1)) + "^";
        s += `\n${lineNum} | ${sourceLine}\n     | ${pointer}`;
      }
    }
    return s;
  }

  withSource(lines: string[]): SinthError {
    if (!this.loc || this.sourceLine !== undefined) return this;
    const line = lines[this.loc.line - 1] ?? "";
    return new SinthError(this.rawMsg, this.loc, line);
  }
}

export class SinthWarning {
  static emit(msg: string, loc?: Loc): void {
    const where = loc ? `\n  at: ${loc.file}:${loc.line}` : "";
    process.stderr.write(`\x1b[33mWarning:\x1b[0m ${msg}${where}\n`);
  }
}