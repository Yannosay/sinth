import { TT, Token, Loc, SinthError } from "./types.ts";

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
  "remove":         TT.KW_REMOVE,
  "function":       TT.KW_FUNCTION,
  "return":         TT.KW_RETURN,
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
      if (ch === "!") { tokens.push(this.single(TT.OP_NOT, loc)); continue; }
      if (ch === ">" && this.src[this.pos + 1] === "=") { this.adv(); this.adv(); tokens.push({ type: TT.OP_GTEQ, value: ">=", loc }); continue; }
      if (ch === "<" && this.src[this.pos + 1] === "=") { this.adv(); this.adv(); tokens.push({ type: TT.OP_LTEQ, value: "<=", loc }); continue; }

      if (ch === "=") { tokens.push(this.single(TT.EQUALS, loc)); continue; }
      if (ch === "+") { tokens.push(this.single(TT.OP_PLUS,  loc)); continue; }
      if (ch === "*") { tokens.push(this.single(TT.OP_STAR,  loc)); continue; }
      if (ch === "/") { tokens.push(this.single(TT.OP_SLASH, loc)); continue; }
      if (ch === ";") { tokens.push(this.single(TT.OP_SEMI, loc)); continue; }
      if (ch === "<") { tokens.push(this.single(TT.OP_LT,    loc)); continue; }
      if (ch === ">") { tokens.push(this.single(TT.OP_GT,    loc)); continue; }
      if (ch === "-" && this.src[this.pos + 1] === ">") {
        this.adv(); this.adv();
        tokens.push({ type: TT.OP_ARROW, value: "->", loc });
        continue;
      }
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

      // sinth comments: -- line  or  --[ nestable block for when doing longgerrr comments]--
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