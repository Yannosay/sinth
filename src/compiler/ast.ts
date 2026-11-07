import { Loc } from "./diagnostics";

export type BaseType = "str" | "num" | "int" | "bool" | "obj" | "ui" | "any" | "void" | "fn";

export interface TypeRef {
  base: BaseType;
  array: number;
  nullable: boolean;
}

export type LiteralValue = string | number | boolean | null;

export type Expr =
  | { k: "lit"; value: LiteralValue; loc: Loc }
  | { k: "tpl"; parts: (string | Expr)[]; loc: Loc }
  | { k: "id"; name: string; loc: Loc }
  | { k: "member"; object: Expr; prop: string; optional: boolean; loc: Loc }
  | { k: "index"; object: Expr; index: Expr; optional: boolean; loc: Loc }
  | { k: "call"; callee: Expr; args: Arg[]; optional: boolean; memo: boolean; loc: Loc }
  | { k: "new"; callee: Expr; args: Arg[]; loc: Loc }
  | { k: "unary"; op: "!" | "-" | "+" | "~" | "typeof" | "await"; arg: Expr; loc: Loc }
  | { k: "binary"; op: BinaryOp; left: Expr; right: Expr; loc: Loc }
  | { k: "cond"; test: Expr; then: Expr; else: Expr; loc: Loc }
  | { k: "assign"; op: AssignOp; target: Expr; value: Expr; loc: Loc }
  | { k: "update"; op: "++"; prefix: boolean; target: Expr; loc: Loc }
  | { k: "array"; items: ArrayItem[]; loc: Loc }
  | { k: "object"; props: ObjectProp[]; loc: Loc }
  | { k: "arrow"; params: Param[]; body: Expr | Stmt[]; async: boolean; loc: Loc }
  | { k: "range"; args: Expr[]; loc: Loc };

export type BinaryOp =
  | "+" | "-" | "*" | "/" | "%" | "**"
  | "==" | "!=" | "<" | ">" | "<=" | ">="
  | "&&" | "||" | "??";

export type AssignOp = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "**=" | "??=" | "&&=" | "||=";

export interface Arg {
  name?: string;
  value: Expr;
  spread: boolean;
  loc: Loc;
}

export interface ArrayItem {
  value: Expr;
  spread: boolean;
}

export interface ObjectProp {
  key: string;
  computedKey?: Expr;
  value: Expr;
  spread: boolean;
  loc: Loc;
}

export interface Param {
  name: string;
  type?: TypeRef;
  defaultValue?: Expr;
  optional: boolean;
  rest: boolean;
  bindable?: boolean;
  loc: Loc;
}

export interface VarDecl {
  kind: "var" | "const" | "computed";
  name: string;
  type?: TypeRef;
  init?: Expr;
  persist: boolean;
  loc: Loc;
}

export type Stmt =
  | { k: "expr"; expr: Expr; loc: Loc }
  | { k: "var"; decl: VarDecl; loc: Loc }
  | { k: "if"; test: Expr; then: Stmt[]; else?: Stmt[]; loc: Loc }
  | { k: "for"; names: string[]; iter: Expr; filter?: Expr; body: Stmt[]; loc: Loc }
  | { k: "while"; test: Expr; body: Stmt[]; loc: Loc }
  | { k: "return"; value?: Expr; loc: Loc }
  | { k: "break"; loc: Loc }
  | { k: "continue"; loc: Loc };

export interface Attr {
  name: string;
  modifiers: string[];
  value: Expr | null;
  handler?: Stmt[];
  loc: Loc;
}

export type Node =
  | ElementNode
  | { k: "text"; expr: Expr; loc: Loc }
  | IfNode
  | ForNode
  | { k: "slot"; name: string; fallback: Node[]; loc: Loc }
  | { k: "stmt"; stmt: Stmt; loc: Loc }
  | { k: "var"; decl: VarDecl; loc: Loc };

export interface ElementNode {
  k: "element";
  name: string;
  attrs: Attr[];
  children: Node[];
  slots: SlotFill[];
  hasBody: boolean;
  loc: Loc;
}

export interface SlotFill {
  name: string;
  children: Node[];
  loc: Loc;
}

export interface IfBranch {
  test?: Expr;
  body: Node[];
  loc: Loc;
}

export interface IfNode {
  k: "if";
  branches: IfBranch[];
  persist: boolean;
  delay?: Expr;
  transition?: string;
  loc: Loc;
}

export interface ForNode {
  k: "for";
  names: string[];
  iter: Expr;
  keyExpr?: Expr;
  filter?: Expr;
  body: Node[];
  empty?: Node[];
  loc: Loc;
}

export interface StyleBlock {
  global: boolean;
  lang: "sinth" | "css" | "scss";
  raw: string;
  loc: Loc;
}

export interface ScriptBlock {
  raw: string;
  attrs: Record<string, string>;
  loc: Loc;
}

export interface FunctionDecl {
  name: string;
  params: Param[];
  returnType?: TypeRef;
  body: Stmt[];
  view?: Node[];
  async: boolean;
  loc: Loc;
}

export interface Lifecycle {
  kind: "mount" | "destroy";
  body: Stmt[];
  loc: Loc;
}

export interface Watcher {
  expr: Expr;
  body: Stmt[];
  loc: Loc;
}

export interface ComponentDecl {
  name: string;
  params: Param[];
  vars: VarDecl[];
  functions: FunctionDecl[];
  body: Node[];
  styles: StyleBlock[];
  scripts: ScriptBlock[];
  lifecycle: Lifecycle[];
  watchers: Watcher[];
  customTag?: string;
  exported: boolean;
  file: string;
  loc: Loc;
}

export type ImportKind = "sinth" | "style" | "module" | "script" | "font" | "json" | "library";

export interface ImportSpecifier {
  name: string;
  alias: string;
  loc: Loc;
}

export interface ImportDecl {
  kind: ImportKind;
  source: string;
  defaultName?: string;
  namespace?: string;
  named: ImportSpecifier[];
  attrs: Record<string, string | boolean>;
  sideEffect: boolean;
  loc: Loc;
}

export interface MetaEntry {
  key: string;
  value: Expr;
  loc: Loc;
}

export interface SinthFile {
  path: string;
  source: string;
  isPage: boolean;
  imports: ImportDecl[];
  meta: MetaEntry[];
  externs: { name: string; loc: Loc }[];
  vars: VarDecl[];
  functions: FunctionDecl[];
  components: ComponentDecl[];
  styles: StyleBlock[];
  scripts: ScriptBlock[];
  lifecycle: Lifecycle[];
  watchers: Watcher[];
  body: Node[];
}

export const TYPE_NAMES: ReadonlySet<string> = new Set(["str", "num", "int", "bool", "obj", "ui", "any", "void", "fn"]);
