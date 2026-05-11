#!/usr/bin/env node
// Sinth Compiler 0.5.4 — Unified if/else, Sinth Style language, tree-shaken runtime
// Single-file TypeScript compiler for the Sinth declarative web language.
// Run with: npx ts-node sinth.ts build  |  sinth build  |  sinth dev

import * as fs   from "fs";
import * as path from "path";
import * as http from "http";


interface Loc { file: string; line: number; col: number }

// plain `enum TT` so TT[t] string-indexing works at runtime.
enum TT {
  LBRACE, RBRACE, LPAREN, RPAREN, COLON, COMMA, EQUALS, DOT,
  LBRACKET, RBRACKET,
  STRING, NUMBER, BOOL_TRUE, BOOL_FALSE, NULL_LIT,
  RAW_BLOCK,
  IDENT,
  KW_IMPORT, KW_AS, KW_CSS,
  KW_COMPONENT, KW_STYLE, KW_SCRIPT,
  KW_GLOBAL, KW_PAGE, KW_LANG,
  KW_CUSTOM_EL, KW_CUSTOM,
  KW_IF, KW_ELSE, KW_FOR, KW_IN,
  OP_PLUS, OP_MINUS, OP_STAR, OP_SLASH,
  OP_LT, OP_GT, OP_NEQ, OP_EQEQ, OP_LTEQ, OP_GTEQ,
  EOF,
}

interface Token { type: TT; value: string; loc: Loc }

// literal types
type LitStr  = { kind: "str";  value: string };
type LitNum  = { kind: "num";  value: number };
type LitBool = { kind: "bool"; value: boolean };
type LitNull = { kind: "null" };
type Literal = LitStr | LitNum | LitBool | LitNull;

// expression AST
type UnaryOp  = "not" | "-";
type BinaryOp = "+" | "-" | "*" | "/" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "and" | "or";
type AssignOp = "=" | "+=" | "-=";
type PostfixOp = "++" | "--";

interface Expression {
  kind:     "literal" | "variable" | "unary" | "binary" | "assign" | "postfix";
  value?:   Literal;
  name?:    string;
  op?:      UnaryOp | BinaryOp | AssignOp | PostfixOp;
  operand?: Expression;
  left?:    Expression;
  right?:   Expression;
  target?:  string;
}

interface Attr       { name: string; value: Literal | null; loc: Loc }
interface TextNode   { kind: "text";        value: string;                       loc: Loc }
interface CompUse    { kind: "use";         name: string; attrs: Attr[]; children: Child[]; loc: Loc }
interface ExprNode   { kind: "expr";        expression: Expression;              loc: Loc }
interface AssignStmt { kind: "assign_stmt"; expression: Expression;              loc: Loc }
interface IfBlock    { kind: "if";          condition: Expression; body: Child[]; elseBody?: Child[]; loc: Loc }
interface ForLoop    { kind: "for";         keyVar?: string; itemVar: string; indexVar?: string; arrayVar: string; body: Child[]; loc: Loc }

// assignStmt is a first-class child so if bodies can be mixed
type Child = TextNode | CompUse | ExprNode | AssignStmt | IfBlock | ForLoop;

// component / file structure
interface ParamDecl   { name: string; defaultVal?: Literal; loc: Loc }

interface StyleBlock {
  global:     boolean;
  lang:       "css" | "scss";
  raw:        string;
  target?:    string;
  extraAttrs: Record<string, string>;
  loc:        Loc;
}

interface ScriptBlock  { raw: string; attrs: Record<string, string>; loc: Loc }
interface CompDef      { name: string; params: ParamDecl[]; body: Child[]; styles: StyleBlock[]; scripts: ScriptBlock[]; loc: Loc }
interface CustomElDecl { sinthName: string; tagName: string; params: ParamDecl[]; loc: Loc }
interface CustomElInfo { tagName: string; params: ParamDecl[] }

type VarType = "int" | "str" | "bool" | "str[]" | "obj";
interface VarDeclaration { kind: "var"; name: string; varType: VarType; value: Literal | null; loc: Loc }

type ImportNode =
  | { kind: "sinth"; path: string; loc: Loc }
  | { kind: "css";   path: string; loc: Loc }
  | { kind: "js";    name: string; alias?: string; loc: Loc };

interface MetaEntry { key: string; value: Literal; loc: Loc }

interface SinthFile {
  filePath:  string;
  isPage:    boolean;
  imports:   ImportNode[];
  meta:      MetaEntry[];
  defs:      CompDef[];
  uses:      CompUse[];
  styles:    StyleBlock[];
  scripts:   ScriptBlock[];
  customEls: CustomElDecl[];
  varDecls:  VarDeclaration[];
}

interface MixedBlockEntry {
  id:          string;
  conditionJS: string;
  ifJS:        string;
  ifHTML:      string;
  elseJS:      string;
  elseHTML:    string;
  replaceId?:  string;
}

interface CompileCtx {
  allDefs:      Map<string, CompDef>;
  customEls:    Map<string, CustomElInfo>;
  cssLinks:     string[];
  jsLinks:      { src: string; attrs: Record<string, string> }[];
  scopeHash:    string;
  pageFile:     string;
  extraCSS:     string[];
  mixedBlocks:  MixedBlockEntry[];
  mixedCounter: number;
  logicBlocks:  string[];
}

class SinthError extends Error {
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

class SinthWarning {
  static emit(msg: string, loc?: Loc): void {
    const where = loc ? `\n  at: ${loc.file}:${loc.line}` : "";
    process.stderr.write(`\x1b[33mWarning:\x1b[0m ${msg}${where}\n`);
  }
}

/** FNV-1a 32-bit hash → 8-char hex scope id */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 8);
}

function camelToKebab(s: string): string {
  const vp = s.match(/^(Webkit|Moz|Ms)(.+)$/);
  if (vp) return `-${vp[1].toLowerCase()}-${camelToKebab(vp[2])}`;
  return s.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`);
}

/** "w-counter" → "WCounter" */
function tagNameToPascal(tag: string): string {
  return tag.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}

function litToString(lit: Literal): string {
  switch (lit.kind) {
    case "str":  return lit.value;
    case "num":  return String(lit.value);
    case "bool": return String(lit.value);
    case "null": return "";
  }
}

// lexer
const KEYWORDS: Record<string, TT> = {
  "import":         TT.KW_IMPORT,
  "as":             TT.KW_AS,
  "css":            TT.KW_CSS,
  "component":      TT.KW_COMPONENT,
  "style":          TT.KW_STYLE,
  "script":         TT.KW_SCRIPT,
  "global":         TT.KW_GLOBAL,
  "page":           TT.KW_PAGE,
  "lang":           TT.KW_LANG,
  "true":           TT.BOOL_TRUE,
  "false":          TT.BOOL_FALSE,
  "null":           TT.NULL_LIT,
  "custom-element": TT.KW_CUSTOM_EL,
  "custom":         TT.KW_CUSTOM,
  "if":             TT.KW_IF,
  "else":           TT.KW_ELSE,
  "for":            TT.KW_FOR,
  "in":             TT.KW_IN,
};

export class Lexer {
  private pos  = 0;
  private line = 1;
  private col  = 1;
  private rawBlockPending = false;

  constructor(public readonly src: string, private readonly file: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      this.skipWS();
      if (this.pos >= this.src.length) break;

      const loc = this.loc();
      const ch  = this.src[this.pos];

      if (ch === "(") { tokens.push(this.single(TT.LPAREN, loc)); continue; }
      if (ch === ")") { tokens.push(this.single(TT.RPAREN, loc)); continue; }
      if (ch === "}") { tokens.push(this.single(TT.RBRACE, loc)); continue; }
      if (ch === ",") { tokens.push(this.single(TT.COMMA,  loc)); continue; }
      if (ch === ".") { tokens.push(this.single(TT.DOT,    loc)); continue; }
      if (ch === ":") { tokens.push(this.single(TT.COLON,  loc)); continue; }
      if (ch === "[") { tokens.push(this.single(TT.LBRACKET, loc)); continue; }
      if (ch === "]") { tokens.push(this.single(TT.RBRACKET, loc)); continue; }

      // two-character operators ->
      if (ch === "=" && this.src[this.pos + 1] === "=") { this.adv(); this.adv(); tokens.push({ type: TT.OP_EQEQ, value: "==", loc }); continue; }
      if (ch === "!" && this.src[this.pos + 1] === "=") { this.adv(); this.adv(); tokens.push({ type: TT.OP_NEQ,  value: "!=", loc }); continue; }
      if (ch === ">" && this.src[this.pos + 1] === "=") { this.adv(); this.adv(); tokens.push({ type: TT.OP_GTEQ, value: ">=", loc }); continue; }
      if (ch === "<" && this.src[this.pos + 1] === "=") { this.adv(); this.adv(); tokens.push({ type: TT.OP_LTEQ, value: "<=", loc }); continue; }

      if (ch === "=") { tokens.push(this.single(TT.EQUALS, loc)); continue; }
      if (ch === "+") { tokens.push(this.single(TT.OP_PLUS,  loc)); continue; }
      if (ch === "*") { tokens.push(this.single(TT.OP_STAR,  loc)); continue; }
      if (ch === "/") { tokens.push(this.single(TT.OP_SLASH, loc)); continue; }
      if (ch === "<") { tokens.push(this.single(TT.OP_LT,    loc)); continue; }
      if (ch === ">") { tokens.push(this.single(TT.OP_GT,    loc)); continue; }
      if (ch === "-" && !this.isDigit(this.src[this.pos + 1] ?? "")) {
        tokens.push(this.single(TT.OP_MINUS, loc)); continue;
      }

      if (ch === "{") {
        if (this.rawBlockPending) {
          this.rawBlockPending = false;
          tokens.push(this.readRawBlock(loc));
        } else {
          tokens.push(this.single(TT.LBRACE, loc));
        }
        continue;
      }

      if (ch === '"' || ch === "'") { tokens.push(this.readString(loc)); continue; }

      if (this.isDigit(ch) || (ch === "-" && this.isDigit(this.src[this.pos + 1] ?? ""))) {
        tokens.push(this.readNumber(loc)); continue;
      }

      if (this.isIdentStart(ch)) {
        const tok = this.readIdent(loc);
        if (
          tok.type === TT.KW_STYLE     ||
          tok.type === TT.KW_SCRIPT    ||
          tok.type === TT.KW_COMPONENT ||
          tok.type === TT.KW_CUSTOM_EL ||
          tok.type === TT.KW_CUSTOM
        ) {
          this.rawBlockPending = true;
        }
        tokens.push(tok);
        continue;
      }

      throw new SinthError(`Unexpected character '${ch}'`, loc);
    }
    tokens.push({ type: TT.EOF, value: "", loc: this.loc() });
    return tokens;
  }

  private skipWS(): void {
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") { this.adv(); continue; }

      // sinth comments: -- line  or  --[ nestable block ]--
      if (ch === "-" && this.src[this.pos + 1] === "-") {
        if (this.src[this.pos + 2] === "[") {
          this.adv(); this.adv(); this.adv();
          let depth = 1;
          while (this.pos < this.src.length && depth > 0) {
            if (this.src[this.pos] === "-" && this.src[this.pos + 1] === "-" && this.src[this.pos + 2] === "[") {
              depth++; this.adv(); this.adv(); this.adv();
            } else if (this.src[this.pos] === "]" && this.src[this.pos + 1] === "-" && this.src[this.pos + 2] === "-") {
              depth--; this.adv(); this.adv(); this.adv();
            } else {
              this.adv();
            }
          }
          if (depth > 0) throw new SinthError("Unterminated block comment --[ ... ]--", this.loc());
        } else {
          while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.adv();
        }
        continue;
      }
      break;
    }
  }

  private readRawBlock(loc: Loc): Token {
    this.adv(); // consume '{'
    const start = this.pos;
    let depth   = 1;

    while (this.pos < this.src.length && depth > 0) {
      const ch = this.src[this.pos];
      if (ch === '"' || ch === "'" || ch === "`") { this.skipRawString(ch); continue; }
      if (ch === "/" && this.src[this.pos + 1] === "/") {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.adv();
        continue;
      }
      if (ch === "/" && this.src[this.pos + 1] === "*") {
        this.adv(); this.adv();
        while (this.pos < this.src.length - 1 &&
               !(this.src[this.pos] === "*" && this.src[this.pos + 1] === "/")) { this.adv(); }
        this.adv(); this.adv();
        continue;
      }
      if (ch === "{")  { depth++; this.adv(); }
      else if (ch === "}") {
        depth--;
        if (depth > 0) this.adv();
      } else {
        this.adv();
      }
    }

    const content = this.src.substring(start, this.pos);
    this.adv(); // consume closing '}'
    return { type: TT.RAW_BLOCK, value: content, loc };
  }

  private skipRawString(quote: string): void {
    this.adv();
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === "\\") { this.adv(); this.adv(); continue; }
      if (c === quote) { this.adv(); return; }
      if (quote === "`" && c === "$" && this.src[this.pos + 1] === "{") {
        this.adv(); this.adv();
        let d = 1;
        while (this.pos < this.src.length && d > 0) {
          if      (this.src[this.pos] === "{") d++;
          else if (this.src[this.pos] === "}") d--;
          this.adv();
        }
        continue;
      }
      this.adv();
    }
  }

  private readString(loc: Loc): Token {
    const quote = this.src[this.pos];
    this.adv();
    let result = "";
    while (this.pos < this.src.length && this.src[this.pos] !== quote) {
      if (this.src[this.pos] === "\\") {
        this.adv();
        const e = this.src[this.pos];
        switch (e) {
          case "\\": result += "\\"; break;
          case '"':  result += '"';  break;
          case "'":  result += "'";  break;
          case "n":  result += "\n"; break;
          case "r":  result += "\r"; break;
          case "t":  result += "\t"; break;
          case "$":  result += "$";  break;
          case "{":  result += "{";  break;
          case "u": {
            this.adv();
            if (this.src[this.pos] === "{") {
              this.adv();
              let hex = "";
              while (this.src[this.pos] !== "}") { hex += this.src[this.pos]; this.adv(); }
              result += String.fromCodePoint(parseInt(hex, 16));
            } else {
              const hex = this.src.substring(this.pos, this.pos + 4);
              result += String.fromCharCode(parseInt(hex, 16));
              this.pos += 3; this.col += 3;
            }
            break;
          }
          default: throw new SinthError(`Unknown escape sequence \\${e}`, loc);
        }
        this.adv();
      } else {
        result += this.src[this.pos];
        this.adv();
      }
    }
    if (this.pos >= this.src.length) throw new SinthError("Unterminated string literal", loc);
    this.adv();
    return { type: TT.STRING, value: result, loc };
  }

  private readNumber(loc: Loc): Token {
    let s = "";
    if (this.src[this.pos] === "-") { s += "-"; this.adv(); }
    while (this.isDigit(this.src[this.pos] ?? "")) { s += this.src[this.pos]; this.adv(); }
    if (this.src[this.pos] === "." && this.isDigit(this.src[this.pos + 1] ?? "")) {
      s += "."; this.adv();
      while (this.isDigit(this.src[this.pos] ?? "")) { s += this.src[this.pos]; this.adv(); }
    }
    return { type: TT.NUMBER, value: s, loc };
  }

  private readIdent(loc: Loc): Token {
    let s = "";
    while (this.pos < this.src.length && this.isIdentCont(this.src[this.pos])) {
      s += this.src[this.pos]; this.adv();
    }
    const kw = KEYWORDS[s];
    return { type: kw !== undefined ? kw : TT.IDENT, value: s, loc };
  }

  private adv(): void {
    const ch = this.src[this.pos++];
    if (ch === "\n") { this.line++; this.col = 1; } else { this.col++; }
  }

  private single(type: TT, loc: Loc): Token {
    this.adv();
    return { type, value: this.src[this.pos - 1], loc };
  }

  private loc(): Loc { return { file: this.file, line: this.line, col: this.col }; }
  private isDigit(c: string)      { return c >= "0" && c <= "9"; }
  private isIdentStart(c: string) { return /[a-zA-Z_\u00C0-\uFFFF]/.test(c); }
  private isIdentCont(c: string)  { return /[a-zA-Z0-9_\-\u00C0-\uFFFF]/.test(c); }
}

// parser

export class Parser {
  private pos     = 0;
  private loopVar: string | null = null;
  /** Accumulated var declarations for type-checking in bodies. */
  private _varDecls: VarDeclaration[] = [];

  constructor(private tokens: Token[], private file: string) {}


  // top-level file parse
  parse(): SinthFile {
    let   isPage   = false;
    const imports:   ImportNode[]    = [];
    const meta:      MetaEntry[]     = [];
    const defs:      CompDef[]       = [];
    const uses:      CompUse[]       = [];
    const styles:    StyleBlock[]    = [];
    const scripts:   ScriptBlock[]   = [];
    const customEls: CustomElDecl[]  = [];
    const varDecls:  VarDeclaration[] = [];
    this._varDecls = varDecls;

    if (this.check(TT.KW_PAGE)) { this.consume(TT.KW_PAGE); isPage = true; }

    while (this.check(TT.KW_IMPORT)) imports.push(this.parseImport());

    while (this.isMetaStart()) {
      const entry = this.parseMeta();
      meta.push(entry);
      if (entry.key === "title") isPage = true;
    }


    while (this.check(TT.IDENT) && this.peek().value === "var") {
      const vd = this.parseVarDeclaration();
      if (vd) { varDecls.push(vd); }
    }


    while (!this.check(TT.EOF)) {
      if      (this.check(TT.KW_COMPONENT))                     { defs.push(this.parseCompDef()); }
      else if (this.check(TT.KW_STYLE))                         { styles.push(this.parseStyleBlock()); }
      else if (this.check(TT.KW_SCRIPT))                        { scripts.push(this.parseScriptBlock()); }
      else if (this.check(TT.KW_CUSTOM_EL) || this.check(TT.KW_CUSTOM)) { customEls.push(this.parseCustomEl()); }
      else if (this.check(TT.IDENT) && this.peek().value === "var") {
        const vd = this.parseVarDeclaration();
        if (vd) varDecls.push(vd);
      }
      else if (this.check(TT.KW_IF)) {
        const ifNode = this.parseIfBlock();
        uses.push(...this.flattenIfToUses(ifNode, scripts));
      }
      else if (this.check(TT.KW_FOR)) {
        const forNode = this.parseForLoop();
        uses.push({ kind: "use", name: "__IF_ROOT__", attrs: [], children: [forNode], loc: forNode.loc });
      }
else if (this.check(TT.IDENT)) {
const savedPos = this.pos;
const identName = this.peek().value;
const nextType  = this.tokens[this.pos + 1]?.type;

// detect accidental top-level expressions (guess == target" instead of "if guess == target")
const isComparison = [TT.OP_EQEQ, TT.OP_NEQ, TT.OP_LT, TT.OP_GT, TT.OP_LTEQ, TT.OP_GTEQ].includes(nextType);
const isLogicAndOr = nextType === TT.IDENT && (this.tokens[this.pos + 1]?.value === "and" || this.tokens[this.pos + 1]?.value === "or");

if (isComparison || isLogicAndOr) {
    throw new SinthError(
        `Unexpected expression '${identName} ...' at top level. Did you mean to wrap this in an 'if' block?`,
        this.peek().loc,
    );
}

// top-level assignment: ident = expr
if (nextType === TT.EQUALS ||
(nextType === TT.OP_PLUS  && this.tokens[this.pos + 2]?.type === TT.EQUALS) ||
(nextType === TT.OP_MINUS && this.tokens[this.pos + 2]?.type === TT.EQUALS)) {
    this.consume(TT.IDENT); // consume name
    let op: AssignOp = "=";
    if      (this.check(TT.OP_PLUS))  { this.consume(TT.OP_PLUS);  op = "+="; }
    else if (this.check(TT.OP_MINUS)) { this.consume(TT.OP_MINUS); op = "-="; }
    this.consume(TT.EQUALS);
    const expr = this.parseExpression();
    if (expr) {
        const js = `${identName} ${op} ${compileExprToJS(expr)};
sinthRender();`;
        scripts.push({ raw: js, attrs: {}, loc: this.peek().loc });
    }
    continue;
}

// component usage
this.pos = savedPos;
uses.push(this.parseCompUse());
}
      else throw new SinthError(
        `Unexpected token '${this.peek().value}' (${TT[this.peek().type]}) at top level`,
        this.peek().loc,
      );
    }

    return { filePath: this.file, isPage, imports, meta, defs, uses, styles, scripts, customEls, varDecls };
  }

  private flattenIfToUses(ifNode: IfBlock, scripts: ScriptBlock[]): CompUse[] {
    const bodyHasComp  = ifNode.body.some(c => c.kind === "use");
    const elseHasComp  = (ifNode.elseBody ?? []).some(c => c.kind === "use");
    if (!bodyHasComp && !elseHasComp) {
      scripts.push({ raw: compileIfToJS(ifNode), attrs: {}, loc: ifNode.loc });
      return [];
    }
    const syntheticUse: CompUse = {
      kind: "use",
      name: "__IF_ROOT__",
      attrs: [],
      children: [ifNode],
      loc: ifNode.loc,
    };
    return [syntheticUse];
  }

  // imports

  private parseImport(): ImportNode {
    const loc = this.consume(TT.KW_IMPORT).loc;
    if (this.check(TT.KW_CSS)) {
      this.consume(TT.KW_CSS);
      return { kind: "css", path: this.consume(TT.STRING).value, loc };
    }
    if (this.check(TT.STRING)) {
      return { kind: "sinth", path: this.consume(TT.STRING).value, loc };
    }
    if (this.check(TT.IDENT)) {
      const name = this.consume(TT.IDENT).value;
      let alias: string | undefined;
      if (this.check(TT.KW_AS)) { this.consume(TT.KW_AS); alias = this.consume(TT.IDENT).value; }
      return { kind: "js", name, alias, loc };
    }
    throw new SinthError(`Expected import path, library name, or 'css'`, loc);
  }

  // metadata

  private isMetaStart(): boolean {
    if (!this.check(TT.IDENT)) return false;
    return this.tokens[this.pos + 1]?.type === TT.EQUALS;
  }

  private parseMeta(): MetaEntry {
    const loc = this.peek().loc;
    const key = this.consume(TT.IDENT).value;
    this.consume(TT.EQUALS);
    return { key, value: this.parseLiteral(), loc };
  }

  // var declarations

  private parseVarDeclaration(): VarDeclaration | null {
    const loc = this.peek().loc;
    this.consume(TT.IDENT); // consume 'var'

    const typeTok = this.consume(TT.IDENT);
    let typeStr = typeTok.value;
    if (this.check(TT.LBRACKET) && this.tokens[this.pos + 1]?.type === TT.RBRACKET) {
      this.consume(TT.LBRACKET); this.consume(TT.RBRACKET);
      typeStr = "str[]";
    }
    if (!["int", "str", "bool", "str[]", "obj"].includes(typeStr)) {
      throw new SinthError(`Unknown type '${typeStr}'. Expected: int, str, bool, str[], obj`, typeTok.loc);
    }

    const nameTok = this.consume(TT.IDENT);
    let val: Literal | null = null;

    if (this.check(TT.EQUALS)) {
      this.consume(TT.EQUALS);
      if (this.check(TT.LBRACKET)) {
        val = this.parseArrayLiteral();
      } else if (this.check(TT.IDENT)) {
        const refName = this.consume(TT.IDENT).value;
        val = { kind: "str", value: `__VAR__${refName}` };
      } else {
        val = this.parseLiteral();
      }
    }

    return { kind: "var", name: nameTok.value, varType: typeStr as VarType, value: val, loc };
  }

private parseArrayLiteral(): Literal {
    this.consume(TT.LBRACKET);
    const items: any[] = [];
    while (!this.check(TT.RBRACKET) && !this.check(TT.EOF)) {
      if (this.check(TT.LBRACE)) {
        items.push(this.parseObjectLiteral());
      } else if (this.check(TT.STRING)) {
        items.push(this.consume(TT.STRING).value);
      } else if (this.check(TT.NUMBER)) {
        items.push(parseFloat(this.consume(TT.NUMBER).value));
      } else if (this.check(TT.BOOL_TRUE)) {
        this.consume(TT.BOOL_TRUE);
        items.push(true);
      } else if (this.check(TT.BOOL_FALSE)) {
        this.consume(TT.BOOL_FALSE);
        items.push(false);
      } else if (this.check(TT.NULL_LIT)) {
        this.consume(TT.NULL_LIT);
        items.push(null);
      }
      if (this.check(TT.COMMA)) this.consume(TT.COMMA); else break;
    }
    this.consume(TT.RBRACKET);
    return { kind: "str", value: `__ARR__${JSON.stringify(items)}` };
  }

  private parseObjectLiteral(): Record<string, any> {
    this.consume(TT.LBRACE);
    const obj: Record<string, any> = {};
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      const key = this.consume(TT.IDENT).value;
      this.consume(TT.COLON);
      if (this.check(TT.STRING)) {
        obj[key] = this.consume(TT.STRING).value;
      } else if (this.check(TT.NUMBER)) {
        obj[key] = parseFloat(this.consume(TT.NUMBER).value);
      } else if (this.check(TT.BOOL_TRUE)) {
        this.consume(TT.BOOL_TRUE);
        obj[key] = true;
      } else if (this.check(TT.BOOL_FALSE)) {
        this.consume(TT.BOOL_FALSE);
        obj[key] = false;
      } else if (this.check(TT.NULL_LIT)) {
        this.consume(TT.NULL_LIT);
        obj[key] = null;
      } else {
        throw new SinthError(`Expected literal value for key '${key}'`, this.peek().loc);
      }
      if (this.check(TT.COMMA)) this.consume(TT.COMMA);
    }
    this.consume(TT.RBRACE);
    return obj;
  }

  // expression parsing

  parseExpression(): Expression | null {
    const tok = this.peek();

    // Unary 'not'
    if (tok.type === TT.IDENT && tok.value === "not") {
      this.consume(TT.IDENT);
      const operand = this.parseExpression();
      if (!operand) throw new SinthError("Expected expression after 'not'", tok.loc);
      return { kind: "unary", op: "not", operand };
    }

    if (this.check(TT.LPAREN)) {
      this.consume(TT.LPAREN);
      const inner = this.parseExpression();
      if (!inner) throw new SinthError("Expected expression after '('", this.peek().loc);
      if (!this.check(TT.RPAREN)) throw new SinthError("Expected closing ')'", this.peek().loc);
      this.consume(TT.RPAREN);
      return this.parseBinaryRHS(inner);
    }

    // literal
    if (this.check(TT.STRING) || this.check(TT.NUMBER) || this.check(TT.BOOL_TRUE) ||
        this.check(TT.BOOL_FALSE) || this.check(TT.NULL_LIT)) {
      const lit = this.parseLiteral();
      const base: Expression = { kind: "literal", value: lit };
      return this.parseBinaryRHS(base);
    }

    // var or assignment
    if (tok.type === TT.IDENT) {
      const name = this.consume(TT.IDENT).value;
      
      // dot notation!! -> user.age
      if (this.check(TT.DOT)) {
        this.consume(TT.DOT);
        const propName = this.consume(TT.IDENT).value;
        const fullName = `${name}.${propName}`;
        
        // compound-assignment operators
        const nextType = this.tokens[this.pos]?.type;
        if (nextType === TT.OP_PLUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
          this.consume(TT.OP_PLUS); this.consume(TT.EQUALS);
          const rhs = this.parseExpression();
          if (!rhs) throw new SinthError("Expected expression after +=", this.peek().loc);
          return { kind: "assign", target: fullName, op: "+=", right: rhs };
        }
        if (nextType === TT.OP_MINUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
          this.consume(TT.OP_MINUS); this.consume(TT.EQUALS);
          const rhs = this.parseExpression();
          if (!rhs) throw new SinthError("Expected expression after -=", this.peek().loc);
          return { kind: "assign", target: fullName, op: "-=", right: rhs };
        }
        if (nextType === TT.EQUALS) {
          this.consume(TT.EQUALS);
          const rhs = this.parseExpression();
          if (!rhs) throw new SinthError("Expected expression after =", this.peek().loc);
          return { kind: "assign", target: fullName, op: "=", right: rhs };
        }
        
        const varExpr: Expression = { kind: "variable", name: fullName };
        return this.parseBinaryRHS(varExpr);
      }

      const nextType = this.tokens[this.pos]?.type;
      if (nextType === TT.OP_PLUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
        this.consume(TT.OP_PLUS); this.consume(TT.EQUALS);
        const rhs = this.parseExpression();
        if (!rhs) throw new SinthError("Expected expression after +=", this.peek().loc);
        return { kind: "assign", target: name, op: "+=", right: rhs };
      }
      if (nextType === TT.OP_MINUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
        this.consume(TT.OP_MINUS); this.consume(TT.EQUALS);
        const rhs = this.parseExpression();
        if (!rhs) throw new SinthError("Expected expression after -=", this.peek().loc);
        return { kind: "assign", target: name, op: "-=", right: rhs };
      }
      // Simple assignment
      if (nextType === TT.EQUALS) {
        this.consume(TT.EQUALS);
        const rhs = this.parseExpression();
        if (!rhs) throw new SinthError("Expected expression after =", this.peek().loc);
        return { kind: "assign", target: name, op: "=", right: rhs };
      }

      const varExpr: Expression = { kind: "variable", name };
      return this.parseBinaryRHS(varExpr);
    }

    return null;
  }

  private parseBinaryRHS(left: Expression): Expression {
    const t = this.peek().type;
    let op: BinaryOp | null = null;
    if      (t === TT.OP_EQEQ)  op = "==";
    else if (t === TT.OP_NEQ)   op = "!=";
    else if (t === TT.OP_LT)    op = "<";
    else if (t === TT.OP_GT)    op = ">";
    else if (t === TT.OP_LTEQ)  op = "<=";
    else if (t === TT.OP_GTEQ)  op = ">=";
    else if (t === TT.OP_PLUS)  op = "+";
    else if (t === TT.OP_MINUS) op = "-";
    else if (t === TT.OP_STAR)  op = "*";
    else if (t === TT.OP_SLASH) op = "/";
    else if (t === TT.IDENT && this.peek().value === "and") op = "and";
    else if (t === TT.IDENT && this.peek().value === "or")  op = "or";

    if (!op) return left;
    this.pos++;

    const right = this.parseExpression();
    if (!right) throw new SinthError(`Expected expression after '${op}'`, this.peek().loc);
    return { kind: "binary", left, op, right };
  }

  // component definitions

  private parseCompDef(): CompDef {
    const loc    = this.consume(TT.KW_COMPONENT).loc;
    const name   = this.consume(TT.IDENT).value;
    const params = this.parseParamDecls();
    const rawTok = this.consume(TT.RAW_BLOCK);
    const { body, styles, scripts } = this.parseCompBody(rawTok.value, rawTok.loc);
    return { name, params, body, styles, scripts, loc };
  }

  private parseCustomEl(): CustomElDecl {
    const loc = this.peek().loc;
    if      (this.check(TT.KW_CUSTOM_EL)) this.consume(TT.KW_CUSTOM_EL);
    else if (this.check(TT.KW_CUSTOM))    this.consume(TT.KW_CUSTOM);
    const tagName   = this.consume(TT.IDENT).value;
    const sinthName = tagNameToPascal(tagName);
    const params    = this.parseParamDecls();
    return { sinthName, tagName, params, loc };
  }

  private parseParamDecls(): ParamDecl[] {
    const params: ParamDecl[] = [];
    if (!this.check(TT.LPAREN)) return params;
    this.consume(TT.LPAREN);
    while (!this.check(TT.RPAREN)) {
      const ploc    = this.peek().loc;
      const nameTok = this.check(TT.IDENT) ? this.consume(TT.IDENT) : this.consume(this.peek().type);
      const pname   = nameTok.value;
      let defaultVal: Literal | undefined;
      if (this.check(TT.EQUALS)) { this.consume(TT.EQUALS); defaultVal = this.parseLiteral(); }
      params.push({ name: pname, defaultVal, loc: ploc });
      if (!this.check(TT.RPAREN)) this.consume(TT.COMMA);
    }
    this.consume(TT.RPAREN);
    return params;
  }

  private parseCompBody(
    raw: string,
    loc: Loc,
  ): { body: Child[]; styles: StyleBlock[]; scripts: ScriptBlock[] } {
    const tokens = new Lexer(raw, loc.file).tokenize();
    const sub    = new Parser(tokens, loc.file);
    sub._varDecls = this._varDecls;
    return sub.parseBodyContents();
  }

  private parseBodyContents(): { body: Child[]; styles: StyleBlock[]; scripts: ScriptBlock[] } {
    const body: Child[] = [], styles: StyleBlock[] = [], scripts: ScriptBlock[] = [];
    while (!this.check(TT.EOF)) {
      if      (this.check(TT.KW_STYLE))  { styles.push(this.parseStyleBlock()); }
      else if (this.check(TT.KW_SCRIPT)) { scripts.push(this.parseScriptBlock()); }
      else if (this.check(TT.STRING))    {
        const loc = this.peek().loc;
        body.push({ kind: "text", value: this.consume(TT.STRING).value, loc });
      }
      else if (this.check(TT.IDENT) && this.peek().value === "var") {
        const vd = this.parseVarDeclaration();
        if (vd) this._varDecls.push(vd);
        continue;
      }
      else if (this.check(TT.KW_IF))    { body.push(this.parseIfBlock()); }
      else if (this.check(TT.KW_FOR))   { body.push(this.parseForLoop()); }
      else if (this.check(TT.IDENT))    { body.push(this.parseCompUse()); }
      else throw new SinthError(
        `Unexpected token '${this.peek().value}' in component body`,
        this.peek().loc,
      );
    }
    return { body, styles, scripts };
  }

  // if / else blocks

  private parseIfBlock(): IfBlock {
    const loc       = this.consume(TT.KW_IF).loc;
    const condition = this.parseExpression();
    if (!condition) throw new SinthError("Expected condition after 'if'", this.peek().loc);

    if (!this.check(TT.LBRACE)) throw new SinthError("Expected '{' after if condition", this.peek().loc);
    this.consume(TT.LBRACE);
    const body = this.parseUnifiedBody();
    this.consume(TT.RBRACE);

    let elseBody: Child[] | undefined;
    if (this.check(TT.KW_ELSE)) {
      this.consume(TT.KW_ELSE);
      if (this.check(TT.KW_IF)) {
        elseBody = [this.parseIfBlock()];
      } else {
        if (!this.check(TT.LBRACE)) throw new SinthError("Expected '{' after else", this.peek().loc);
        this.consume(TT.LBRACE);
        elseBody = this.parseUnifiedBody();
        this.consume(TT.RBRACE);
      }
    }

    return { kind: "if", condition, body, elseBody, loc };
  }

  private parseUnifiedBody(): Child[] {
    const children: Child[] = [];

    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      if (this.check(TT.KW_IF))  { children.push(this.parseIfBlock());  continue; }
      if (this.check(TT.KW_FOR)) { children.push(this.parseForLoop());  continue; }
      if (this.check(TT.STRING)) {
        const loc = this.peek().loc;
        children.push({ kind: "text", value: this.consume(TT.STRING).value, loc });
        continue;
      }

      if (this.check(TT.IDENT) && this.peek().value === "var") {
        const vd = this.parseVarDeclaration();
        if (vd) this._varDecls.push(vd);
        continue;
      }

      if (this.check(TT.IDENT)) {
        const loc      = this.peek().loc;
        const name     = this.peek().value;
        const nextType = this.tokens[this.pos + 1]?.type;
        const nextNextType = this.tokens[this.pos + 2]?.type;

        if (nextType === TT.DOT && (nextNextType === TT.EQUALS || 
            (nextNextType === TT.OP_PLUS && this.tokens[this.pos + 3]?.type === TT.EQUALS) ||
            (nextNextType === TT.OP_MINUS && this.tokens[this.pos + 3]?.type === TT.EQUALS))) {
          let fullName = this.consume(TT.IDENT).value;
          this.consume(TT.DOT);
          fullName = fullName + "." + this.consume(TT.IDENT).value;
          
          let op: AssignOp = "=";
          const afterDotType = this.tokens[this.pos]?.type;
          if (afterDotType === TT.OP_PLUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
            this.consume(TT.OP_PLUS); op = "+=";
          } else if (afterDotType === TT.OP_MINUS && this.tokens[this.pos + 1]?.type === TT.EQUALS) {
            this.consume(TT.OP_MINUS); op = "-=";
          }
          this.consume(TT.EQUALS);
          const rhs = this.parseExpression();
          if (!rhs) throw new SinthError("Expected expression after assignment", this.peek().loc);
          const assignExpr: Expression = { kind: "assign", target: fullName, op, right: rhs };
          children.push({ kind: "assign_stmt", expression: assignExpr, loc });
          continue;
        }

        // assignment: ident = expr  |  ident += expr  |  ident -= expr
        const isSimpleAssign = nextType === TT.EQUALS;
        const isPlusAssign   = nextType === TT.OP_PLUS  && this.tokens[this.pos + 2]?.type === TT.EQUALS;
        const isMinusAssign  = nextType === TT.OP_MINUS && this.tokens[this.pos + 2]?.type === TT.EQUALS;

        if (isSimpleAssign || isPlusAssign || isMinusAssign) {
          this.consume(TT.IDENT); // consume name
          let op: AssignOp = "=";
          if      (isPlusAssign)  { this.consume(TT.OP_PLUS);  op = "+="; }
          else if (isMinusAssign) { this.consume(TT.OP_MINUS); op = "-="; }
          this.consume(TT.EQUALS);
          const rhs = this.parseExpression();
          if (!rhs) throw new SinthError("Expected expression after assignment", this.peek().loc);
          const assignExpr: Expression = { kind: "assign", target: name, op, right: rhs };
          children.push({ kind: "assign_stmt", expression: assignExpr, loc });
          continue;
        }

        // Component usage: ident( or ident{ or ident RAW_BLOCK
        if (nextType === TT.LPAREN || nextType === TT.LBRACE || nextType === TT.RAW_BLOCK) {
          children.push(this.parseCompUse());
          continue;
        }

        // var expression
        // check dot notation variable reference (user.age without assignment)
        if (nextType === TT.DOT) {
          let fullName = this.consume(TT.IDENT).value;
          this.consume(TT.DOT);
          fullName = fullName + "." + this.consume(TT.IDENT).value;
          children.push({ kind: "expr", expression: { kind: "variable", name: fullName }, loc });
          continue;
        }

        // simple variable reference
        this.consume(TT.IDENT);
        children.push({ kind: "expr", expression: { kind: "variable", name }, loc });
        continue;
      }

      throw new SinthError(
        `Unexpected token '${this.peek().value}' in if/else body`,
        this.peek().loc,
      );
    }

    return children;
  }

  // for loops

  private parseForLoop(): ForLoop {
    const loc     = this.consume(TT.KW_FOR).loc;
    const firstVar = this.consume(TT.IDENT).value;
    let keyVar: string | undefined;
    let itemVar: string;
    let indexVar: string | undefined;
    if (this.check(TT.COMMA)) {
      this.consume(TT.COMMA);
      keyVar = firstVar;
      itemVar = this.consume(TT.IDENT).value;
      if (this.check(TT.COMMA)) {
        this.consume(TT.COMMA);
        indexVar = this.consume(TT.IDENT).value;
      }
    } else {
      itemVar = firstVar;
      if (this.check(TT.COMMA)) {
        this.consume(TT.COMMA);
        indexVar = this.consume(TT.IDENT).value;
      }
    }
    if (!this.check(TT.KW_IN)) throw new SinthError("Expected 'in' after loop variable", this.peek().loc);
    this.consume(TT.KW_IN);
    const arrayVar = this.consume(TT.IDENT).value;

    if (!this.check(TT.LBRACE)) throw new SinthError("Expected '{' after for..in expression", this.peek().loc);
    this.consume(TT.LBRACE);
    this.loopVar = itemVar;
    const body = this.parseChildList();
    this.loopVar = null;
    this.consume(TT.RBRACE);

    return { kind: "for", keyVar, itemVar, indexVar, arrayVar, body, loc };
  }

  // component usages

  private parseCompUse(): CompUse {
    const loc  = this.peek().loc;
    const name = this.consume(TT.IDENT).value;
    const attrs: Attr[] = [];

    if (this.check(TT.LPAREN)) {
      this.consume(TT.LPAREN);
      while (!this.check(TT.RPAREN)) {
        const aloc  = this.peek().loc;
        const aname = this.consume(TT.IDENT).value;
        let value: Literal | null = null;
        if (this.check(TT.COLON)) {
          this.consume(TT.COLON);
          if (this.isEventAttr(aname)) {
            if (this.check(TT.STRING)) {
              value = this.parseLiteral();
            } else {
              const savedPos = this.pos;
              const expr     = this.parseExpression();
              if (expr && (this.check(TT.COMMA) || this.check(TT.RPAREN))) {
                value = { kind: "str", value: "__EXPR__" + JSON.stringify(expr) };
              } else {
                this.pos = savedPos;
                value    = this.parseLiteral();
              }
            }
          } else {
            if (this.check(TT.STRING) || this.check(TT.NUMBER) ||
                this.check(TT.BOOL_TRUE) || this.check(TT.BOOL_FALSE) ||
                this.check(TT.NULL_LIT) || this.check(TT.LBRACKET) || this.check(TT.LBRACE)) {
              value = this.parseLiteral();
            } else if (this.check(TT.IDENT) || this.check(TT.LPAREN)) {
              const savedPos = this.pos;
              const expr = this.parseExpression();
              if (expr && (this.check(TT.COMMA) || this.check(TT.RPAREN))) {
                value = { kind: "str", value: "__EXPR__" + JSON.stringify(expr) };
              } else {
                this.pos = savedPos;
                if (this.check(TT.IDENT)) {
                  value = { kind: "str", value: this.consume(TT.IDENT).value };
                } else {
                  value = this.parseLiteral();
                }
              }
            } else {
              value = this.parseLiteral();
            }
          }
        }
        attrs.push({ name: aname, value, loc: aloc });
        if (!this.check(TT.RPAREN)) this.consume(TT.COMMA);
      }
      this.consume(TT.RPAREN);
    }

    const children: Child[] = [];
    if (this.check(TT.RAW_BLOCK)) {
      const rawTok = this.consume(TT.RAW_BLOCK);
      const tokens = new Lexer(rawTok.value, rawTok.loc.file).tokenize();
      const sub    = new Parser(tokens, rawTok.loc.file);
      sub._varDecls = this._varDecls;
      children.push(...sub.parseChildList());
    } else if (this.check(TT.LBRACE)) {
      this.consume(TT.LBRACE);
      children.push(...this.parseChildList());
      this.consume(TT.RBRACE);
    }

    return { kind: "use", name, attrs, children, loc };
  }

  private isEventAttr(name: string): boolean {
    return name.startsWith("on") && name.length > 2 && name[2] === name[2].toUpperCase();
  }

  private parseChildList(): Child[] {
    const children: Child[] = [];
    while (!this.check(TT.EOF) && !this.check(TT.RBRACE)) {
      if (this.check(TT.STRING)) {
        const loc      = this.peek().loc;
        let leftExpr: Expression = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
        while (this.check(TT.OP_PLUS)) {
          this.consume(TT.OP_PLUS);
          let rhs: Expression | null = null;
          if      (this.check(TT.STRING)) {
            rhs = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
          } else if (this.check(TT.IDENT)) {
            const rhsName = this.consume(TT.IDENT).value;
            if (this.check(TT.DOT)) {
              this.consume(TT.DOT);
              rhs = { kind: "variable", name: rhsName + "." + this.consume(TT.IDENT).value };
            } else {
              rhs = { kind: "variable", name: rhsName };
            }
          } else {
            rhs = this.parseExpression();
          }
          if (!rhs) throw new SinthError("Expected expression after +", this.peek().loc);
          leftExpr = { kind: "binary", left: leftExpr, op: "+", right: rhs };
        }
        children.push({ kind: "expr", expression: leftExpr, loc });
      }
      else if (this.check(TT.IDENT) && this.peek().value === "var") {
        const vd = this.parseVarDeclaration();
        if (vd) this._varDecls.push(vd);
        continue;
      }
      else if (this.check(TT.KW_IF))  { children.push(this.parseIfBlock());  }
      else if (this.check(TT.KW_FOR)) { children.push(this.parseForLoop());  }
      else if (this.check(TT.IDENT))  {
        const loc  = this.peek().loc;
        const rawName = this.peek().value;
        const nextType = this.tokens[this.pos + 1]?.type;
        
        if (nextType === TT.DOT) {
          let fullName = this.consume(TT.IDENT).value;
          this.consume(TT.DOT);
          fullName = fullName + "." + this.consume(TT.IDENT).value;
          const afterDotType = this.tokens[this.pos]?.type;
          
          if (afterDotType === TT.OP_PLUS) {
            let leftExpr: Expression = { kind: "variable", name: fullName };
            while (this.check(TT.OP_PLUS)) {
              this.consume(TT.OP_PLUS);
              let rhs: Expression | null = null;
              if (this.check(TT.STRING)) {
                rhs = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
              } else if (this.check(TT.IDENT)) {
                const rhsName = this.consume(TT.IDENT).value;
                if (this.check(TT.DOT)) {
                  this.consume(TT.DOT);
                  rhs = { kind: "variable", name: rhsName + "." + this.consume(TT.IDENT).value };
                } else {
                  rhs = { kind: "variable", name: rhsName };
                }
              } else {
                rhs = this.parseExpression();
              }
              if (!rhs) throw new SinthError("Expected expression after +", this.peek().loc);
              leftExpr = { kind: "binary", left: leftExpr, op: "+", right: rhs };
            }
            children.push({ kind: "expr", expression: leftExpr, loc });
          } else if (this.loopVar && fullName.split('.')[0] === this.loopVar) {
            children.push({ kind: "expr", expression: { kind: "variable", name: fullName }, loc });
          } else if (afterDotType === TT.LPAREN || afterDotType === TT.LBRACE || afterDotType === TT.RAW_BLOCK) {
            throw new SinthError(`Unexpected dot notation before component usage`, loc);
          } else {
            children.push({ kind: "expr", expression: { kind: "variable", name: fullName }, loc });
          }
        } else if (nextType === TT.OP_PLUS) {
          const name = this.consume(TT.IDENT).value;
          let leftExpr: Expression = { kind: "variable", name };
          while (this.check(TT.OP_PLUS)) {
            this.consume(TT.OP_PLUS);
            let rhs: Expression | null = null;
            if (this.check(TT.STRING)) {
              rhs = { kind: "literal", value: { kind: "str", value: this.consume(TT.STRING).value } };
            } else if (this.check(TT.IDENT)) {
              const rhsName = this.consume(TT.IDENT).value;
              if (this.check(TT.DOT)) {
                this.consume(TT.DOT);
                rhs = { kind: "variable", name: rhsName + "." + this.consume(TT.IDENT).value };
              } else {
                rhs = { kind: "variable", name: rhsName };
              }
            } else {
              rhs = this.parseExpression();
            }
            if (!rhs) throw new SinthError("Expected expression after +", this.peek().loc);
            leftExpr = { kind: "binary", left: leftExpr, op: "+", right: rhs };
          }
          children.push({ kind: "expr", expression: leftExpr, loc });
        } else if (this.loopVar && rawName === this.loopVar) {
          this.consume(TT.IDENT);
          children.push({ kind: "expr", expression: { kind: "variable", name: rawName }, loc });
        } else if (nextType === TT.LPAREN || nextType === TT.LBRACE || nextType === TT.RAW_BLOCK) {
          children.push(this.parseCompUse());
        } else {
          const name = this.consume(TT.IDENT).value;
          children.push({ kind: "expr", expression: { kind: "variable", name }, loc });
        }
      }
      else throw new SinthError(`Unexpected token '${this.peek().value}' in children`, this.peek().loc);
    }
    return children;
  }

  // style & script blocks

  private parseStyleBlock(): StyleBlock {
    const loc = this.consume(TT.KW_STYLE).loc;
    let global = false, lang: "css" | "scss" = "css", target: string | undefined;
    const extraAttrs: Record<string, string> = {};

    while (!this.check(TT.RAW_BLOCK) && !this.check(TT.EOF)) {
      if (this.check(TT.KW_GLOBAL)) { global = true; this.consume(TT.KW_GLOBAL); }
      else if (this.check(TT.KW_LANG)) {
        this.consume(TT.KW_LANG); this.consume(TT.EQUALS);
        const lv = this.consume(TT.STRING).value;
        if (lv !== "css" && lv !== "scss") throw new SinthError(`Unsupported style lang '${lv}'`, loc);
        lang = lv as "css" | "scss";
      }
      else if (this.check(TT.IDENT)) {
        if (this.tokens[this.pos + 1]?.type !== TT.EQUALS) {
          target = this.consume(TT.IDENT).value;
        } else {
          const k = this.consume(TT.IDENT).value;
          this.consume(TT.EQUALS);
          extraAttrs[k] = this.consume(TT.STRING).value;
        }
      }
      else throw new SinthError(`Unexpected token '${this.peek().value}' in style modifiers`, this.peek().loc);
    }

    return { global, lang, raw: this.consume(TT.RAW_BLOCK).value, target, extraAttrs, loc };
  }

  private parseScriptBlock(): ScriptBlock {
    const loc = this.consume(TT.KW_SCRIPT).loc;
    const attrs: Record<string, string> = {};
    while (!this.check(TT.RAW_BLOCK) && !this.check(TT.EOF)) {
      const key = this.consume(TT.IDENT).value;
      if (this.check(TT.EQUALS)) { this.consume(TT.EQUALS); attrs[key] = this.consume(TT.STRING).value; }
      else { attrs[key] = "true"; }
    }
    return { raw: this.consume(TT.RAW_BLOCK).value, attrs, loc };
  }

 private parseLiteral(): Literal {
    const tok = this.peek();
    if (this.check(TT.LBRACKET))  { return this.parseArrayLiteral(); }
    if (this.check(TT.LBRACE))    { 
      const obj = this.parseObjectLiteral();
      return { kind: "str", value: JSON.stringify(obj) };
    }
    if (this.check(TT.STRING))    { this.consume(TT.STRING);    return { kind: "str",  value: tok.value }; }
    if (this.check(TT.NUMBER))    { this.consume(TT.NUMBER);    return { kind: "num",  value: parseFloat(tok.value) }; }
    if (this.check(TT.BOOL_TRUE)) { this.consume(TT.BOOL_TRUE); return { kind: "bool", value: true }; }
    if (this.check(TT.BOOL_FALSE)){ this.consume(TT.BOOL_FALSE);return { kind: "bool", value: false }; }
    if (this.check(TT.NULL_LIT))  { this.consume(TT.NULL_LIT);  return { kind: "null" }; }
    throw new SinthError(`Expected literal value, got '${tok.value}' (${TT[tok.type]})`, tok.loc);
  }

  private peek(): Token         { return this.tokens[this.pos]; }
  private check(t: TT): boolean { return this.tokens[this.pos]?.type === t; }
  private consume(t: TT): Token {
    const tok = this.tokens[this.pos];
    if (tok.type !== t) {
      throw new SinthError(
        `Expected ${TT[t]}, got '${tok.value}' (${TT[tok.type]})`,
        tok.loc,
      );
    }
    this.pos++;
    return tok;
  }
}

// import resolver

interface ResolverConfig { projectRoot: string; libraryPaths: string[] }

interface ResolvedImports {
  allDefs:   Map<string, CompDef>;
  customEls: Map<string, CustomElInfo>;
  cssLinks:  string[];
  jsLinks:   { src: string; attrs: Record<string, string> }[];
}

const IMPORT_STACK: string[] = [];

function parseFile(filePath: string): SinthFile {
  if (!fs.existsSync(filePath)) throw new SinthError(`File not found: ${filePath}`);
  const src     = fs.readFileSync(filePath, "utf-8");
  const srcLines = src.split("\n");
  try {
    const tokens = new Lexer(src, filePath).tokenize();
    return new Parser(tokens, filePath).parse();
  } catch (e) {
    if (e instanceof SinthError) throw e.withSource(srcLines);
    throw e;
  }
}

function resolveImports(
  file:    SinthFile,
  cfg:     ResolverConfig,
  visited: Set<string> = new Set(),
): ResolvedImports {
  const allDefs   = new Map<string, CompDef>();
  const customEls = new Map<string, CustomElInfo>();
  const cssLinks: string[] = [];
  const jsLinks:  { src: string; attrs: Record<string, string> }[] = [];

  for (const def of file.defs) {
    if (BUILTIN_MAP[def.name]) {
      throw new SinthError(`'${def.name}' is a built-in Sinth component and cannot be redefined.`, def.loc);
    }
    if (allDefs.has(def.name)) throw new SinthError(`Duplicate component definition '${def.name}'`, def.loc);
    allDefs.set(def.name, def);
  }

  for (const el of file.customEls) {
    customEls.set(el.sinthName, { tagName: el.tagName, params: el.params });
  }

  if (!file.isPage && file.meta.length > 0) {
    for (const m of file.meta) {
      SinthWarning.emit(`Metadata '${m.key}' in component file '${file.filePath}' has no effect.`, m.loc);
    }
  }

  for (const imp of file.imports) {
    if (imp.kind === "css") {
      const r = resolveRelative(imp.path, file.filePath);
      if (!cssLinks.includes(r)) cssLinks.push(r);

    } else if (imp.kind === "js") {
      const src = resolveLibrary(imp.name, cfg);
      jsLinks.push({ src, attrs: {} });

      for (const libDir of cfg.libraryPaths) {
        const companion = path.join(libDir, imp.name + ".sinth");
        if (fs.existsSync(companion) && !visited.has(companion)) {
          visited.add(companion);
          IMPORT_STACK.push(companion);
          const sub = resolveImports(parseFile(companion), cfg, visited);
          IMPORT_STACK.pop();
          for (const [n, d] of sub.allDefs)   allDefs.set(n, d);
          for (const [n, e] of sub.customEls) customEls.set(n, e);
        }
      }

    } else if (imp.kind === "sinth") {
      const resolved = resolveSinthPath(imp.path, file.filePath, cfg);

      if (IMPORT_STACK.includes(resolved)) {
        throw new SinthError(
          `Circular import: ${[...IMPORT_STACK, resolved].join(" → ")}`
        );
      }
      if (visited.has(resolved)) continue;
      visited.add(resolved);

      IMPORT_STACK.push(resolved);
      const imported = parseFile(resolved);
      IMPORT_STACK.pop();

      const sub = resolveImports(imported, cfg, visited);
      for (const [name, def] of sub.allDefs) {
        if (allDefs.has(name)) throw new SinthError(`Component '${name}' defined in multiple imported files.`);
        allDefs.set(name, def);
      }
      for (const [n, e] of sub.customEls) customEls.set(n, e);
      for (const l of sub.cssLinks)  if (!cssLinks.includes(l)) cssLinks.push(l);
      for (const j of sub.jsLinks)   jsLinks.push(j);
    }
  }

  return { allDefs, customEls, cssLinks, jsLinks };
}

function resolveRelative(p: string, fromFile: string): string {
  if (p.startsWith("./") || p.startsWith("../")) return path.resolve(path.dirname(fromFile), p);
  return p;
}

function resolveLibrary(name: string, cfg: ResolverConfig): string {
  const base = name.endsWith(".js") ? name : name + ".js";
  for (const libDir of cfg.libraryPaths) {
    const c = path.join(libDir, base);
    if (fs.existsSync(c)) return c;
  }
  return `/libraries/${base}`;
}

function resolveSinthPath(p: string, fromFile: string, cfg: ResolverConfig): string {
  if (p.startsWith("./") || p.startsWith("../")) {
    const r  = path.resolve(path.dirname(fromFile), p);
    if (fs.existsSync(r)) return r;
    const w = r.endsWith(".sinth") ? "" : r + ".sinth";
    if (w && fs.existsSync(w)) return w;
    throw new SinthError(`Cannot resolve import '${p}' from '${fromFile}'`);
  }

  const relToFile    = path.resolve(path.dirname(fromFile), p);
  if (fs.existsSync(relToFile)) return relToFile;
  const relToFileExt = relToFile.endsWith(".sinth") ? relToFile : relToFile + ".sinth";
  if (fs.existsSync(relToFileExt)) return relToFileExt;

  for (const libDir of cfg.libraryPaths) {
    const c1 = path.join(libDir, p);
    if (fs.existsSync(c1)) return c1;
    const c2 = c1.endsWith(".sinth") ? c1 : c1 + ".sinth";
    if (fs.existsSync(c2)) return c2;
  }

  throw new SinthError(
    `Cannot resolve import '${p}'\n  Tried: ${relToFileExt}\n  Library paths: ${cfg.libraryPaths.join(", ")}`
  );
}

// built-in component map

interface BuiltinInfo { tag: string; defaultClass?: string; voidEl?: boolean }

const BUILTIN_MAP: Record<string, BuiltinInfo> = {
  // structural
  Main:        { tag: "main" },
  Header:      { tag: "header" },
  Footer:      { tag: "footer" },
  Nav:         { tag: "nav" },
  Section:     { tag: "section" },
  Article:     { tag: "article" },
  Aside:       { tag: "aside" },
  Div:         { tag: "div" },
  Span:        { tag: "span" },
  Hero:        { tag: "section", defaultClass: "hero" },
  Container:   { tag: "div",     defaultClass: "container" },
  Grid:        { tag: "div",     defaultClass: "grid" },
  Flex:        { tag: "div",     defaultClass: "flex" },
  Stack:       { tag: "div",     defaultClass: "stack" },
  Row:         { tag: "div",     defaultClass: "row" },
  Column:      { tag: "div",     defaultClass: "col" },
  CardGrid:    { tag: "div",     defaultClass: "card-grid" },
  // typography
  Heading:     { tag: "h1" },
  SubHeading:  { tag: "p",      defaultClass: "subheading" },
  Paragraph:   { tag: "p" },
  Lead:        { tag: "p",      defaultClass: "lead" },
  Small:       { tag: "small" },
  Strong:      { tag: "strong" },
  Em:          { tag: "em" },
  Code:        { tag: "code" },
  Pre:         { tag: "pre" },
  Blockquote:  { tag: "blockquote" },
  Mark:        { tag: "mark" },
  Label:       { tag: "label" },
  Abbr:        { tag: "abbr" },
  Del:         { tag: "del" },
  Ins:         { tag: "ins" },
  Sub:         { tag: "sub" },
  Sup:         { tag: "sup" },
  Data:        { tag: "data" },
  Time:        { tag: "time" },
  Bdi:         { tag: "bdi" },
  Bdo:         { tag: "bdo" },
  Cite:        { tag: "cite" },
  Dfn:         { tag: "dfn" },
  Kbd:         { tag: "kbd" },
  Samp:        { tag: "samp" },
  Var:         { tag: "var" },
  Address:     { tag: "address" },
  Ruby:        { tag: "ruby" },
  Rt:          { tag: "rt" },
  Rp:          { tag: "rp" },
  // interactive
  Button:      { tag: "button" },
  Link:        { tag: "a" },
  NavLink:     { tag: "a" },
  Select:      { tag: "select" },
  Form:        { tag: "form" },
  Fieldset:    { tag: "fieldset" },
  Legend:      { tag: "legend" },
  Details:     { tag: "details" },
  Summary:     { tag: "summary" },
  Dialog:      { tag: "dialog" },
  Textarea:    { tag: "textarea" },
  Datalist:    { tag: "datalist" },
  Optgroup:    { tag: "optgroup" },
  Option:      { tag: "option" },
  Progress:    { tag: "progress" },
  Meter:       { tag: "meter" },
  Output:      { tag: "output" },
  Map:         { tag: "map" },
  // media
  Picture:     { tag: "picture" },
  Video:       { tag: "video" },
  Audio:       { tag: "audio" },
  Figure:      { tag: "figure" },
  Figcaption:  { tag: "figcaption" },
  Canvas:      { tag: "canvas" },
  Svg:         { tag: "svg" },
  IFrame:      { tag: "iframe" },
  Object:      { tag: "object" },
  // void elements
  Img:         { tag: "img",    voidEl: true },
  Logo:        { tag: "img",    voidEl: true },
  Input:       { tag: "input",  voidEl: true },
  Checkbox:    { tag: "input",  voidEl: true },
  Hr:          { tag: "hr",     voidEl: true },
  Br:          { tag: "br",     voidEl: true },
  Wbr:         { tag: "wbr",   voidEl: true },
  Source:      { tag: "source", voidEl: true },
  Embed:       { tag: "embed",  voidEl: true },
  Col:         { tag: "col",    voidEl: true },
  Area:        { tag: "area",   voidEl: true },
  // lists
  Ul: { tag: "ul" }, Ol: { tag: "ol" }, Li: { tag: "li" },
  Dl: { tag: "dl" }, Dt: { tag: "dt" }, Dd: { tag: "dd" },
  // tables
  Table:       { tag: "table" },
  Caption:     { tag: "caption" },
  Thead:       { tag: "thead" },
  Tbody:       { tag: "tbody" },
  Tfoot:       { tag: "tfoot" },
  Tr:          { tag: "tr" },
  Th:          { tag: "th" },
  Td:          { tag: "td" },
  Colgroup:    { tag: "colgroup" },
  // utility
  Template:    { tag: "template" },
  Slot:        { tag: "slot" },
  NoScript:    { tag: "noscript" },
  RawHTML:     { tag: "__RAW__" },
};

const VOID_TAGS = new Set([
  "area","base","br","col","embed","hr","img","input",
  "link","meta","param","source","track","wbr",
]);

const EVENT_RE = /^on[A-Z]/;
function eventAttrName(name: string): string | null {
  return EVENT_RE.test(name) ? name.toLowerCase() : null;
}

// preprocessor

/**
 * For who's reading this: This maps Sinth Style pseudo-class shorthand keywords to real CSS pseudo-classes.
 * these are used inside component style blocks, for example:  onHover { color: "blue" }
 */
const SINTH_PSEUDO_CLASS: Record<string, string> = {
  onHover:           ":hover",
  onFocus:           ":focus",
  onActive:          ":active",
  onVisited:         ":visited",
  onChecked:         ":checked",
  onDisabled:        ":disabled",
  onEnabled:         ":enabled",
  onRequired:        ":required",
  onOptional:        ":optional",
  onValid:           ":valid",
  onInvalid:         ":invalid",
  onPlaceholderShown:":placeholder-shown",
  onFocusWithin:     ":focus-within",
  onFocusVisible:    ":focus-visible",
  onFirst:           ":first-child",
  onLast:            ":last-child",
  onFirstOfType:     ":first-of-type",
  onLastOfType:      ":last-of-type",
  onEmpty:           ":empty",
  onTarget:          ":target",
  onLink:            ":link",
};

const SINTH_PSEUDO_ELEMENT: Record<string, string> = {
  before:       "::before",
  after:        "::after",
  placeholder:  "::placeholder",
  selection:    "::selection",
  firstLine:    "::first-line",
  firstLetter:  "::first-letter",
  marker:       "::marker",
  backdrop:     "::backdrop",
};

function sinthCompToSelector(name: string): string {
  const info = BUILTIN_MAP[name];
  if (!info) return name.toLowerCase();
  if (info.defaultClass) {
    const classes = info.defaultClass.split(" ").map(c => `.${c}`).join("");
    return `${info.tag}${classes}`;
  }
  return info.tag;
}

/**
 * supported conversions:
 *   - component names as selectors: `Paragraph { ... }` → `p { ... }`
 *   - pseudo-class shorthands: `onHover { ... }` → `&:hover { ... }`
 *   - pseudo-element shorthands: `before { ... }` → `&::before { ... }`
 *   - media queries: `media(maxWidth: "600px") { ... }` → `@media (max-width: 600px) { ... }`
 *   - CSS custom properties: `var --primary: "#3b82f6"` → `--primary: #3b82f6;`
 */
function preprocessSinthStyle(raw: string): string {
  const lines  = raw.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const indent  = line.match(/^(\s*)/)?.[1] ?? "";

    if (!trimmed) { result.push(line); continue; }

    if (trimmed.startsWith("--") && !trimmed.startsWith("--[")) { continue; }
    // Standard comments pass through
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      result.push(line); continue;
    }

    const mediaMatch = trimmed.match(/^media\s*\(([^)]+)\)\s*(\{?\s*)$/);
    if (mediaMatch) {
      const params = parseSinthMediaParams(mediaMatch[1]);
      result.push(`${indent}@media (${params}) {`);
      continue;
    }

    const blockMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9]*)(\s*\{\s*)$/);
    if (blockMatch) {
      const keyword = blockMatch[1];

      const pseudoCls = SINTH_PSEUDO_CLASS[keyword];
      if (pseudoCls) {
        result.push(`${indent}&${pseudoCls} {`);
        continue;
      }

      const pseudoEl = SINTH_PSEUDO_ELEMENT[keyword];
      if (pseudoEl) {
        result.push(`${indent}&${pseudoEl} {`);
        continue;
      }

      if (/^[A-Z]/.test(keyword) && BUILTIN_MAP[keyword]) {
        result.push(`${indent}${sinthCompToSelector(keyword)} {`);
        continue;
      }
    }

    const varPropMatch = trimmed.match(/^var\s+(--[a-zA-Z][a-zA-Z0-9-]*)\s*:\s*["']?([^"';]+)["']?\s*;?\s*$/);
    if (varPropMatch) {
      result.push(`${indent}${varPropMatch[1]}: ${varPropMatch[2].trim()};`);
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

function parseSinthMediaParams(params: string): string {
  const parts = params.split(",").map(p => {
    const m = p.trim().match(/^([a-zA-Z]+)\s*:\s*["']?([^"',]+)["']?\s*$/);
    if (!m) return p.trim();
    return `${camelToKebab(m[1])}: ${m[2].trim()}`;
  });
  return parts.join(") and (");
}

// style processor


function convertCSSProps(css: string): string {
  return css.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed)                        return line;
    if (trimmed === "}" || trimmed.startsWith("}")) return line;
    if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) return line;
    if (trimmed.startsWith("@"))         return line;
    if (trimmed.includes("{"))           return line;

    const m = line.match(/^(\s*)([a-zA-Z][a-zA-Z0-9-]*)(\s*:\s*)(.+?)(\s*;?\s*)$/);
    if (!m) return line;

    const [, indent, rawProp, , rawVal] = m;

    const hasCamelCase = /[a-z][A-Z]/.test(rawProp) || /^[A-Z]/.test(rawProp);
    const hasQuotedVal = /^["']/.test(rawVal.trim());
    if (!hasCamelCase && !hasQuotedVal) return line;

    let val = rawVal.trim();
    if (val.endsWith(";")) val = val.slice(0, -1).trimEnd();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    return `${indent}${camelToKebab(rawProp)}: ${val};`;
  }).join("\n");
}

function processStyleBlock(
  block:  StyleBlock,
  hash:   string,
  params: Map<string, string> = new Map(),
): string {
  let raw = block.raw;

  // 1. interpolate {param} placeholders
  if (params.size > 0) raw = interpolateAttr(raw, params);

  // 2. sinth style preprocessing
  raw = preprocessSinthStyle(raw);

  // 3. warn if & in plain CSS
  if (block.lang === "css" && raw.includes("&")) {
    SinthWarning.emit(
      `'&' (CSS nesting) found in style block. Nested selectors require a modern browser or lang="scss".`,
      block.loc,
    );
  }

  // 4. camelCase → kebab-case
  let css = convertCSSProps(raw);

  // 5. SCSS compilation
  if (block.lang === "scss") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sass: { compileString: (src: string) => { css: string } } = require("sass");
      css = sass.compileString(css).css;
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "MODULE_NOT_FOUND" || err.message?.includes("Cannot find module")) {
        throw new SinthError("SCSS requires the 'sass' package. Install with: npm install sass");
      }
      throw new SinthError(`SCSS compilation failed: ${err.message ?? String(e)}`);
    }
  }

  // 6. if target component given, wrap content in its CSS selector
  if (block.target) {
    const selector = sinthCompToSelector(block.target);
    css = `${selector} {\n${css}\n}`;
  }

  // 7. scope (except it's global)
  if (!block.global) css = scopeCSS(css, hash);

  return css;
}

function scopeCSS(css: string, hash: string): string {
  return processRules(css, `[data-s="${hash}"]`);
}

function processRules(css: string, attr: string): string {
  let out = "", i = 0;

  while (i < css.length) {
    if (/\s/.test(css[i])) { out += css[i++]; continue; }

    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) { out += css.substring(i); break; }
      out += css.substring(i, end + 2);
      i = end + 2;
      continue;
    }

    const braceIdx = findCSSBrace(css, i);
    if (braceIdx === -1) { out += css.substring(i); break; }

    const selector         = css.substring(i, braceIdx).trim();
    const { content, end } = extractCSSBlock(css, braceIdx);

    if (/^@(-webkit-|-moz-)?keyframes/.test(selector)) {
      out += `${selector} {${content}}\n`;
    } else if (/^@(media|supports|layer|container)/.test(selector)) {
      out += `${selector} {\n${processRules(content, attr)}\n}\n`;
    } else if (selector.startsWith("@")) {
      out += `${selector} {${content}}\n`;
    } else if (selector.length > 0) {
      out += `${scopeSelectors(selector, attr)} {${content}}\n`;
    }

    i = end;
  }
  return out;
}

function scopeSelectors(selList: string, attr: string): string {
  return selList
    .split(",")
    .map(s => {
      s = s.trim();
      if (!s) return "";
      if (/^(html|body|:root)(\s|$|{|,)/.test(s)) return s;
      const m = s.match(/^(.*?)((?::{1,2}[a-zA-Z-]+(?:\([^)]*\))?)+)$/);
      if (m && m[1].trim()) {
        return `${attr} ${m[1].trimEnd()}${m[2]}, ${m[1].trimEnd()}${attr}${m[2]}`;
      }
      return `${attr} ${s}, ${s}${attr}`;
    })
    .filter(Boolean)
    .join(",\n");
}

function findCSSBrace(css: string, from: number): number {
  let i = from;
  while (i < css.length) {
    if (css[i] === '"' || css[i] === "'") {
      const q = css[i++];
      while (i < css.length && css[i] !== q) { if (css[i] === "\\") i++; i++; }
      i++;
    } else if (css[i] === "{") {
      return i;
    } else { i++; }
  }
  return -1;
}

function extractCSSBlock(css: string, openBrace: number): { content: string; end: number } {
  let i = openBrace + 1, depth = 1;
  while (i < css.length && depth > 0) {
    if (css[i] === '"' || css[i] === "'") {
      const q = css[i++];
      while (i < css.length && css[i] !== q) { if (css[i] === "\\") i++; i++; }
      i++;
    } else if (css[i] === "/" && css[i + 1] === "*") {
      i += 2;
      while (i < css.length - 1 && !(css[i] === "*" && css[i + 1] === "/")) i++;
      i += 2;
    } else if (css[i] === "{") { depth++; i++; }
    else if (css[i] === "}") { depth--; if (depth > 0) i++; else break; }
    else { i++; }
  }
  return { content: css.substring(openBrace + 1, i), end: i + 1 };
}


// expression -> js compiler

function compileExprToJS(expr: Expression): string {
  switch (expr.kind) {
    case "literal":
      if (!expr.value) return "null";
      if (expr.value.kind === "str")  return JSON.stringify((expr.value as LitStr).value);
      if (expr.value.kind === "num")  return String((expr.value as LitNum).value);
      if (expr.value.kind === "bool") return String((expr.value as LitBool).value);
      return "null";
    case "variable":
      return expr.name ?? "undefined";
    case "binary": {
      const l = compileExprToJS(expr.left!);
      const r = compileExprToJS(expr.right!);
      const o = expr.op === "and" ? "&&" : expr.op === "or" ? "||" : expr.op!;
      return `(${l} ${o} ${r})`;
    }
    case "unary": {
      const o = expr.op === "not" ? "!" : expr.op!;
      return `${o}(${compileExprToJS(expr.operand!)})`;
    }
    case "assign": {
      const v = expr.right ? compileExprToJS(expr.right) : "null";
      return `${expr.target} ${expr.op} ${v}`;
    }
    case "postfix":
      return `${expr.target}${expr.op}`;
    default:
      return "";
  }
}

function compileIfToJS(ifBlock: IfBlock): string {
  const cond = compileExprToJS(ifBlock.condition);
  const ifJS = bodyToJS(ifBlock.body);
  const elseJS = ifBlock.elseBody ? bodyToJS(ifBlock.elseBody) : "";
  let js = `if (${cond}) {\n${ifJS}}\n`;
  if (elseJS) js += `else {\n${elseJS}}\n`;
  return js;
}

function bodyToJS(children: Child[]): string {
  return children
    .filter(c => c.kind === "assign_stmt" || c.kind === "if")
    .map(c => {
      if (c.kind === "assign_stmt") return `  ${compileExprToJS((c as AssignStmt).expression)};\n`;
      if (c.kind === "if")          return compileIfToJS(c as IfBlock).replace(/^/gm, "  ") + "\n";
      return "";
    })
    .join("");
}

// the HTML generator

/**
 * CSS property names that are allowed as inline style shorthand attributes on
 * any Sinth component:  Paragraph(color: "red", fontSize: "1.2rem") { "Hi" }
 */
const INLINE_STYLE_PROPS = new Set([
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

function resolveBuiltinTag(
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

function renderAttr(attr: Attr, paramMap: Map<string, string>): string {
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
      return `data-sinth-delay="${value.value}" style="display:none"`;
    }
    const v = litToString(value);
    if (/^\d+$/.test(v)) return `data-sinth-delay="${escAttr(v)}" style="display:none"`;
    if (v.startsWith("__EXPR__")) {
      try {
        const expr: Expression = JSON.parse(v.substring(8));
        const jsExpr = compileExprToJS(expr);
        return `data-sinth-delay-expr="${escAttr(jsExpr)}" style="display:none"`;
      } catch {}
    }
    return `data-sinth-delay-expr="${escAttr(v)}" style="display:none"`;
  }

  if (name === "checked") {
    return (value as any)?.kind === "bool" && (value as any).value ? "checked" : "";
  }

  if (value.kind === "num") return `${name}="${value.value}"`;

  let raw = value.value;

  if (raw.startsWith("__EXPR__")) {
    const exprJson = raw.substring("__EXPR__".length);
    try {
      const expr: Expression = JSON.parse(exprJson);
      const jsExpr = compileExprToJS(expr);
      const ev = eventAttrName(name);
      if (ev) return `${ev}="(function(){ ${jsExpr.replace(/"/g, "&quot;")}; })()"`;
      return `${name}="${escAttr(jsExpr)}"`;
    } catch { /* fall through */ }
  }

  raw = interpolateAttr(raw, paramMap);

  const ev = eventAttrName(name);
  if (ev) return `${ev}="${escAttr(raw)};sinthRender()"`;
  return `${name}="${escAttr(raw)}"`;
}

function renderText(text: string, params: Map<string, string>): string {
  const rawSlots = new Map<string, string>();
  let counter = 0;

  let s = text.replace(/\\\$/g, "\x00DOLLAR\x00");

  s = s.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => {
    const val = params.get(n);
    if (val === undefined) return `$${n}`;
    if (n === "slot") {
      const ph = `\x00RAW${counter++}\x00`;
      rawSlots.set(ph, val);
      return ph;
    }
    return val;
  });

  s = esc(s);

  for (const [ph, val] of rawSlots) s = s.replace(ph, val);
  s = s.replace(/\x00DOLLAR\x00/g, "$");

  const braceRe = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = braceRe.exec(s)) !== null) {
    SinthWarning.emit(
      `Use $param for text interpolation; {param} is for attributes. Found '${m[0]}' in text.`
    );
  }

  return s;
}

function interpolateAttr(text: string, params: Map<string, string>): string {
  let s = text.replace(/\\\{/g, "\x00LB\x00");
  s = s.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, n) => params.get(n) ?? `{${n}}`);
  return s.replace(/\x00LB\x00/g, "{");
}

function renderChild(
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
      const jsExpr = compileExprToJS(child.expression);
      return `<span class="sinth-expr" data-expr="${escAttr(jsExpr)}"></span>`;
    }

    case "assign_stmt": {
      ctx.logicBlocks.push(compileExprToJS(child.expression) + ";");
      return "";
    }

    case "if":
      return renderIfBlock(child, ctx, params, depth);

    case "for": {
      const bodyHTML = child.body.map(c => renderChild(c, ctx, params, depth + 1)).join("");
      const keyAttr = child.keyVar ? ` data-sinth-key="${escAttr(child.keyVar)}"` : "";
      const idxAttr = child.indexVar ? ` data-sinth-index="${escAttr(child.indexVar)}"` : "";
      return (
        `<template data-sinth-for="${escAttr(child.arrayVar)}" data-sinth-item="${escAttr(child.itemVar)}"${keyAttr}${idxAttr}>${bodyHTML}</template>`
      );
    }

    case "use":
      return renderCompUse(child, ctx, params, depth);
  }
}

function renderIfBlock(
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
    const bodyHTML = ifBlock.body.map(c => renderChild(c, ctx, params, depth + 1)).join("");
    const elseHTML = (ifBlock.elseBody ?? []).map(c => renderChild(c, ctx, params, depth + 1)).join("");
    return (
      `<template data-sinth-if="${escAttr(condJS)}">${bodyHTML}</template>` +
      (elseHTML ? `<template data-sinth-else>${elseHTML}</template>` : "")
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
    const ifWantsReplace = !ifReplace || (ifReplaceVal?.kind === "bool" && ifReplaceVal.value === true) || (ifReplaceVal === null);
    
    if (ifId && ifId.kind === "str" && ifWantsReplace) {
      if (elseFirstComp) {
        const elseId = elseFirstComp.attrs.find(a => a.name === "id")?.value;
        const elseReplace = elseFirstComp.attrs.find(a => a.name === "replace");
        const elseReplaceVal = elseReplace?.value;
        const elseWantsReplace = !elseReplace || (elseReplaceVal?.kind === "bool" && elseReplaceVal.value === true) || (elseReplaceVal === null);
        
        if (elseId && elseId.kind === "str" && elseId.value === ifId.value && elseWantsReplace) {
          replaceId = ifId.value;
        }
      }
    }
  }

  ctx.mixedBlocks.push({ id, conditionJS: condJS, ifJS: ifAssignJS, ifHTML, elseJS: elseAssignJS, elseHTML, replaceId });

  return `<span id="${replaceId || id}" data-sinth-mixed></span>`;
}

function renderCompUse(
  use:    CompUse,
  ctx:    CompileCtx,
  params: Map<string, string>,
  depth:  number,
): string {
  // transparent wrapper inserted by flattenIfToUses()
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
      const r = renderAttr(attr, params);
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
    const rendered = renderAttr(attr, params);
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
    const bindAttr = use.attrs.find(a => a.name === "bind");
    if (bindAttr?.value?.kind === "str") {
      let vName = bindAttr.value.value;
      if (vName.startsWith("__EXPR__")) {
        try {
          const expr: Expression = JSON.parse(vName.substring(8));
          if (expr.kind === "variable" && expr.name) vName = expr.name;
        } catch {}
      }
      attrParts.push(`onchange="(function(e){ ${vName} = e.target.checked; sinthRender(); })(event)"`);
      attrParts.push(`data-sinth-checked="${escAttr(vName)}"`);
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

function expandUserComp(
  use:    CompUse,
  def:    CompDef,
  ctx:    CompileCtx,
  params: Map<string, string>,
  depth:  number,
): string {
  if (use.name === def.name && depth > 1) {
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
      local.set(attr.name, attr.value.kind === "str" ? interpolateAttr(raw, params) : raw);
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
  local.set("slot", slotHTML);

  for (const block of def.styles) {
    ctx.extraCSS.push(processStyleBlock(block, ctx.scopeHash, local));
  }

  return def.body.map(c => renderChild(c, ctx, local, depth)).join("");
}

// script collector

function collectScripts(
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

function extractFunctionNames(js: string): string[] {
  const names: string[] = [];
  const re = /^\s*(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) names.push(m[1]);
  return names;
}


// head gen

interface HeadData {
  title?: string; fav?: string;
  lang:   string; charset: string; viewport: string;
  metaTags:  { name: string; content: string }[];
  metaProps: { property: string; content: string }[];
}

function buildHeadData(meta: MetaEntry[]): HeadData {
  let title: string | undefined, fav: string | undefined;
  let lang = "en", charset = "UTF-8", viewport = "width=device-width, initial-scale=1.0";
  const metaTags:  { name: string; content: string }[]     = [];
  const metaProps: { property: string; content: string }[] = [];

  for (const m of meta) {
    const val = litToString(m.value);
    switch (m.key) {
      case "title":    title    = val; break;
      case "fav":      fav      = val; break;
      case "lang":     lang     = val; break;
      case "charset":  charset  = val; break;
      case "viewport": viewport = val; break;
      case "descr":    metaTags.push({ name: "description", content: val }); break;
      case "author":   metaTags.push({ name: "author",      content: val }); break;
      case "keywords": metaTags.push({ name: "keywords",    content: val }); break;
      case "robots":   metaTags.push({ name: "robots",      content: val }); break;
      default:
        if (m.key.startsWith("og") || m.key.startsWith("twitter")) {
          const prop = m.key
            .replace(/^og([A-Z])/, (_: string, c: string) => `og:${c.toLowerCase()}`)
            .replace(/^twitter([A-Z])/, (_: string, c: string) => `twitter:${c.toLowerCase()}`);
          metaProps.push({ property: prop, content: val });
        } else {
          metaTags.push({ name: camelToKebab(m.key), content: val });
        }
    }
  }

  return { title, fav, lang, charset, viewport, metaTags, metaProps };
}

function faviconType(p: string): string {
  switch (path.extname(p).toLowerCase()) {
    case ".ico":  return "image/x-icon";
    case ".png":  return "image/png";
    case ".svg":  return "image/svg+xml";
    case ".gif":  return "image/gif";
    case ".webp": return "image/webp";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    default:
      SinthWarning.emit(`Unknown favicon extension '${path.extname(p)}', defaulting to image/x-icon`);
      return "image/x-icon";
  }
}

function renderHead(
  hd:          HeadData,
  cssLinks:    string[],
  jsLinks:     { src: string; attrs: Record<string, string> }[],
  scopedCSS:   string,
  companionJS: string | undefined,
): string {
  const lines: string[] = [];
  lines.push(`  <meta charset="${escAttr(hd.charset)}">`);
  lines.push(`  <meta name="viewport" content="${escAttr(hd.viewport)}">`);
  if (hd.title) lines.push(`  <title>${esc(hd.title)}</title>`);
  if (hd.fav)   lines.push(`  <link rel="icon" href="${escAttr(hd.fav)}" type="${faviconType(hd.fav)}">`);
  for (const m of hd.metaTags)  lines.push(`  <meta name="${escAttr(m.name)}" content="${escAttr(m.content)}">`);
  for (const m of hd.metaProps) lines.push(`  <meta property="${escAttr(m.property)}" content="${escAttr(m.content)}">`);
  for (const css of cssLinks)   lines.push(`  <link rel="stylesheet" href="${escAttr(css)}">`);
  if (scopedCSS.trim())          lines.push(`  <style>\n${scopedCSS}\n  </style>`);
  for (const js of jsLinks) {
    const extra = Object.entries(js.attrs)
      .map(([k, v]) => v === "true" ? k : `${k}="${escAttr(v)}"`)
      .join(" ");
    lines.push(`  <script src="${escAttr(js.src)}"${extra ? " " + extra : ""}></script>`);
  }
  if (companionJS) lines.push(`  <script src="${escAttr(companionJS)}"></script>`);
  return `<head>\n${lines.join("\n")}\n</head>`;
}


// sinth runtime

function buildRuntime(opts: {
  varDecls:     VarDeclaration[];
  bodyHTML:     string;
  logicBlocks:  string[];
  mixedBlocks:  MixedBlockEntry[];
  assignedVars: Set<string>;
}): string {
  const { varDecls, bodyHTML, logicBlocks, mixedBlocks, assignedVars } = opts;


const needsExpr   = bodyHTML.includes("sinth-expr");
const needsIf     = bodyHTML.includes("data-sinth-if");
const needsFor    = bodyHTML.includes("data-sinth-for");
const needsDelay  = bodyHTML.includes("data-sinth-delay") || bodyHTML.includes("data-sinth-delay-expr") || mixedBlocks.some(mb => mb.ifHTML.includes("data-sinth-delay") || mb.ifHTML.includes("data-sinth-delay-expr") || mb.elseHTML.includes("data-sinth-delay") || mb.elseHTML.includes("data-sinth-delay-expr"));
const needsMixed  = mixedBlocks.length > 0;
const needsLogic  = logicBlocks.length > 0;
  const needsRender = needsExpr || needsIf || needsFor || needsMixed || needsLogic;

  // var decls with type defaults
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
    return varLines ? `// Sinth v1.0.0\n${varLines}` : "";
  }

  let renderBody = "";

  renderBody += `  var _sx = window.scrollX, _sy = window.scrollY;\n`;

  if (needsLogic) {
    renderBody += logicBlocks.map(b => b.replace(/^/gm, "  ")).join("\n") + "\n";
  }

  if (needsFor) {
    renderBody += `
  document.querySelectorAll('template[data-sinth-for]').forEach(function(t) {
    var source;
    try { source = eval(t.dataset.sinthFor); } catch(e) { source = []; }
    var isObj = (typeof source === 'object' && source !== null && !Array.isArray(source));
    var entries;
    if (isObj) {
      entries = Object.entries(source);
    } else {
      if (!Array.isArray(source)) source = [];
      entries = source.map(function(item, index) { return [index, item]; });
    }
    var anchor = t.parentNode ? t.parentNode.querySelector('[data-sinth-for-anchor="' + t.dataset.sinthFor + '"]') : null;
    if (anchor) {
      var cur2 = anchor.nextSibling;
      while (cur2 && cur2 !== t) { var nx2 = cur2.nextSibling; cur2.remove(); cur2 = nx2; }
      anchor.remove();
    }
    var fa = document.createElement('span');
    fa.style.display = 'none';
    fa.dataset.sinthForAnchor = t.dataset.sinthFor;
    t.parentNode && t.parentNode.insertBefore(fa, t);
    var _loopIdx = 0;
    entries.forEach(function(entry) {
      var _k = entry[0];
      var _v = entry[1];
      var _item = (t.dataset && t.dataset.sinthItem) ? t.dataset.sinthItem : '__item__';
      var _key = t.dataset && t.dataset.sinthKey ? t.dataset.sinthKey : null;
      var _idx = t.dataset && t.dataset.sinthIndex ? t.dataset.sinthIndex : null;

      _loopIdx++;
      var _user = _v;
      var frag = document.createRange().createContextualFragment(t.innerHTML);
      frag.querySelectorAll('.sinth-expr').forEach(function(el) {
        try { 
          if (el.dataset.expr === _item) {
            el.textContent = _v;
          } else if (_key && el.dataset.expr === _key) {
            el.textContent = _k;
          } else if (el.dataset.expr && (el.dataset.expr.indexOf(_item) !== -1 || (_key && el.dataset.expr.indexOf(_key) !== -1) || (_idx && el.dataset.expr.indexOf(_idx) !== -1))) {
            eval('var ' + _item + ' = _user;');
            if (_key) eval('var ' + _key + ' = _k;');
            if (_idx) eval('var ' + _idx + ' = _loopIdx - 1;');
            el.textContent = eval(el.dataset.expr);
            el.classList.remove('sinth-expr');  // Mark as processed
          }
        } catch(e) {}
      });
      frag.querySelectorAll('template[data-sinth-if]').forEach(function(ifT) {
        var cond = false;
        try { eval('var ' + _item + ' = _user;'); if (_key) eval('var ' + _key + ' = _k;'); if (_idx) eval('var ' + _idx + ' = _loopIdx - 1;'); cond = eval(ifT.dataset.sinthIf); } catch(e) {}
        if (cond) {
          var ifContent = document.createRange().createContextualFragment(ifT.innerHTML);
          ifContent.querySelectorAll('.sinth-expr').forEach(function(el2) {
try { eval('var ' + _item + ' = _user;'); if (_key) eval('var ' + _key + ' = _k;'); if (_idx) eval('var ' + _idx + ' = _loopIdx - 1;'); el2.textContent = eval(el2.dataset.expr); } catch(e) {}
          });
          ifT.parentNode.insertBefore(ifContent, ifT);
        } else {
          var elseT = ifT.nextElementSibling;
          if (elseT && elseT.hasAttribute('data-sinth-else')) {
            var elseContent = document.createRange().createContextualFragment(elseT.innerHTML);
            elseContent.querySelectorAll('.sinth-expr').forEach(function(el2) {
              try { eval('var ' + _item + ' = _user;'); if (_key) eval('var ' + _key + ' = _k;'); if (_idx) eval('var ' + _idx + ' = _loopIdx - 1;'); el2.textContent = eval(el2.dataset.expr); } catch(e) {}
            });
            ifT.parentNode.insertBefore(elseContent, ifT);
          }
        }
      });
      frag.querySelectorAll('[data-sinth-delay]').forEach(function(el) {
        var ms = parseInt(el.dataset.sinthDelay) || 0;
        el.style.display = 'none';
        if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
        else el.style.display = '';
      });
      frag.querySelectorAll('[data-sinth-delay-expr]').forEach(function(el) {
        try {
          eval('var ' + _item + ' = _user;');
          if (_key) eval('var ' + _key + ' = _k;');
          if (_idx) eval('var ' + _idx + ' = _loopIdx - 1;');
          var ms = eval(el.dataset.sinthDelayExpr) || 0;
          el.style.display = 'none';
          if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
          else el.style.display = '';
        } catch(e) {}
      });
      t.parentNode && t.parentNode.insertBefore(frag, t);
    });
  });
`;
  }
  if (needsIf) {
    renderBody += `
  document.querySelectorAll('template[data-sinth-if]').forEach(function(t) {
    var anchor = t.parentNode.querySelector('[data-sinth-if-anchor="' + t.dataset.sinthIf + '"]');
    var cond;
    try { cond = eval(t.dataset.sinthIf); } catch(e) { cond = false; }
    if (cond) {
      if (anchor) {
        var cur = anchor.nextSibling;
        while (cur && cur !== t) { var nx = cur.nextSibling; cur.remove(); cur = nx; }
      } else {
        anchor = document.createElement('span');
        anchor.style.display = 'none';
        anchor.dataset.sinthIfAnchor = t.dataset.sinthIf;
        t.parentNode.insertBefore(anchor, t);
      }
      var frag = document.createRange().createContextualFragment(t.innerHTML);
      frag.querySelectorAll('.sinth-expr').forEach(function(el) {
        try { el.textContent = eval(el.dataset.expr); } catch(e) {}
      });
      frag.querySelectorAll('[data-sinth-delay]').forEach(function(el) {
        var ms = parseInt(el.dataset.sinthDelay) || 0;
        el.style.display = 'none';
        if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
        else el.style.display = '';
      });
      frag.querySelectorAll('[data-sinth-delay-expr]').forEach(function(el) {
        try {
          var ms = eval(el.dataset.sinthDelayExpr) || 0;
          el.style.display = '';
          if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
        } catch(e) {}
      });
      t.parentNode.insertBefore(frag, t);
    } else {
      if (anchor) {
        var cur2 = anchor.nextSibling;
        while (cur2 && cur2 !== t) { var nx2 = cur2.nextSibling; cur2.remove(); cur2 = nx2; }
        anchor.remove();
      }
      var elseT = t.nextElementSibling;
      if (elseT && elseT.dataset && elseT.hasAttribute('data-sinth-else')) {
        var ea = t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + t.dataset.sinthIf + '"]');
        if (ea) {
          var cur3 = ea.nextSibling;
          while (cur3 && cur3 !== t) { var nx3 = cur3.nextSibling; cur3.remove(); cur3 = nx3; }
        } else {
          ea = document.createElement('span');
          ea.style.display = 'none';
          ea.dataset.sinthIfAnchor = '__else__' + t.dataset.sinthIf;
          t.parentNode.insertBefore(ea, t);
        }
        var ef = document.createRange().createContextualFragment(elseT.innerHTML);
        ef.querySelectorAll('.sinth-expr').forEach(function(el) {
          try { el.textContent = eval(el.dataset.expr); } catch(e) {}
        });
        ef.querySelectorAll('[data-sinth-delay]').forEach(function(el) {
          var ms = parseInt(el.dataset.sinthDelay) || 0;
          el.style.display = 'none';
          if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
          else el.style.display = '';
        });
        ef.querySelectorAll('[data-sinth-delay-expr]').forEach(function(el) {
          try {
            var ms = eval(el.dataset.sinthDelayExpr) || 0;
            el.style.display = '';
            if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
          } catch(e) {}
        });
        t.parentNode.insertBefore(ef, t);
      } else {
        var ea2 = t.parentNode ? t.parentNode.querySelector('[data-sinth-if-anchor="__else__' + t.dataset.sinthIf + '"]') : null;
        if (ea2) {
          var ec = ea2.nextSibling;
          while (ec && ec !== t) { var en = ec.nextSibling; ec.remove(); ec = en; }
          ea2.remove();
        }
      }
    }
  });
`;
  }


// mixed if/else blocks
if (needsMixed) {
for (const mb of mixedBlocks) {
const ifHTMLJS   = JSON.stringify(mb.ifHTML);
const elseHTMLJS = JSON.stringify(mb.elseHTML);
const hasDelay = mb.ifHTML.includes("data-sinth-delay") || mb.elseHTML.includes("data-sinth-delay");
renderBody += `
(function() {
var __el = document.getElementById(${JSON.stringify(mb.replaceId || mb.id)});
if (__el) {
var __cond;
try { __cond = (${mb.conditionJS}); } catch(e) { __cond = false; }
if (__cond) {
${mb.ifJS ? mb.ifJS : ""}        __el.innerHTML = ${ifHTMLJS};
} else {
${mb.elseJS ? mb.elseJS : ""}        __el.innerHTML = ${elseHTMLJS};
}
__el.querySelectorAll('.sinth-expr').forEach(function(e) {
try { e.textContent = eval(e.dataset.expr); } catch(ex) {}
});
__el.querySelectorAll('template[data-sinth-if]').forEach(function(innerT) {
  var innerCond;
  try { innerCond = eval(innerT.dataset.sinthIf); } catch(e) { innerCond = false; }
  if (innerCond) {
    var innerFrag = document.createRange().createContextualFragment(innerT.innerHTML);
    innerFrag.querySelectorAll('.sinth-expr').forEach(function(e2) {
      try { e2.textContent = eval(e2.dataset.expr); } catch(ex) {}
    });
    innerT.parentNode.insertBefore(innerFrag, innerT);
  } else {
    var innerElse = innerT.nextElementSibling;
    if (innerElse && innerElse.hasAttribute('data-sinth-else')) {
      var innerElseFrag = document.createRange().createContextualFragment(innerElse.innerHTML);
      innerElseFrag.querySelectorAll('.sinth-expr').forEach(function(e2) {
        try { e2.textContent = eval(e2.dataset.expr); } catch(ex) {}
      });
      innerT.parentNode.insertBefore(innerElseFrag, innerT);
    }
  }
});
${hasDelay ? `
// Handle delays for this mixed block
__el.querySelectorAll('[data-sinth-delay]').forEach(function(el) {
var ms = parseInt(el.dataset.sinthDelay) || 0;
el.style.display = 'none'; // Ensure hidden before timeout
if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
else el.style.display = '';
});
__el.querySelectorAll('[data-sinth-delay-expr]').forEach(function(el) {
try {
var ms = parseInt(eval(el.dataset.sinthDelayExpr)) || 0;
el.style.display = 'none';
if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
else el.style.display = '';
} catch(e) {}
});
` : ""}
}
})();
`;
}
}

  // set input vals from bound vars
  renderBody += `
  document.querySelectorAll('[data-sinth-value]').forEach(function(el) {
    try { el.value = eval(el.dataset.sinthValue) || ''; } catch(e) {}
  });
  document.querySelectorAll('[data-sinth-checked]').forEach(function(el) {
    try { el.checked = !!eval(el.dataset.sinthChecked); } catch(e) {}
  });
`;

  // expression spans
  if (needsExpr) {
    renderBody += `
  document.querySelectorAll('.sinth-expr').forEach(function(el) {
    try { el.textContent = eval(el.dataset.expr); } catch(e) {}
  });
`;
  }


  renderBody += `  window.scrollTo(_sx, _sy);\n`;


  const delayBlock = needsDelay ? `
setTimeout(function() {
  document.querySelectorAll('[data-sinth-delay]').forEach(function(el) {
    var ms = parseInt(el.dataset.sinthDelay) || 0;
    if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
    else el.style.display = '';
  });
  document.querySelectorAll('[data-sinth-delay-expr]').forEach(function(el) {
    try {
      var ms = parseInt(eval(el.dataset.sinthDelayExpr)) || 0;
      if (ms > 0) setTimeout(function() { el.style.display = ''; }, ms);
      else el.style.display = '';
    } catch(e) {}
  });
}, 0);
` : "";

  return `// Sinth v1.0.0 — compiled runtime
${varLines}
${needsRender ? `function sinthRender() {\n${renderBody}}\nsinthRender();` : ""}
${delayBlock}`;
}

// main compilation pipeline

interface CompileOptions {
  projectRoot:  string;
  outDir:       string;
  libraryPaths: string[];
  minify:       boolean;
  checkOnly:    boolean;
}

function compileFile(filePath: string, opts: CompileOptions): string | null {
  const absPath = path.resolve(filePath);
  const file    = parseFile(absPath);

  const cfg: ResolverConfig = { projectRoot: opts.projectRoot, libraryPaths: opts.libraryPaths };
  const { allDefs, customEls, cssLinks, jsLinks } = resolveImports(file, cfg);
  const hash = fnv1a(absPath);

  const allVarDecls: VarDeclaration[] = file.varDecls;

  const ctx: CompileCtx = {
    allDefs, customEls, cssLinks, jsLinks,
    scopeHash:    hash,
    pageFile:     absPath,
    extraCSS:     [],
    mixedBlocks:  [],
    mixedCounter: 0,
    logicBlocks:  [],
  };

  if (!file.isPage) {
    const body    = file.uses.map(u => renderCompUse(u, ctx, new Map(), 0)).join("\n");
    const pageCSS = file.styles.map(s => processStyleBlock(s, hash)).join("\n");
    const allCSS  = [pageCSS, ...ctx.extraCSS].join("\n");
    return `${body}\n<style>\n${allCSS}\n</style>`;
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

  const head = renderHead(headData, relativeCssLinks, relativeJsLinks, scopedCSS, companionJS);

  // build tree-shaken runtime
  const runtimeJS = buildRuntime({
    varDecls:     allVarDecls,
    bodyHTML,
    logicBlocks:  ctx.logicBlocks,
    mixedBlocks:  ctx.mixedBlocks,
    assignedVars,
  });

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

  const html = [
    "<!DOCTYPE html>",
    `<html lang="${escAttr(headData.lang)}">`,
    head,
    `<body data-s="${hash}">`,
    bodyHTML,
    runtimeJS.trim() ? `<script>\n${runtimeJS}\n</script>` : "",
    scriptTags.join("\n"),
    "</body>",
    "</html>",
  ].filter(Boolean).join("\n");

  return opts.minify ? minifyHTML(html) : html;
}

function minifyHTML(html: string): string {
  return html.replace(/>\s+</g, "><").replace(/\n\s*\n/g, "\n").trim();
}

// file discovery & asset copy

function findSinthPages(dir: string, outDir?: string): string[] {
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

function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}


// dev server

const LIVE_RELOAD_SCRIPT = `<script>
(function(){
  var es = new EventSource('/__sinth_sse__');
  es.onmessage = function() { location.reload(); };
  es.onerror   = function() { setTimeout(function() { location.reload(); }, 1000); };
})();
</script>`;

async function startDevServer(opts: CompileOptions & { port: number; files?: string[] }): Promise<void> {
  const clients: http.ServerResponse[] = [];
  const cache = new Map<string, string>();

  function notify(): void {
    for (const c of clients) { try { c.write("data: reload\n\n"); } catch {} }
  }

  function compileAll(): void {
    cache.clear();
    const pages = (opts.files && opts.files.length > 0)
      ? opts.files.filter(f => fs.existsSync(f))
      : findSinthPages(opts.projectRoot, opts.outDir);
    for (const p of pages) {
      try {
        const html = compileFile(p, { ...opts, checkOnly: false });
        if (!html) continue;
        const rel = path.relative(opts.projectRoot, p).replace(/\.sinth$/, ".html").replace(/\\/g, "/");
        const url = "/" + rel;
        cache.set(url, html + LIVE_RELOAD_SCRIPT);
        if (rel === "index.html" || rel.endsWith("/index.html")) {
          cache.set("/", html + LIVE_RELOAD_SCRIPT);
        }
      } catch (e: unknown) {
        process.stderr.write(`\x1b[31m${(e as Error).message}\x1b[0m\n`);
      }
    }
  }

  compileAll();

  const resolvedOut = path.resolve(opts.outDir);
  let   watchReady  = false;
  try {
    fs.watch(opts.projectRoot, { recursive: true }, (_, filename) => {
      if (!filename) return;
      const abs = path.resolve(opts.projectRoot, filename);
      if (abs.startsWith(resolvedOut + path.sep) || abs === resolvedOut) return;
      process.stdout.write(`\x1b[36m[sinth]\x1b[0m Changed: ${filename}\n`);
      compileAll(); notify();
    });
    watchReady = true;
  } catch {}

  if (!watchReady) {
    const mtimes = new Map<string, number>();
    const poller = setInterval(() => {
      const pages = (opts.files && opts.files.length > 0)
        ? opts.files : findSinthPages(opts.projectRoot, opts.outDir);
      for (const p of pages) {
        try {
          const mtime = fs.statSync(p).mtimeMs;
          if (mtimes.get(p) !== mtime) {
            mtimes.set(p, mtime);
            process.stdout.write(`\x1b[36m[sinth]\x1b[0m Changed: ${path.relative(opts.projectRoot, p)}\n`);
            compileAll(); notify(); break;
          }
        } catch {}
      }
    }, 500);
    process.on("exit", () => clearInterval(poller));
  }

  const EXT_TYPES: Record<string, string> = {
    ".css": "text/css", ".js": "application/javascript",
    ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
    ".json": "application/json", ".xml": "application/xml",
  };

  const server = http.createServer((req, res) => {
    const reqUrl = (req.url ?? "/").split("?")[0];

    if (reqUrl === "/__sinth_sse__") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      clients.push(res);
      req.on("close", () => { const i = clients.indexOf(res); if (i !== -1) clients.splice(i, 1); });
      return;
    }

    const cached = cache.get(reqUrl) ??
      cache.get(reqUrl.endsWith("/") ? reqUrl + "index.html" : reqUrl + ".html");
    if (cached) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(cached); return; }

    let filePath = path.join(opts.projectRoot, reqUrl);
    if (reqUrl.endsWith("/")) filePath = path.join(filePath, "index.html");
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ctype = EXT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": ctype });
      res.end(fs.readFileSync(filePath));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404 Not Found");
  });

  server.listen(opts.port, () => {
    process.stdout.write(
      `\x1b[32m[sinth dev]\x1b[0m Serving at \x1b[4mhttp://localhost:${opts.port}\x1b[0m\n`
    );
  });
}


// cli entry point

function loadConfig(root: string): Record<string, unknown> {
  const cfgPath = path.join(root, "sinth.config.json");
  if (fs.existsSync(cfgPath)) {
    try { return JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as Record<string, unknown>; }
    catch { SinthWarning.emit("Could not parse sinth.config.json"); }
  }
  return {};
}

async function main(): Promise<void> {
  const [,, command, ...args] = process.argv;
  const cwd = process.cwd();
  const cfg = loadConfig(cwd);

  const outDirIdx    = args.indexOf("--out");
  const outDir       = outDirIdx !== -1 ? args[outDirIdx + 1] : (cfg.outDir as string | undefined) ?? path.join(cwd, "dist");
  const portIdx      = args.indexOf("--port");
  const port         = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : (cfg.port as number | undefined) ?? 3000;
  const minify       = args.includes("--prod") || Boolean(cfg.minify);
  const libraryPaths = (cfg.libraryPaths as string[] | undefined) ?? [path.join(cwd, "libraries")];

  const flagValues = new Set<string>();
  if (outDirIdx !== -1) flagValues.add(args[outDirIdx + 1]);
  if (portIdx   !== -1) flagValues.add(args[portIdx + 1]);
  const cleanArgs = args.filter(a => !a.startsWith("--") && !flagValues.has(a));

  const opts: CompileOptions = { projectRoot: cwd, outDir, libraryPaths, minify, checkOnly: false };

  switch (command) {
    case "build": {
      const nonSinth = cleanArgs.filter(a => !a.endsWith(".sinth"));
      if (nonSinth.length > 0) process.stdout.write(`\x1b[33mSkipping non-.sinth files:\x1b[0m ${nonSinth.join(", ")}\n`);

      const fileArgs = cleanArgs.filter(a => a.endsWith(".sinth"));
      const pages    = fileArgs.length > 0
        ? fileArgs.map(f => path.resolve(cwd, f)).filter(f => fs.existsSync(f))
        : findSinthPages(cwd, outDir);

      if (pages.length === 0) { process.stdout.write("No .sinth files found.\n"); process.exit(0); }

      let hadError = false, built = 0;

      for (const p of pages) {
        try {
          const html = compileFile(p, opts);
          if (!html) continue;
          const rel = path.relative(cwd, p).replace(/\.sinth$/, ".html");
          const out = path.join(outDir, rel);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, html);
          process.stdout.write(`  \x1b[32m✓\x1b[0m ${rel}\n`);
          built++;
        } catch (e: unknown) {
          process.stderr.write(`  \x1b[31m✗\x1b[0m ${path.relative(cwd, p)}\n${(e as Error).message}\n`);
          hadError = true;
        }
      }

      // copies to output
      const assetsIn = path.join(cwd, "assets"), assetsOut = path.join(outDir, "assets");
      if (fs.existsSync(assetsIn)) {
        copyDir(assetsIn, assetsOut);
        process.stdout.write(`  \x1b[32m✓\x1b[0m assets/ → ${path.relative(cwd, assetsOut)}/\n`);
      }

      const libIn = path.join(cwd, "libraries"), libOut = path.join(outDir, "libraries");
      if (fs.existsSync(libIn)) {
        copyDir(libIn, libOut);
        const libFiles = fs.readdirSync(libOut, { recursive: true }) as string[];
        for (const f of libFiles) {
          if (f.endsWith(".sinth") || f.endsWith(".html")) {
            try { fs.unlinkSync(path.join(libOut, f)); } catch {}
          }
        }
        process.stdout.write(`  \x1b[32m✓\x1b[0m libraries/ → ${path.relative(cwd, libOut)}/\n`);
      }

      process.stdout.write(`\n\x1b[1mBuilt ${built} page(s)\x1b[0m${hadError ? " with errors" : ""}\n`);
      process.exit(hadError ? 1 : 0);
      break;
    }

    case "dev": {
      const fileArgs = cleanArgs.filter(a => a.endsWith(".sinth"));
      const files    = fileArgs.length > 0
        ? fileArgs.map(f => path.resolve(cwd, f)).filter(f => fs.existsSync(f))
        : undefined;
      await startDevServer({ ...opts, port, files });
      break;
    }

    case "check": {
      opts.checkOnly = true;
      const pages    = findSinthPages(cwd, outDir);
      let hadError   = false;
      for (const p of pages) {
        try {
          compileFile(p, opts);
          process.stdout.write(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, p)}\n`);
        } catch (e: unknown) {
          process.stderr.write(`  \x1b[31m✗\x1b[0m ${path.relative(cwd, p)}\n${(e as Error).message}\n`);
          hadError = true;
        }
      }
      process.exit(hadError ? 1 : 0);
      break;
    }

    case "version":
    case "--version":
    case "-v": {
      const pkgPath = path.join(__dirname, "..", "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        process.stdout.write(`Sinth Compiler v${pkg.version}\n`);
      } else {
        process.stdout.write("Sinth Compiler v1.0.0\n");
      }
      break;
    }

    case "init": {
      const projectName = cleanArgs[0] || "my-sinth-project";
      scaffoldProject(path.resolve(cwd, projectName));
      break;
    }

    default: {
      process.stdout.write(`
\x1b[1mSinth Compiler v1.0.0\x1b[0m

\x1b[1mCommands:\x1b[0m
  sinth build   [files] [--out ./dist] [--prod]   Compile .sinth pages
  sinth dev     [files] [--port 3000]              Live-reload dev server
  sinth check                                      Lint without emitting
  sinth init    [name]                             Scaffold a new project
  sinth version                                    Print version

\x1b[1mConfig:\x1b[0m sinth.config.json
  { "outDir": "./dist", "libraryPaths": ["./libraries"], "minify": false }

\x1b[1mSinth Style v1.0.0:\x1b[0m
  style Paragraph { color: "red"; onHover { color: "blue" } }
  style { Hero { padding: "4rem"; media(maxWidth: "600px") { padding: "1rem" } } }
  Paragraph(color: "red", fontSize: "1.2rem") { "Inline shorthand" }

\x1b[1mMixed if/else:\x1b[0m
  if guess == target {
    result = "Correct!"
    Paragraph(id: "msg") { result }
  } else {
    result = "Wrong!"
    Paragraph(id: "msg") { "Nope!" }
  }
`);
      break;
    }
  }
}

// project scaffholding

function scaffoldProject(root: string): void {
  for (const d of ["pages", "components", "styles", "libraries", "assets"]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }

  fs.writeFileSync(path.join(root, "pages", "index.sinth"), `-- My Sinth Site
page

import "../components/Navbar.sinth"
import css "../styles/reset.css"

title = "My Site"
fav   = "assets/favicon.ico"
descr = "Built with Sinth v1.0.0."

var int score = 0
var str message = "Click to begin"

Navbar

Hero {
  Heading(level: 1) { "Welcome to Sinth" }
  Paragraph { "A declarative, component-based web UI language." }
  Button(onClick: "handleClick") { "Get Started" }
  Paragraph(id: "score-display") { message }
}

Main {
  Section {
    Heading(level: 2) { "Features" }
    CardGrid {
      -- Add Card components here
    }
  }
}

style {
  section.hero {
    padding: "4rem 2rem"
    textAlign: "center"
    backgroundColor: "#f0f4ff"
  }
  main {
    maxWidth: "1100px"
    margin: "0 auto"
    padding: "2rem"
  }
}

script {
  function handleClick() {
    score += 1
    message = "Score: " + score
    sinthRender()
  }
}
`);

  fs.writeFileSync(path.join(root, "components", "Navbar.sinth"), `-- Navbar component

component Navbar {
  Header {
    Nav {
      Link(href: "/", class: "logo") { "MySite" }
      Div(class: "nav-links") {
        NavLink(href: "/")       { "Home" }
        NavLink(href: "/about")  { "About" }
      }
    }
  }

  style {
    header {
      display: "flex"
      alignItems: "center"
      padding: "1rem 2rem"
      backgroundColor: "#1a1a2e"
      color: "white"
    }
    .logo {
      fontSize: "1.5rem"
      fontWeight: "700"
      color: "white"
      textDecoration: "none"
    }
    .nav-links {
      marginLeft: "auto"
      display: "flex"
      gap: "1.5rem"
    }
    .nav-links a {
      color: "rgba(255,255,255,0.8)"
      textDecoration: "none"
    }
  }
}
`);

  fs.writeFileSync(path.join(root, "components", "Card.sinth"), `-- Card component

component Card(title, color = "blue") {
  Div(class: "card") {
    Heading(level: 3) { "$title" }
    Div(class: "card-body") { "$slot" }
  }

  style {
    .card {
      backgroundColor: "#f7f7f7"
      borderRadius: "1rem"
      padding: "1.5rem"
      marginBottom: "1rem"
    }
    .card:hover {
      boxShadow: "0 4px 16px rgba(0,0,0,0.1)"
    }
    .card-body {
      marginTop: "0.75rem"
    }
  }
}
`);

  fs.writeFileSync(path.join(root, "styles", "reset.css"),
    `*, *::before, *::after { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; line-height: 1.6; }\nimg { max-width: 100%; display: block; }\n`
  );

  fs.writeFileSync(path.join(root, "sinth.config.json"),
    JSON.stringify({ outDir: "./dist", libraryPaths: ["./libraries"], minify: false }, null, 2)
  );

  fs.writeFileSync(path.join(root, ".gitignore"), "dist/\nnode_modules/\n");

  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: path.basename(root).toLowerCase().replace(/\s+/g, "-"),
    version: "1.0.0",
    scripts: { build: "sinth build", dev: "sinth dev" },
    devDependencies: { "ts-node": "^10.0.0", typescript: "^5.0.0", sass: "^1.70.0" },
  }, null, 2));

  process.stdout.write(`
\x1b[32m✓ Sinth project scaffolded at ${path.basename(root)}/\x1b[0m

\x1b[1mNext steps:\x1b[0m
  cd ${path.basename(root)}
  sinth dev
  sinth build
`);
}




main().catch(e => {
  process.stderr.write(`\x1b[31m${(e as Error).message}\x1b[0m\n`);
  process.exit(1);
});