import { Loc, SinthError } from "./diagnostics";

export type TokenKind = "ident" | "number" | "string" | "template" | "punct" | "raw" | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  loc: Loc;
  end: number;
  start: number;
  newlineBefore: boolean;
  quote?: string;
  formatted?: boolean;
}

const PUNCTUATORS = [
  "...", "**=", "??=", "&&=", "||=",
  "=>", "->", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "+=", "-=", "*=", "/=", "%=", "++", "**",
  "+", "-", "*", "/", "%", "=", "<", ">", "!", "?", ":", ".", ",", ";", "(", ")", "{", "}", "[", "]", "&", "|", "^", "~", "@", "#",
];

const RAW_BLOCK_KEYWORDS = new Set(["style", "script"]);

function isIdentStart(c: string): boolean {
  return /[A-Za-z_$À-￿]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_$À-￿]/.test(c);
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private sawNewline = false;
  private rawPending = false;
  private readonly tokens: Token[] = [];

  constructor(private readonly src: string, private readonly file: string, private readonly baseLoc?: Loc) {}

  tokenize(): Token[] {
    for (;;) {
      this.skipTrivia();
      if (this.pos >= this.src.length) break;
      const tok = this.next();
      this.tokens.push(tok);
      this.sawNewline = false;
    }
    this.tokens.push(this.make("eof", "", this.here(), this.pos));
    return this.tokens;
  }

  private here(): Loc {
    if (this.baseLoc) {
      return {
        file: this.file,
        line: this.baseLoc.line + this.line - 1,
        col: this.line === 1 ? this.baseLoc.col + this.col - 1 : this.col,
      };
    }
    return { file: this.file, line: this.line, col: this.col };
  }

  private make(kind: TokenKind, value: string, loc: Loc, start: number, extra?: Partial<Token>): Token {
    return { kind, value, loc, start, end: this.pos, newlineBefore: this.sawNewline, ...extra };
  }

  private advance(n = 1): void {
    for (let i = 0; i < n && this.pos < this.src.length; i++) {
      if (this.src[this.pos] === "\n") {
        this.line++;
        this.col = 1;
      } else {
        this.col++;
      }
      this.pos++;
    }
  }

  private peekChar(offset = 0): string {
    return this.src[this.pos + offset] ?? "";
  }

  private fail(message: string, loc: Loc = this.here()): never {
    throw new SinthError("E0001", message, loc);
  }

  private skipTrivia(): void {
    while (this.pos < this.src.length) {
      const c = this.peekChar();
      if (c === "\n") {
        this.sawNewline = true;
        this.advance();
      } else if (c === " " || c === "\t" || c === "\r" || c === "﻿") {
        this.advance();
      } else if (c === "-" && this.peekChar(1) === "-") {
        if (this.peekChar(2) === "[") this.skipBlockComment();
        else while (this.pos < this.src.length && this.peekChar() !== "\n") this.advance();
      } else if (c === "/" && this.peekChar(1) === "/") {
        while (this.pos < this.src.length && this.peekChar() !== "\n") this.advance();
      } else if (c === "/" && this.peekChar(1) === "*") {
        const loc = this.here();
        this.advance(2);
        while (this.pos < this.src.length && !(this.peekChar() === "*" && this.peekChar(1) === "/")) this.advance();
        if (this.pos >= this.src.length) this.fail("Unterminated block comment '/* ... */'", loc);
        this.advance(2);
      } else {
        break;
      }
    }
  }

  private skipBlockComment(): void {
    const loc = this.here();
    this.advance(3);
    let depth = 1;
    while (this.pos < this.src.length && depth > 0) {
      if (this.peekChar() === "-" && this.peekChar(1) === "-" && this.peekChar(2) === "[") {
        depth++;
        this.advance(3);
      } else if (this.peekChar() === "]" && this.peekChar(1) === "-" && this.peekChar(2) === "-") {
        depth--;
        this.advance(3);
      } else {
        this.advance();
      }
    }
    if (depth > 0) this.fail("Unterminated block comment '--[ ... ]--'", loc);
  }

  private next(): Token {
    const loc = this.here();
    const start = this.pos;
    const c = this.peekChar();

    if (c === "{" && this.rawPending) {
      this.rawPending = false;
      return this.readRawBlock(loc, start);
    }

    if ((c === "f" || c === "F") && (this.peekChar(1) === '"' || this.peekChar(1) === "'")) {
      this.advance();
      return this.readString(loc, start, true);
    }
    if (c === '"' || c === "'") return this.readString(loc, start, false);
    if (c === "`") return this.readTemplate(loc, start);
    if (isDigit(c) || (c === "." && isDigit(this.peekChar(1)))) return this.readNumber(loc, start);
    if (isIdentStart(c)) return this.readIdent(loc, start);

    for (const p of PUNCTUATORS) {
      if (this.src.startsWith(p, this.pos)) {
        this.advance(p.length);
        return this.make("punct", p, loc, start);
      }
    }
    return this.fail(`Unexpected character '${c}'`, loc);
  }

  private readIdent(loc: Loc, start: number): Token {
    while (this.pos < this.src.length && isIdentPart(this.peekChar())) this.advance();
    let value = this.src.slice(start, this.pos);
    if (value === "custom" && this.src.startsWith("-element", this.pos)) {
      this.advance(8);
      value = "custom-element";
    }
    if (RAW_BLOCK_KEYWORDS.has(value) && this.atStatementStart()) {
      const after = this.src.slice(this.pos).match(/^[ \t]*(\S)/);
      const nextChar = after?.[1] ?? "";
      if (nextChar !== ":" && nextChar !== "=" && nextChar !== "." && nextChar !== "(" && nextChar !== ",") this.rawPending = true;
    }
    return this.make("ident", value, loc, start);
  }

  private atStatementStart(): boolean {
    const prev = this.tokens[this.tokens.length - 1];
    if (!prev) return true;
    if (prev.kind === "raw") return true;
    if (prev.kind === "punct") return prev.value === "{" || prev.value === "}" || prev.value === ";";
    return this.sawNewline && (prev.kind === "string" || prev.kind === "number" || prev.kind === "ident" || prev.kind === "template");
  }

  private readNumber(loc: Loc, start: number): Token {
    if (this.peekChar() === "0" && /[xXbBoO]/.test(this.peekChar(1))) {
      this.advance(2);
      while (/[0-9a-fA-F_]/.test(this.peekChar())) this.advance();
    } else {
      while (isDigit(this.peekChar()) || this.peekChar() === "_") this.advance();
      if (this.peekChar() === "." && isDigit(this.peekChar(1))) {
        this.advance();
        while (isDigit(this.peekChar()) || this.peekChar() === "_") this.advance();
      }
      if (/[eE]/.test(this.peekChar()) && (isDigit(this.peekChar(1)) || (/[+-]/.test(this.peekChar(1)) && isDigit(this.peekChar(2))))) {
        this.advance(2);
        while (isDigit(this.peekChar())) this.advance();
      }
    }
    const raw = this.src.slice(start, this.pos).replace(/_/g, "");
    if (Number.isNaN(Number(raw))) this.fail(`Invalid number literal '${raw}'`, loc);
    return this.make("number", raw, loc, start);
  }

  private readEscape(loc: Loc): string {
    this.advance();
    const e = this.peekChar();
    this.advance();
    switch (e) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "0": return "\0";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "\\": case '"': case "'": case "`": case "$": case "{": case "}": return e;
      case "\n": return "";
      case "x": {
        const hex = this.src.slice(this.pos, this.pos + 2);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) this.fail("Invalid \\x escape sequence", loc);
        this.advance(2);
        return String.fromCharCode(parseInt(hex, 16));
      }
      case "u": {
        if (this.peekChar() === "{") {
          const close = this.src.indexOf("}", this.pos);
          const hex = close === -1 ? "" : this.src.slice(this.pos + 1, close);
          if (!/^[0-9a-fA-F]{1,6}$/.test(hex) || parseInt(hex, 16) > 0x10ffff) this.fail("Invalid \\u{...} escape sequence", loc);
          this.advance(hex.length + 2);
          return String.fromCodePoint(parseInt(hex, 16));
        }
        const hex = this.src.slice(this.pos, this.pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("Invalid \\u escape sequence", loc);
        this.advance(4);
        return String.fromCharCode(parseInt(hex, 16));
      }
      default:
        return this.fail(`Unknown escape sequence '\\${e}'`, loc);
    }
  }

  private readString(loc: Loc, start: number, formatted: boolean): Token {
    const quote = this.peekChar();
    this.advance();
    let value = "";
    while (this.pos < this.src.length && this.peekChar() !== quote) {
      const c = this.peekChar();
      if (c === "\n") this.fail("Unterminated string literal (strings cannot span lines; use \\n or a `template`)", loc);
      if (c === "\\") {
        if (formatted && (this.peekChar(1) === "{" || this.peekChar(1) === "}")) {
          value += "\\" + this.peekChar(1);
          this.advance(2);
          continue;
        }
        value += this.readEscape(loc);
        continue;
      }
      value += c;
      this.advance();
    }
    if (this.pos >= this.src.length) this.fail("Unterminated string literal", loc);
    this.advance();
    if (formatted) return this.make("template", value, loc, start, { quote, formatted: true });
    return this.make("string", value, loc, start, { quote });
  }

  private readTemplate(loc: Loc, start: number): Token {
    this.advance();
    let value = "";
    while (this.pos < this.src.length && this.peekChar() !== "`") {
      const c = this.peekChar();
      if (c === "\\") {
        if (this.peekChar(1) === "$" || this.peekChar(1) === "{" || this.peekChar(1) === "}") {
          value += "\\" + this.peekChar(1);
          this.advance(2);
          continue;
        }
        value += this.readEscape(loc);
        continue;
      }
      if (c === "$" && this.peekChar(1) === "{") {
        let depth = 0;
        const exprStart = this.pos;
        this.advance();
        do {
          const ch = this.peekChar();
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
          this.advance();
        } while (depth > 0 && this.pos < this.src.length);
        value += "{" + this.src.slice(exprStart + 2, this.pos - 1) + "}";
        continue;
      }
      if (c === "{" || c === "}") {
        value += "\\" + c;
        this.advance();
        continue;
      }
      value += c;
      this.advance();
    }
    if (this.pos >= this.src.length) this.fail("Unterminated template literal", loc);
    this.advance();
    return this.make("template", value, loc, start, { quote: "`", formatted: true });
  }

  private readRawBlock(loc: Loc, start: number): Token {
    this.advance();
    const contentStart = this.pos;
    let depth = 1;
    while (this.pos < this.src.length) {
      const c = this.peekChar();
      if (c === '"' || c === "'" || c === "`") {
        this.skipQuoted(c);
        continue;
      }
      if (c === "/" && this.peekChar(1) === "/" && (this.pos === contentStart || /\s|[;{}]/.test(this.src[this.pos - 1]))) {
        while (this.pos < this.src.length && this.peekChar() !== "\n") this.advance();
        continue;
      }
      if (c === "/" && this.peekChar(1) === "*") {
        this.advance(2);
        while (this.pos < this.src.length && !(this.peekChar() === "*" && this.peekChar(1) === "/")) this.advance();
        this.advance(2);
        continue;
      }
      if (c === "-" && this.peekChar(1) === "-" && this.peekChar(2) === "[") {
        this.skipBlockComment();
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
      this.advance();
    }
    if (depth !== 0) this.fail("Unterminated block: missing '}'", loc);
    const content = this.src.slice(contentStart, this.pos);
    this.advance();
    const bodyLoc: Loc = { ...loc, col: loc.col + 1 };
    return this.make("raw", content, bodyLoc, start);
  }

  private skipQuoted(quote: string): void {
    this.advance();
    while (this.pos < this.src.length) {
      const c = this.peekChar();
      if (c === "\\") {
        this.advance(2);
        continue;
      }
      if (c === quote) {
        this.advance();
        return;
      }
      if (c === "\n" && quote !== "`") return;
      if (quote === "`" && c === "$" && this.peekChar(1) === "{") {
        this.advance(2);
        let depth = 1;
        while (this.pos < this.src.length && depth > 0) {
          const ch = this.peekChar();
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
          this.advance();
        }
        continue;
      }
      this.advance();
    }
  }
}

export function tokenize(src: string, file: string, baseLoc?: Loc): Token[] {
  return new Lexer(src, file, baseLoc).tokenize();
}
