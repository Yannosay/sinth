#!/usr/bin/env node
"use strict";
// Sinth Compiler v0.0.3 — enum fix, raw-block detection, import resolution, CSS conversion, slot escaping, custom-elements, HTML5 map
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = exports.Lexer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
// === v0.0.3: Must be plain `enum TT`, NOT `const enum TT` — const enum breaks TT[t] string indexing ===
var TT;
(function (TT) {
    TT[TT["LBRACE"] = 0] = "LBRACE";
    TT[TT["RBRACE"] = 1] = "RBRACE";
    TT[TT["LPAREN"] = 2] = "LPAREN";
    TT[TT["RPAREN"] = 3] = "RPAREN";
    TT[TT["COLON"] = 4] = "COLON";
    TT[TT["COMMA"] = 5] = "COMMA";
    TT[TT["EQUALS"] = 6] = "EQUALS";
    TT[TT["DOT"] = 7] = "DOT";
    TT[TT["STRING"] = 8] = "STRING";
    TT[TT["NUMBER"] = 9] = "NUMBER";
    TT[TT["BOOL_TRUE"] = 10] = "BOOL_TRUE";
    TT[TT["BOOL_FALSE"] = 11] = "BOOL_FALSE";
    TT[TT["NULL_LIT"] = 12] = "NULL_LIT";
    TT[TT["RAW_BLOCK"] = 13] = "RAW_BLOCK";
    TT[TT["IDENT"] = 14] = "IDENT";
    TT[TT["KW_IMPORT"] = 15] = "KW_IMPORT";
    TT[TT["KW_AS"] = 16] = "KW_AS";
    TT[TT["KW_CSS"] = 17] = "KW_CSS";
    TT[TT["KW_COMPONENT"] = 18] = "KW_COMPONENT";
    TT[TT["KW_STYLE"] = 19] = "KW_STYLE";
    TT[TT["KW_SCRIPT"] = 20] = "KW_SCRIPT";
    TT[TT["KW_GLOBAL"] = 21] = "KW_GLOBAL";
    TT[TT["KW_PAGE"] = 22] = "KW_PAGE";
    TT[TT["KW_LANG"] = 23] = "KW_LANG";
    // === v0.0.3: KW_CUSTOM_EL and KW_CUSTOM ensured present ===
    TT[TT["KW_CUSTOM_EL"] = 24] = "KW_CUSTOM_EL";
    TT[TT["KW_CUSTOM"] = 25] = "KW_CUSTOM";
    TT[TT["EOF"] = 26] = "EOF";
})(TT || (TT = {}));
// ═══════════════════════════════════════════════════════════
// SECTION 2: UTILITIES
// ═══════════════════════════════════════════════════════════
class SinthError extends Error {
    constructor(rawMsg, loc, sourceLine) {
        super(SinthError.buildMessage(rawMsg, loc, sourceLine));
        this.rawMsg = rawMsg;
        this.loc = loc;
        this.sourceLine = sourceLine;
    }
    static buildMessage(msg, loc, sourceLine) {
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
    // === v0.0.3: Attach source line to produce error preview ===
    withSource(lines) {
        if (!this.loc || this.sourceLine !== undefined)
            return this;
        const line = lines[this.loc.line - 1] ?? "";
        return new SinthError(this.rawMsg, this.loc, line);
    }
}
class SinthWarning {
    static emit(msg, loc) {
        const where = loc ? `\n  at: ${loc.file}:${loc.line}` : "";
        process.stderr.write(`\x1b[33mWarning:\x1b[0m ${msg}${where}\n`);
    }
}
/** FNV-1a 32-bit hash → deterministic 8-char hex scope id */
function fnv1a(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0").slice(0, 8);
}
/** camelCase → kebab-case with vendor prefix support */
function camelToKebab(s) {
    const vp = s.match(/^(Webkit|Moz|Ms)(.+)$/);
    if (vp)
        return `-${vp[1].toLowerCase()}-${camelToKebab(vp[2])}`;
    return s.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`);
}
/** "w-counter" → "WCounter" */
function tagNameToPascal(tag) {
    return tag.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}
function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s) {
    return esc(s).replace(/"/g, "&quot;");
}
function litToString(lit) {
    switch (lit.kind) {
        case "str": return lit.value;
        case "num": return String(lit.value);
        case "bool": return String(lit.value);
        case "null": return "";
    }
}
// ═══════════════════════════════════════════════════════════
// SECTION 3: LEXER
// ═══════════════════════════════════════════════════════════
const KEYWORDS = {
    "import": TT.KW_IMPORT,
    "as": TT.KW_AS,
    "css": TT.KW_CSS,
    "component": TT.KW_COMPONENT,
    "style": TT.KW_STYLE,
    "script": TT.KW_SCRIPT,
    "global": TT.KW_GLOBAL,
    "page": TT.KW_PAGE,
    "lang": TT.KW_LANG,
    "true": TT.BOOL_TRUE,
    "false": TT.BOOL_FALSE,
    "null": TT.NULL_LIT,
    // === v0.0.3: custom-element and custom lexed as hyphenated identifier ===
    "custom-element": TT.KW_CUSTOM_EL,
    "custom": TT.KW_CUSTOM,
};
class Lexer {
    constructor(src, file) {
        this.src = src;
        this.file = file;
        this.pos = 0;
        this.line = 1;
        this.col = 1;
        this.rawBlockPending = false;
    }
    tokenize() {
        const tokens = [];
        while (true) {
            this.skipWS();
            if (this.pos >= this.src.length)
                break;
            const loc = this.loc();
            const ch = this.src[this.pos];
            if (ch === "(") {
                this.rawBlockPending = false;
                tokens.push(this.single(TT.LPAREN, loc));
                continue;
            }
            if (ch === ")") {
                tokens.push(this.single(TT.RPAREN, loc));
                continue;
            }
            if (ch === "}") {
                tokens.push(this.single(TT.RBRACE, loc));
                continue;
            }
            if (ch === ",") {
                tokens.push(this.single(TT.COMMA, loc));
                continue;
            }
            if (ch === ".") {
                tokens.push(this.single(TT.DOT, loc));
                continue;
            }
            if (ch === ":") {
                tokens.push(this.single(TT.COLON, loc));
                continue;
            }
            if (ch === "=") {
                tokens.push(this.single(TT.EQUALS, loc));
                continue;
            }
            if (ch === "{") {
                if (this.rawBlockPending) {
                    this.rawBlockPending = false;
                    tokens.push(this.readRawBlock(loc));
                }
                else {
                    tokens.push(this.single(TT.LBRACE, loc));
                }
                continue;
            }
            if (ch === '"' || ch === "'") {
                tokens.push(this.readString(loc));
                continue;
            }
            if (this.isDigit(ch) || (ch === "-" && this.isDigit(this.src[this.pos + 1] ?? ""))) {
                tokens.push(this.readNumber(loc));
                continue;
            }
            if (this.isIdentStart(ch)) {
                const tok = this.readIdent(loc);
                // === v0.0.3: Also set rawBlockPending for component, custom-element, custom ===
                if (tok.type === TT.KW_STYLE ||
                    tok.type === TT.KW_SCRIPT ||
                    tok.type === TT.KW_COMPONENT ||
                    tok.type === TT.KW_CUSTOM_EL ||
                    tok.type === TT.KW_CUSTOM) {
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
    skipWS() {
        while (this.pos < this.src.length) {
            const ch = this.src[this.pos];
            if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
                this.adv();
                continue;
            }
            // Sinth comments: -- line  or  --[ nestable block ]--
            if (ch === "-" && this.src[this.pos + 1] === "-") {
                if (this.src[this.pos + 2] === "[") {
                    this.adv();
                    this.adv();
                    this.adv(); // consume --[
                    let depth = 1;
                    while (this.pos < this.src.length && depth > 0) {
                        if (this.src[this.pos] === "-" && this.src[this.pos + 1] === "-" && this.src[this.pos + 2] === "[") {
                            depth++;
                            this.adv();
                            this.adv();
                            this.adv();
                        }
                        else if (this.src[this.pos] === "]" && this.src[this.pos + 1] === "-" && this.src[this.pos + 2] === "-") {
                            depth--;
                            this.adv();
                            this.adv();
                            this.adv();
                        }
                        else {
                            this.adv();
                        }
                    }
                    if (depth > 0)
                        throw new SinthError("Unterminated block comment --[ ... ]--", this.loc());
                }
                else {
                    while (this.pos < this.src.length && this.src[this.pos] !== "\n")
                        this.adv();
                }
                continue;
            }
            break;
        }
    }
    /** Consume a raw { ... } block tracking nested braces and skipping strings/comments. */
    readRawBlock(loc) {
        this.adv(); // consume '{'
        const start = this.pos;
        let depth = 1;
        while (this.pos < this.src.length && depth > 0) {
            const ch = this.src[this.pos];
            if (ch === '"' || ch === "'" || ch === "`") {
                this.skipRawString(ch);
                continue;
            }
            if (ch === "/" && this.src[this.pos + 1] === "/") {
                while (this.pos < this.src.length && this.src[this.pos] !== "\n")
                    this.adv();
                continue;
            }
            if (ch === "/" && this.src[this.pos + 1] === "*") {
                this.adv();
                this.adv();
                while (this.pos < this.src.length - 1 &&
                    !(this.src[this.pos] === "*" && this.src[this.pos + 1] === "/")) {
                    this.adv();
                }
                this.adv();
                this.adv();
                continue;
            }
            if (ch === "{") {
                depth++;
                this.adv();
            }
            else if (ch === "}") {
                depth--;
                if (depth > 0)
                    this.adv();
                // else: stop, leaving pos AT the closing }
            }
            else {
                this.adv();
            }
        }
        const content = this.src.substring(start, this.pos);
        this.adv(); // consume closing '}'
        return { type: TT.RAW_BLOCK, value: content, loc };
    }
    skipRawString(quote) {
        this.adv();
        while (this.pos < this.src.length) {
            const c = this.src[this.pos];
            if (c === "\\") {
                this.adv();
                this.adv();
                continue;
            }
            if (c === quote) {
                this.adv();
                return;
            }
            if (quote === "`" && c === "$" && this.src[this.pos + 1] === "{") {
                this.adv();
                this.adv(); // ${
                let d = 1;
                while (this.pos < this.src.length && d > 0) {
                    if (this.src[this.pos] === "{")
                        d++;
                    else if (this.src[this.pos] === "}")
                        d--;
                    this.adv();
                }
                continue;
            }
            this.adv();
        }
    }
    readString(loc) {
        const quote = this.src[this.pos];
        this.adv();
        let result = "";
        while (this.pos < this.src.length && this.src[this.pos] !== quote) {
            if (this.src[this.pos] === "\\") {
                this.adv();
                const e = this.src[this.pos];
                switch (e) {
                    case "\\":
                        result += "\\";
                        break;
                    case '"':
                        result += '"';
                        break;
                    case "'":
                        result += "'";
                        break;
                    case "n":
                        result += "\n";
                        break;
                    case "r":
                        result += "\r";
                        break;
                    case "t":
                        result += "\t";
                        break;
                    case "$":
                        result += "$";
                        break;
                    case "{":
                        result += "{";
                        break;
                    case "u": {
                        this.adv();
                        if (this.src[this.pos] === "{") {
                            this.adv();
                            let hex = "";
                            while (this.src[this.pos] !== "}") {
                                hex += this.src[this.pos];
                                this.adv();
                            }
                            result += String.fromCodePoint(parseInt(hex, 16));
                        }
                        else {
                            const hex = this.src.substring(this.pos, this.pos + 4);
                            result += String.fromCharCode(parseInt(hex, 16));
                            this.pos += 3;
                            this.col += 3;
                        }
                        break;
                    }
                    default: throw new SinthError(`Unknown escape sequence \\${e}`, loc);
                }
                this.adv();
            }
            else {
                result += this.src[this.pos];
                this.adv();
            }
        }
        if (this.pos >= this.src.length)
            throw new SinthError("Unterminated string literal", loc);
        this.adv(); // closing quote
        return { type: TT.STRING, value: result, loc };
    }
    readNumber(loc) {
        let s = "";
        if (this.src[this.pos] === "-") {
            s += "-";
            this.adv();
        }
        while (this.isDigit(this.src[this.pos] ?? "")) {
            s += this.src[this.pos];
            this.adv();
        }
        if (this.src[this.pos] === "." && this.isDigit(this.src[this.pos + 1] ?? "")) {
            s += ".";
            this.adv();
            while (this.isDigit(this.src[this.pos] ?? "")) {
                s += this.src[this.pos];
                this.adv();
            }
        }
        return { type: TT.NUMBER, value: s, loc };
    }
    readIdent(loc) {
        let s = "";
        // === v0.0.3: isIdentCont includes '-' so "custom-element" is read as one token ===
        while (this.pos < this.src.length && this.isIdentCont(this.src[this.pos])) {
            s += this.src[this.pos];
            this.adv();
        }
        const kw = KEYWORDS[s];
        return { type: kw !== undefined ? kw : TT.IDENT, value: s, loc };
    }
    adv() {
        const ch = this.src[this.pos++];
        if (ch === "\n") {
            this.line++;
            this.col = 1;
        }
        else {
            this.col++;
        }
    }
    single(type, loc) {
        this.adv();
        return { type, value: this.src[this.pos - 1], loc };
    }
    loc() { return { file: this.file, line: this.line, col: this.col }; }
    isDigit(c) { return c >= "0" && c <= "9"; }
    isIdentStart(c) { return /[a-zA-Z_\u00C0-\uFFFF]/.test(c); }
    // === v0.0.3: '-' allowed in identifiers so "custom-element" is a single token ===
    isIdentCont(c) { return /[a-zA-Z0-9_\-\u00C0-\uFFFF]/.test(c); }
}
exports.Lexer = Lexer;
// ═══════════════════════════════════════════════════════════
// SECTION 4: PARSER
// ═══════════════════════════════════════════════════════════
class Parser {
    constructor(tokens, file) {
        this.tokens = tokens;
        this.file = file;
        this.pos = 0;
    }
    parse() {
        const loc = this.peek().loc;
        let isPage = false;
        const imports = [];
        const meta = [];
        const defs = [];
        const uses = [];
        const styles = [];
        const scripts = [];
        const customEls = [];
        // 1. Optional page keyword
        if (this.check(TT.KW_PAGE)) {
            this.consume(TT.KW_PAGE);
            isPage = true;
        }
        // 2. Imports — must come before metadata
        while (this.check(TT.KW_IMPORT))
            imports.push(this.parseImport());
        // 3. Metadata — key = value pairs (lexer has already stripped comments/whitespace)
        while (this.isMetaStart()) {
            const entry = this.parseMeta();
            meta.push(entry);
            if (entry.key === "title")
                isPage = true;
        }
        // 4. Body: component definitions, usages, style, script, custom-element
        while (!this.check(TT.EOF)) {
            if (this.check(TT.KW_COMPONENT)) {
                defs.push(this.parseCompDef());
            }
            else if (this.check(TT.KW_STYLE)) {
                styles.push(this.parseStyleBlock());
            }
            else if (this.check(TT.KW_SCRIPT)) {
                scripts.push(this.parseScriptBlock());
            }
            else if (this.check(TT.KW_CUSTOM_EL) || this.check(TT.KW_CUSTOM)) {
                customEls.push(this.parseCustomEl());
            }
            else if (this.check(TT.IDENT)) {
                uses.push(this.parseCompUse());
            }
            else
                throw new SinthError(`Unexpected token '${this.peek().value}'`, this.peek().loc);
        }
        return { filePath: this.file, isPage, imports, meta, defs, uses, styles, scripts, customEls };
    }
    // ── Imports ──────────────────────────────────────────────
    parseImport() {
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
            let alias;
            if (this.check(TT.KW_AS)) {
                this.consume(TT.KW_AS);
                alias = this.consume(TT.IDENT).value;
            }
            return { kind: "js", name, alias, loc };
        }
        throw new SinthError(`Expected import path, library name, or 'css'`, loc);
    }
    // ── Metadata ─────────────────────────────────────────────
    isMetaStart() {
        // Metadata: IDENT followed by EQUALS  (e.g. title = "My Site")
        // Component usage: IDENT followed by LPAREN or LBRACE
        if (!this.check(TT.IDENT))
            return false;
        return this.tokens[this.pos + 1]?.type === TT.EQUALS;
    }
    parseMeta() {
        const loc = this.peek().loc;
        const key = this.consume(TT.IDENT).value;
        this.consume(TT.EQUALS);
        return { key, value: this.parseLiteral(), loc };
    }
    // ── Component definitions ─────────────────────────────────
    parseCompDef() {
        const loc = this.consume(TT.KW_COMPONENT).loc;
        const name = this.consume(TT.IDENT).value;
        const params = this.parseParamDecls();
        // === v0.0.3: rawBlockPending was set by the lexer when KW_COMPONENT was read;
        //             the next token is therefore RAW_BLOCK, not LBRACE ===
        const rawTok = this.consume(TT.RAW_BLOCK);
        const { body, styles, scripts } = this.parseCompBody(rawTok.value, rawTok.loc);
        return { name, params, body, styles, scripts, loc };
    }
    // === v0.0.3: Parse custom-element / custom declarations ===
    parseCustomEl() {
        const loc = this.peek().loc;
        if (this.check(TT.KW_CUSTOM_EL))
            this.consume(TT.KW_CUSTOM_EL);
        else if (this.check(TT.KW_CUSTOM))
            this.consume(TT.KW_CUSTOM);
        const tagName = this.consume(TT.IDENT).value;
        const sinthName = tagNameToPascal(tagName);
        const params = this.parseParamDecls();
        // custom-element / custom declarations have no body block
        return { sinthName, tagName, params, loc };
    }
    parseParamDecls() {
        const params = [];
        if (!this.check(TT.LPAREN))
            return params;
        this.consume(TT.LPAREN);
        while (!this.check(TT.RPAREN)) {
            const ploc = this.peek().loc;
            const pname = this.consume(TT.IDENT).value;
            let defaultVal;
            if (this.check(TT.EQUALS)) {
                this.consume(TT.EQUALS);
                defaultVal = this.parseLiteral();
            }
            params.push({ name: pname, defaultVal, loc: ploc });
            if (!this.check(TT.RPAREN))
                this.consume(TT.COMMA);
        }
        this.consume(TT.RPAREN);
        return params;
    }
    parseCompBody(raw, loc) {
        const tokens = new Lexer(raw, loc.file).tokenize();
        return new Parser(tokens, loc.file).parseBodyContents();
    }
    parseBodyContents() {
        const body = [], styles = [], scripts = [];
        while (!this.check(TT.EOF)) {
            if (this.check(TT.KW_STYLE)) {
                styles.push(this.parseStyleBlock());
            }
            else if (this.check(TT.KW_SCRIPT)) {
                scripts.push(this.parseScriptBlock());
            }
            else if (this.check(TT.STRING)) {
                const loc = this.peek().loc;
                body.push({ kind: "text", value: this.consume(TT.STRING).value, loc });
            }
            else if (this.check(TT.IDENT)) {
                body.push(this.parseCompUse());
            }
            else
                throw new SinthError(`Unexpected token '${this.peek().value}' in component body`, this.peek().loc);
        }
        return { body, styles, scripts };
    }
    // ── Component usages ──────────────────────────────────────
    parseCompUse() {
        const loc = this.peek().loc;
        const name = this.consume(TT.IDENT).value;
        const attrs = [];
        if (this.check(TT.LPAREN)) {
            this.consume(TT.LPAREN);
            while (!this.check(TT.RPAREN)) {
                const aloc = this.peek().loc;
                const aname = this.consume(TT.IDENT).value;
                let value = null;
                if (this.check(TT.COLON)) {
                    this.consume(TT.COLON);
                    value = this.parseLiteral();
                }
                attrs.push({ name: aname, value, loc: aloc });
                if (!this.check(TT.RPAREN))
                    this.consume(TT.COMMA);
            }
            this.consume(TT.RPAREN);
        }
        const children = [];
        if (this.check(TT.RAW_BLOCK)) {
            const rawTok = this.consume(TT.RAW_BLOCK);
            const tokens = new Lexer(rawTok.value, rawTok.loc.file).tokenize();
            children.push(...new Parser(tokens, rawTok.loc.file).parseChildList());
        }
        else if (this.check(TT.LBRACE)) {
            this.consume(TT.LBRACE);
            children.push(...this.parseChildList());
            this.consume(TT.RBRACE);
        }
        return { kind: "use", name, attrs, children, loc };
    }
    parseChildList() {
        const children = [];
        while (!this.check(TT.EOF) && !this.check(TT.RBRACE)) {
            if (this.check(TT.STRING)) {
                const loc = this.peek().loc;
                children.push({ kind: "text", value: this.consume(TT.STRING).value, loc });
            }
            else if (this.check(TT.IDENT)) {
                children.push(this.parseCompUse());
            }
            else {
                throw new SinthError(`Unexpected token '${this.peek().value}' in children`, this.peek().loc);
            }
        }
        return children;
    }
    // ── Style blocks ──────────────────────────────────────────
    parseStyleBlock() {
        const loc = this.consume(TT.KW_STYLE).loc;
        let global = false, lang = "css";
        const extraAttrs = {};
        while (!this.check(TT.RAW_BLOCK) && !this.check(TT.EOF)) {
            if (this.check(TT.KW_GLOBAL)) {
                global = true;
                this.consume(TT.KW_GLOBAL);
            }
            else if (this.check(TT.KW_LANG)) {
                this.consume(TT.KW_LANG);
                this.consume(TT.EQUALS);
                const lv = this.consume(TT.STRING).value;
                if (lv !== "css" && lv !== "scss")
                    throw new SinthError(`Unsupported style lang '${lv}'`, loc);
                lang = lv;
            }
            else if (this.check(TT.IDENT)) {
                const k = this.consume(TT.IDENT).value;
                this.consume(TT.EQUALS);
                extraAttrs[k] = this.consume(TT.STRING).value;
            }
            else
                throw new SinthError(`Unexpected token '${this.peek().value}' in style modifiers`, this.peek().loc);
        }
        return { global, lang, raw: this.consume(TT.RAW_BLOCK).value, extraAttrs, loc };
    }
    // ── Script blocks ─────────────────────────────────────────
    parseScriptBlock() {
        const loc = this.consume(TT.KW_SCRIPT).loc;
        const attrs = {};
        while (!this.check(TT.RAW_BLOCK) && !this.check(TT.EOF)) {
            const key = this.consume(TT.IDENT).value;
            if (this.check(TT.EQUALS)) {
                this.consume(TT.EQUALS);
                attrs[key] = this.consume(TT.STRING).value;
            }
            else {
                attrs[key] = "true";
            }
        }
        return { raw: this.consume(TT.RAW_BLOCK).value, attrs, loc };
    }
    // ── Literals ──────────────────────────────────────────────
    parseLiteral() {
        const tok = this.peek();
        if (this.check(TT.STRING)) {
            this.consume(TT.STRING);
            return { kind: "str", value: tok.value };
        }
        if (this.check(TT.NUMBER)) {
            this.consume(TT.NUMBER);
            return { kind: "num", value: parseFloat(tok.value) };
        }
        if (this.check(TT.BOOL_TRUE)) {
            this.consume(TT.BOOL_TRUE);
            return { kind: "bool", value: true };
        }
        if (this.check(TT.BOOL_FALSE)) {
            this.consume(TT.BOOL_FALSE);
            return { kind: "bool", value: false };
        }
        if (this.check(TT.NULL_LIT)) {
            this.consume(TT.NULL_LIT);
            return { kind: "null" };
        }
        throw new SinthError(`Expected literal value, got '${tok.value}'`, tok.loc);
    }
    // ── Token helpers ─────────────────────────────────────────
    peek() { return this.tokens[this.pos]; }
    check(t) { return this.tokens[this.pos]?.type === t; }
    consume(t) {
        const tok = this.tokens[this.pos];
        if (tok.type !== t) {
            throw new SinthError(`Expected ${TT[t]}, got '${tok.value}' (${TT[tok.type]})`, tok.loc);
        }
        this.pos++;
        return tok;
    }
}
exports.Parser = Parser;
// Module-level import stack for circular detection
const IMPORT_STACK = [];
// === v0.0.3: parseFile catches errors and attaches source line preview ===
function parseFile(filePath) {
    if (!fs.existsSync(filePath))
        throw new SinthError(`File not found: ${filePath}`);
    const src = fs.readFileSync(filePath, "utf-8");
    const srcLines = src.split("\n");
    try {
        const tokens = new Lexer(src, filePath).tokenize();
        return new Parser(tokens, filePath).parse();
    }
    catch (e) {
        if (e instanceof SinthError)
            throw e.withSource(srcLines);
        throw e;
    }
}
function resolveImports(file, cfg, visited = new Set()) {
    const allDefs = new Map();
    const customEls = new Map();
    const cssLinks = [];
    const jsLinks = [];
    // Register this file's own component definitions
    for (const def of file.defs) {
        if (BUILTIN_MAP[def.name]) {
            throw new SinthError(`'${def.name}' is a built-in SinthUI component and cannot be redefined.`, def.loc);
        }
        if (allDefs.has(def.name))
            throw new SinthError(`Duplicate component definition '${def.name}'`, def.loc);
        allDefs.set(def.name, def);
    }
    // Register custom element declarations
    for (const el of file.customEls) {
        customEls.set(el.sinthName, { tagName: el.tagName, params: el.params });
    }
    // Warn about metadata in component files
    if (!file.isPage && file.meta.length > 0) {
        for (const m of file.meta) {
            SinthWarning.emit(`Metadata key '${m.key}' in component file '${file.filePath}' has no effect.`, m.loc);
        }
    }
    for (const imp of file.imports) {
        if (imp.kind === "css") {
            const r = resolveRelative(imp.path, file.filePath);
            if (!cssLinks.includes(r))
                cssLinks.push(r);
        }
        else if (imp.kind === "js") {
            const src = resolveLibrary(imp.name, cfg);
            jsLinks.push({ src, attrs: {} });
            // === v0.0.3: Auto-import companion .sinth for JS libraries (e.g. sinthui.sinth) ===
            for (const libDir of cfg.libraryPaths) {
                const companion = path.join(libDir, imp.name + ".sinth");
                if (fs.existsSync(companion) && !visited.has(companion)) {
                    visited.add(companion);
                    IMPORT_STACK.push(companion);
                    const sub = resolveImports(parseFile(companion), cfg, visited);
                    IMPORT_STACK.pop();
                    for (const [n, d] of sub.allDefs)
                        allDefs.set(n, d);
                    for (const [n, e] of sub.customEls)
                        customEls.set(n, e);
                }
            }
        }
        else if (imp.kind === "sinth") {
            const resolved = resolveSinthPath(imp.path, file.filePath, cfg);
            if (IMPORT_STACK.includes(resolved)) {
                throw new SinthError(`Circular import detected.\n  Chain: ${[...IMPORT_STACK, resolved].join(" → ")}`);
            }
            if (visited.has(resolved))
                continue;
            visited.add(resolved);
            IMPORT_STACK.push(resolved);
            const imported = parseFile(resolved);
            IMPORT_STACK.pop();
            const sub = resolveImports(imported, cfg, visited);
            for (const [name, def] of sub.allDefs) {
                if (allDefs.has(name)) {
                    throw new SinthError(`Component '${name}' defined in multiple imported files.`);
                }
                allDefs.set(name, def);
            }
            for (const [n, e] of sub.customEls)
                customEls.set(n, e);
            for (const l of sub.cssLinks)
                if (!cssLinks.includes(l))
                    cssLinks.push(l);
            for (const j of sub.jsLinks)
                jsLinks.push(j);
        }
    }
    return { allDefs, customEls, cssLinks, jsLinks };
}
function resolveRelative(p, fromFile) {
    if (p.startsWith("./") || p.startsWith("../"))
        return path.resolve(path.dirname(fromFile), p);
    return p;
}
function resolveLibrary(name, cfg) {
    const base = name.endsWith(".js") ? name : name + ".js";
    for (const libDir of cfg.libraryPaths) {
        const c = path.join(libDir, base);
        if (fs.existsSync(c))
            return c;
    }
    return `/libraries/${base}`;
}
// === v0.0.3: resolveSinthPath — first try relative to importing file, then library paths ===
function resolveSinthPath(p, fromFile, cfg) {
    // Explicit relative path
    if (p.startsWith("./") || p.startsWith("../")) {
        const r = path.resolve(path.dirname(fromFile), p);
        if (fs.existsSync(r))
            return r;
        const w = r.endsWith(".sinth") ? "" : r + ".sinth";
        if (w && fs.existsSync(w))
            return w;
        throw new SinthError(`Cannot resolve import '${p}' from '${fromFile}'`);
    }
    // === v0.0.3: Non-relative paths (e.g. "components/Card.sinth"): try relative to importing
    //             file's directory FIRST, then fall back to library paths ===
    const relToFile = path.resolve(path.dirname(fromFile), p);
    if (fs.existsSync(relToFile))
        return relToFile;
    const relToFileExt = relToFile.endsWith(".sinth") ? relToFile : relToFile + ".sinth";
    if (fs.existsSync(relToFileExt))
        return relToFileExt;
    // Library path fallback
    for (const libDir of cfg.libraryPaths) {
        const c1 = path.join(libDir, p);
        if (fs.existsSync(c1))
            return c1;
        const c2 = c1.endsWith(".sinth") ? c1 : c1 + ".sinth";
        if (fs.existsSync(c2))
            return c2;
    }
    throw new SinthError(`Cannot resolve import '${p}'\n  Tried relative: ${relToFileExt}\n  Tried library paths: ${cfg.libraryPaths.join(", ")}`);
}
// === v0.0.3: Complete HTML5 map; Col = void <col>; Column = grid div; added SubHeading, CardGrid ===
const BUILTIN_MAP = {
    // ── Structural ──────────────────────────────────────────
    Main: { tag: "main" },
    Header: { tag: "header" },
    Footer: { tag: "footer" },
    Nav: { tag: "nav" },
    Section: { tag: "section" },
    Article: { tag: "article" },
    Aside: { tag: "aside" },
    Div: { tag: "div" },
    Span: { tag: "span" },
    Hero: { tag: "section", defaultClass: "hero" },
    Container: { tag: "div", defaultClass: "container" },
    Grid: { tag: "div", defaultClass: "grid" },
    Flex: { tag: "div", defaultClass: "flex" },
    Stack: { tag: "div", defaultClass: "stack" },
    Row: { tag: "div", defaultClass: "row" },
    // === v0.0.3: Column = grid helper div; Col = HTML void table col ===
    Column: { tag: "div", defaultClass: "col" },
    // ── Typography ────────────────────────────────────────────
    Heading: { tag: "h1" }, // resolved dynamically by level attr
    Paragraph: { tag: "p" },
    // === v0.0.3: SubHeading convenience component ===
    SubHeading: { tag: "p", defaultClass: "subheading" },
    Lead: { tag: "p", defaultClass: "lead" },
    Small: { tag: "small" },
    Strong: { tag: "strong" },
    Em: { tag: "em" },
    Code: { tag: "code" },
    Pre: { tag: "pre" },
    Blockquote: { tag: "blockquote" },
    Mark: { tag: "mark" },
    Label: { tag: "label" },
    Abbr: { tag: "abbr" },
    Del: { tag: "del" },
    Ins: { tag: "ins" },
    Sub: { tag: "sub" },
    Sup: { tag: "sup" },
    Data: { tag: "data" },
    Time: { tag: "time" },
    Bdi: { tag: "bdi" },
    Bdo: { tag: "bdo" },
    Cite: { tag: "cite" },
    Dfn: { tag: "dfn" },
    Kbd: { tag: "kbd" },
    Samp: { tag: "samp" },
    Var: { tag: "var" },
    Address: { tag: "address" },
    Ruby: { tag: "ruby" },
    Rt: { tag: "rt" },
    Rp: { tag: "rp" },
    // ── Interactive ────────────────────────────────────────────
    Button: { tag: "button" },
    Link: { tag: "a" },
    NavLink: { tag: "a" },
    Select: { tag: "select" },
    Form: { tag: "form" },
    Fieldset: { tag: "fieldset" },
    Legend: { tag: "legend" },
    Details: { tag: "details" },
    Summary: { tag: "summary" },
    Dialog: { tag: "dialog" },
    Textarea: { tag: "textarea" },
    Datalist: { tag: "datalist" },
    Optgroup: { tag: "optgroup" },
    Option: { tag: "option" },
    Progress: { tag: "progress" },
    Meter: { tag: "meter" },
    Output: { tag: "output" },
    Map: { tag: "map" },
    // ── Media ──────────────────────────────────────────────────
    Picture: { tag: "picture" },
    Video: { tag: "video" },
    Audio: { tag: "audio" },
    Figure: { tag: "figure" },
    Figcaption: { tag: "figcaption" },
    Canvas: { tag: "canvas" },
    Svg: { tag: "svg" },
    IFrame: { tag: "iframe" },
    Object: { tag: "object" },
    // ── Void elements ──────────────────────────────────────────
    Img: { tag: "img", voidEl: true },
    Logo: { tag: "img", voidEl: true },
    Input: { tag: "input", voidEl: true },
    Hr: { tag: "hr", voidEl: true },
    Br: { tag: "br", voidEl: true },
    Wbr: { tag: "wbr", voidEl: true },
    Source: { tag: "source", voidEl: true },
    Embed: { tag: "embed", voidEl: true },
    // === v0.0.3: Col = HTML void table column (NOT the grid div) ===
    Col: { tag: "col", voidEl: true },
    Area: { tag: "area", voidEl: true },
    // ── Lists ─────────────────────────────────────────────────
    Ul: { tag: "ul" }, Ol: { tag: "ol" }, Li: { tag: "li" },
    Dl: { tag: "dl" }, Dt: { tag: "dt" }, Dd: { tag: "dd" },
    // ── Tables ─────────────────────────────────────────────────
    Table: { tag: "table" },
    Caption: { tag: "caption" },
    Thead: { tag: "thead" },
    Tbody: { tag: "tbody" },
    Tfoot: { tag: "tfoot" },
    Tr: { tag: "tr" },
    Th: { tag: "th" },
    Td: { tag: "td" },
    Colgroup: { tag: "colgroup" },
    // ── Utility ────────────────────────────────────────────────
    Template: { tag: "template" },
    Slot: { tag: "slot" },
    NoScript: { tag: "noscript" },
    // === v0.0.3: CardGrid convenience layout wrapper ===
    CardGrid: { tag: "div", defaultClass: "card-grid" },
    // === v0.0.3: RawHTML marker — handled specially in renderCompUse ===
    RawHTML: { tag: "__RAW__" },
};
// All HTML void elements (never receive closing tags)
const VOID_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
]);
const EVENT_RE = /^on[A-Z]/;
function eventAttrName(name) {
    return EVENT_RE.test(name) ? name.toLowerCase() : null;
}
// ═══════════════════════════════════════════════════════════
// SECTION 7: STYLE PROCESSOR
// ═══════════════════════════════════════════════════════════
// === v0.0.3: Completely rewritten convertCSSProps — bulletproof line-by-line approach ===
// Rules:
//  - Match lines of the form: [whitespace] camelCaseProp : "value" [;]
//  - Convert property name camelCase → kebab-case
//  - Strip surrounding single or double quotes from value
//  - Ensure trailing semicolon
//  - Leave selectors (contain { or :pseudo), @rules, comments, braces untouched
function convertCSSProps(css) {
    return css.split("\n").map(line => {
        const trimmed = line.trim();
        // Leave empty lines, braces, @rules, comments untouched
        if (!trimmed)
            return line;
        if (trimmed === "}" || trimmed.startsWith("}"))
            return line;
        if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*"))
            return line;
        if (trimmed.startsWith("@"))
            return line;
        // Lines containing { are selector/block openers — leave untouched
        if (trimmed.includes("{"))
            return line;
        // Match a CSS declaration: identifier (colon) value [semicolon]
        // The colon must NOT be preceded by another colon (avoid matching ::before, &:hover etc.)
        // Property names are identifiers: letters, digits, hyphens — but we only camelCase-convert
        // identifiers that are purely alphabetic (camelCase or vendor-prefixed).
        const m = line.match(/^(\s*)([a-zA-Z][a-zA-Z0-9-]*)(\s*:\s*)(.+?)(\s*;?\s*)$/);
        if (!m)
            return line;
        const [, indent, rawProp, sep, rawVal] = m;
        // Decide if this looks like a declaration vs a pseudo-selector line
        // A declaration ends without { and the value is either quoted or a plain CSS value
        // We require either camelCase OR a quoted value to convert
        const hasCamelCase = /[a-z][A-Z]/.test(rawProp) || /^[A-Z]/.test(rawProp);
        const hasQuotedVal = /^["']/.test(rawVal.trim());
        if (!hasCamelCase && !hasQuotedVal)
            return line;
        // Strip trailing semicolon from value if present before stripping quotes
        let val = rawVal.trim();
        if (val.endsWith(";"))
            val = val.slice(0, -1).trimEnd();
        // Strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        const kebab = camelToKebab(rawProp);
        return `${indent}${kebab}: ${val};`;
    }).join("\n");
}
// === v0.0.3: processStyleBlock — correct order: interpolate {param} → camelCase convert → SCSS → scope ===
function processStyleBlock(block, hash, params = new Map()) {
    let raw = block.raw;
    // Step 1: Interpolate {param} placeholders (before anything else)
    if (params.size > 0) {
        raw = interpolateAttr(raw, params);
    }
    // Step 2: Warn if & appears in a plain CSS block
    if (block.lang === "css" && raw.includes("&")) {
        SinthWarning.emit(`'&' found in a plain CSS block. Use style lang="scss" for SCSS features.`, block.loc);
    }
    // Step 3: Convert camelCase property names BEFORE SCSS compilation
    let css = convertCSSProps(raw);
    // Step 4: SCSS compilation (if requested)
    if (block.lang === "scss") {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const sass = require("sass");
            css = sass.compileString(css).css;
        }
        catch (e) {
            const err = e;
            if (err.code === "MODULE_NOT_FOUND" || err.message?.includes("Cannot find module")) {
                throw new SinthError("SCSS support requires the 'sass' package.\n  Install with: npm install sass");
            }
            throw new SinthError(`SCSS compilation failed: ${err.message ?? String(e)}`);
        }
    }
    // Step 5: Scope selectors (unless global)
    if (!block.global)
        css = scopeCSS(css, hash);
    return css;
}
function scopeCSS(css, hash) {
    return processRules(css, `[data-s="${hash}"]`);
}
function processRules(css, attr) {
    let out = "";
    let i = 0;
    while (i < css.length) {
        // Skip top-level whitespace
        if (/\s/.test(css[i])) {
            out += css[i++];
            continue;
        }
        // Skip CSS block comments
        if (css[i] === "/" && css[i + 1] === "*") {
            const end = css.indexOf("*/", i + 2);
            if (end === -1) {
                out += css.substring(i);
                break;
            }
            out += css.substring(i, end + 2);
            i = end + 2;
            continue;
        }
        const braceIdx = findCSSBrace(css, i);
        if (braceIdx === -1) {
            out += css.substring(i);
            break;
        }
        const selector = css.substring(i, braceIdx).trim();
        const { content, end } = extractCSSBlock(css, braceIdx);
        if (/^@(-webkit-|-moz-)?keyframes/.test(selector)) {
            // @keyframes: never scope — they're global by name
            out += `${selector} {${content}}\n`;
        }
        else if (/^@(media|supports|layer|container)/.test(selector)) {
            // Descend into conditional @rules
            out += `${selector} {\n${processRules(content, attr)}\n}\n`;
        }
        else if (selector.startsWith("@")) {
            // Other @rules: pass through
            out += `${selector} {${content}}\n`;
        }
        else if (selector.length > 0) {
            out += `${scopeSelectors(selector, attr)} {${content}}\n`;
        }
        i = end;
    }
    return out;
}
function scopeSelectors(selList, attr) {
    return selList
        .split(",")
        .map(s => {
        s = s.trim();
        if (!s)
            return "";
        // Don't scope root elements
        if (/^(html|body|:root)(\s|$|{|,)/.test(s))
            return s;
        // Handle pseudo-classes/elements: insert scope before pseudo suffix
        const m = s.match(/^(.*?)((?::{1,2}[a-zA-Z-]+(?:\([^)]*\))?)+)$/);
        if (m && m[1].trim()) {
            return `${attr} ${m[1].trimEnd()}${m[2]}, ${m[1].trimEnd()}${attr}${m[2]}`;
        }
        return `${attr} ${s}, ${s}${attr}`;
    })
        .filter(Boolean)
        .join(",\n");
}
function findCSSBrace(css, from) {
    let i = from;
    while (i < css.length) {
        if (css[i] === '"' || css[i] === "'") {
            const q = css[i++];
            while (i < css.length && css[i] !== q) {
                if (css[i] === "\\")
                    i++;
                i++;
            }
            i++;
        }
        else if (css[i] === "{") {
            return i;
        }
        else {
            i++;
        }
    }
    return -1;
}
function extractCSSBlock(css, openBrace) {
    let i = openBrace + 1, depth = 1;
    while (i < css.length && depth > 0) {
        if (css[i] === '"' || css[i] === "'") {
            const q = css[i++];
            while (i < css.length && css[i] !== q) {
                if (css[i] === "\\")
                    i++;
                i++;
            }
            i++;
        }
        else if (css[i] === "/" && css[i + 1] === "*") {
            i += 2;
            while (i < css.length - 1 && !(css[i] === "*" && css[i + 1] === "/"))
                i++;
            i += 2;
        }
        else if (css[i] === "{") {
            depth++;
            i++;
        }
        else if (css[i] === "}") {
            depth--;
            if (depth > 0)
                i++;
            else
                break;
        }
        else {
            i++;
        }
    }
    return { content: css.substring(openBrace + 1, i), end: i + 1 };
}
// ═══════════════════════════════════════════════════════════
// SECTION 8: HTML GENERATOR
// ═══════════════════════════════════════════════════════════
function resolveBuiltinTag(name, attrs) {
    if (name === "Heading") {
        const la = attrs.find(a => a.name === "level");
        const lv = la?.value?.kind === "num" ? Math.min(6, Math.max(1, la.value.value)) : 1;
        if (!la)
            SinthWarning.emit(`Heading used without 'level' attribute, defaulting to h1`);
        return { tag: `h${lv}`, voidEl: false };
    }
    const info = BUILTIN_MAP[name];
    if (info)
        return { tag: info.tag, defaultClass: info.defaultClass, voidEl: info.voidEl ?? false };
    SinthWarning.emit(`Unknown component '${name}', treating as <${name.toLowerCase()}>`);
    return { tag: name.toLowerCase(), voidEl: false };
}
function renderAttr(attr, paramMap) {
    const { name, value } = attr;
    if (value === null)
        return name; // shorthand boolean true
    if (value.kind === "null")
        return ""; // omit attribute entirely
    if (value.kind === "bool")
        return value.value ? name : ""; // true → name, false → omit
    if (value.kind === "num")
        return `${name}="${value.value}"`;
    // String value — interpolate {param}, then emit
    let raw = value.value;
    raw = interpolateAttr(raw, paramMap);
    const ev = eventAttrName(name);
    if (ev) {
        const call = raw.includes("(") ? raw : `${raw}(event)`;
        return `${ev}="${escAttr(call)}"`;
    }
    return `${name}="${escAttr(raw)}"`;
}
// === v0.0.3: renderText — $slot protected from double-escaping via placeholder approach ===
function renderText(text, params) {
    // Map of placeholder → raw HTML for slot-like params
    const rawSlots = new Map();
    let counter = 0;
    let s = text;
    // Step 1: Replace \$ with a placeholder so it survives param substitution
    s = s.replace(/\\\$/g, "\x00DOLLAR\x00");
    // Step 2: Substitute $param references
    s = s.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, n) => {
        const val = params.get(n);
        if (val === undefined)
            return `$${n}`; // unknown param — keep as literal
        // $slot (and any raw-HTML param) must NOT be HTML-escaped — use a placeholder
        if (n === "slot") {
            const ph = `\x00RAW${counter++}\x00`;
            rawSlots.set(ph, val);
            return ph;
        }
        return val; // will be HTML-escaped in step 3
    });
    // Step 3: HTML-escape the entire string
    // Placeholders contain \x00 which esc() does not touch
    s = esc(s);
    // Step 4: Restore raw HTML slot placeholders (must NOT be escaped)
    for (const [ph, val] of rawSlots) {
        s = s.replace(ph, val);
    }
    // Step 5: Restore \$ → $
    s = s.replace(/\x00DOLLAR\x00/g, "$");
    // === v0.0.3: Warn about {identifier} patterns remaining after substitution ===
    const braceRe = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    let m;
    while ((m = braceRe.exec(s)) !== null) {
        SinthWarning.emit(`Use $param for text interpolation. {param} is for attributes only. Found '${m[0]}' in text content.`);
    }
    return s;
}
function interpolateAttr(text, params) {
    let s = text;
    s = s.replace(/\\\{/g, "\x00LB\x00");
    s = s.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, n) => params.get(n) ?? `{${n}}`);
    return s.replace(/\x00LB\x00/g, "{");
}
function renderChild(child, ctx, params, depth) {
    if (depth > 64)
        throw new SinthError("Maximum component nesting depth (64) exceeded.");
    if (child.kind === "text")
        return renderText(child.value, params);
    return renderCompUse(child, ctx, params, depth);
}
function renderCompUse(use, ctx, params, depth) {
    // === v0.0.3: RawHTML — output content attribute verbatim, no wrapping tag, no scoping ===
    if (use.name === "RawHTML") {
        const ca = use.attrs.find(a => a.name === "content");
        if (!ca || !ca.value)
            return "";
        return interpolateAttr(litToString(ca.value), params);
    }
    // User-defined component
    const userDef = ctx.allDefs.get(use.name);
    if (userDef)
        return expandUserComp(use, userDef, ctx, params, depth + 1);
    // Custom element
    const customEl = ctx.customEls.get(use.name);
    if (customEl) {
        const attrParts = [`data-s="${ctx.scopeHash}"`];
        for (const attr of use.attrs) {
            const r = renderAttr(attr, params);
            if (r)
                attrParts.push(r);
        }
        const attrStr = attrParts.length ? " " + attrParts.join(" ") : "";
        const inner = use.children.map(c => renderChild(c, ctx, params, depth + 1)).join("");
        return `<${customEl.tagName}${attrStr}>${inner}</${customEl.tagName}>`;
    }
    // Built-in component
    const { tag, defaultClass, voidEl } = resolveBuiltinTag(use.name, use.attrs);
    const isVoid = voidEl || VOID_TAGS.has(tag);
    const attrParts = [`data-s="${ctx.scopeHash}"`];
    let userClass;
    for (const attr of use.attrs) {
        if (attr.name === "level" && use.name === "Heading")
            continue; // consumed by tag resolution
        if (attr.name === "class") {
            if (attr.value?.kind === "str")
                userClass = interpolateAttr(attr.value.value, params);
            continue;
        }
        const rendered = renderAttr(attr, params);
        if (rendered)
            attrParts.push(rendered);
    }
    // Merge default class with user-supplied class
    const classes = [defaultClass, userClass].filter(Boolean).join(" ");
    if (classes)
        attrParts.push(`class="${escAttr(classes)}"`);
    // === v0.0.3: Default type="button" for <button> elements ===
    if (tag === "button" && !use.attrs.some(a => a.name === "type")) {
        attrParts.push(`type="button"`);
    }
    const attrStr = attrParts.length ? " " + attrParts.join(" ") : "";
    if (isVoid) {
        if (use.children.length > 0) {
            SinthWarning.emit(`<${tag}> is a void element and cannot have children.`, use.loc);
        }
        return `<${tag}${attrStr}>`;
    }
    const inner = use.children.map(c => renderChild(c, ctx, params, depth + 1)).join("");
    return `<${tag}${attrStr}>${inner}</${tag}>`;
}
function expandUserComp(use, def, ctx, params, depth) {
    // Recursion check
    if (use.name === def.name && depth > 1) {
        throw new SinthError(`Recursive component '${def.name}' is not allowed.`, use.loc);
    }
    // Build local parameter map
    const local = new Map();
    // Apply defaults first
    for (const p of def.params) {
        if (p.defaultVal !== undefined)
            local.set(p.name, litToString(p.defaultVal));
    }
    // Apply caller-supplied attributes
    for (const attr of use.attrs) {
        if (attr.value === null) {
            local.set(attr.name, "true");
        }
        else if (attr.value.kind !== "null") {
            const raw = litToString(attr.value);
            local.set(attr.name, attr.value.kind === "str" ? interpolateAttr(raw, params) : raw);
        }
    }
    // Validate required parameters
    for (const p of def.params) {
        if (!local.has(p.name)) {
            throw new SinthError(`Component '${def.name}' requires parameter '${p.name}' but it was not provided.`, use.loc);
        }
    }
    // Render slot: children at the call site
    const slotHTML = use.children.map(c => renderChild(c, ctx, params, depth)).join("");
    local.set("slot", slotHTML);
    // === v0.0.3: Process component style blocks with instance params and push to extraCSS ===
    for (const block of def.styles) {
        ctx.extraCSS.push(processStyleBlock(block, ctx.scopeHash, local));
    }
    return def.body.map(c => renderChild(c, ctx, local, depth)).join("");
}
// ═══════════════════════════════════════════════════════════
// SECTION 9: SCRIPT COLLECTOR
// ═══════════════════════════════════════════════════════════
function collectScripts(file, allDefs) {
    const componentScripts = [];
    const pageScripts = [];
    const seenFunctions = new Set();
    // Component script blocks → hoisted as IIFEs
    for (const [, def] of allDefs) {
        for (const block of def.scripts) {
            for (const fn of extractFunctionNames(block.raw)) {
                if (seenFunctions.has(fn)) {
                    throw new SinthError(`Function '${fn}' defined in multiple component script blocks.`);
                }
                seenFunctions.add(fn);
            }
            componentScripts.push(`(function(){\n${block.raw}\n})();`);
        }
    }
    // Page-level script blocks
    for (const block of file.scripts) {
        for (const fn of extractFunctionNames(block.raw)) {
            if (seenFunctions.has(fn)) {
                throw new SinthError(`Function '${fn}' conflicts with a component script.`);
            }
            seenFunctions.add(fn);
        }
        pageScripts.push({ raw: block.raw, attrs: block.attrs });
    }
    return { componentScripts, pageScripts };
}
function extractFunctionNames(js) {
    const names = [];
    const re = /^\s*(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
    let m;
    while ((m = re.exec(js)) !== null)
        names.push(m[1]);
    return names;
}
function buildHeadData(meta) {
    let title, fav;
    let lang = "en";
    let charset = "UTF-8";
    let viewport = "width=device-width, initial-scale=1.0";
    const metaTags = [];
    const metaProps = [];
    for (const m of meta) {
        const val = litToString(m.value);
        switch (m.key) {
            case "title":
                title = val;
                break;
            case "fav":
                fav = val;
                break;
            case "lang":
                lang = val;
                break;
            case "charset":
                charset = val;
                break;
            case "viewport":
                viewport = val;
                break;
            case "descr":
                metaTags.push({ name: "description", content: val });
                break;
            case "author":
                metaTags.push({ name: "author", content: val });
                break;
            case "keywords":
                metaTags.push({ name: "keywords", content: val });
                break;
            case "robots":
                metaTags.push({ name: "robots", content: val });
                break;
            default:
                if (m.key.startsWith("og") || m.key.startsWith("twitter")) {
                    const prop = m.key
                        .replace(/^og([A-Z])/, (_, c) => `og:${c.toLowerCase()}`)
                        .replace(/^twitter([A-Z])/, (_, c) => `twitter:${c.toLowerCase()}`);
                    metaProps.push({ property: prop, content: val });
                }
                else {
                    metaTags.push({ name: camelToKebab(m.key), content: val });
                }
        }
    }
    return { title, fav, lang, charset, viewport, metaTags, metaProps };
}
// === v0.0.3: .jpg and .jpeg return "image/jpeg" ===
function faviconType(p) {
    const ext = path.extname(p).toLowerCase();
    switch (ext) {
        case ".ico": return "image/x-icon";
        case ".png": return "image/png";
        case ".svg": return "image/svg+xml";
        case ".gif": return "image/gif";
        case ".webp": return "image/webp";
        case ".jpg":
        case ".jpeg": return "image/jpeg";
        default:
            SinthWarning.emit(`Unknown favicon extension '${ext}', defaulting to image/x-icon`);
            return "image/x-icon";
    }
}
function renderHead(hd, cssLinks, jsLinks, scopedCSS, companionJS) {
    const lines = [];
    lines.push(`  <meta charset="${escAttr(hd.charset)}">`);
    lines.push(`  <meta name="viewport" content="${escAttr(hd.viewport)}">`);
    if (hd.title)
        lines.push(`  <title>${esc(hd.title)}</title>`);
    if (hd.fav)
        lines.push(`  <link rel="icon" href="${escAttr(hd.fav)}" type="${faviconType(hd.fav)}">`);
    for (const m of hd.metaTags)
        lines.push(`  <meta name="${escAttr(m.name)}" content="${escAttr(m.content)}">`);
    for (const m of hd.metaProps)
        lines.push(`  <meta property="${escAttr(m.property)}" content="${escAttr(m.content)}">`);
    for (const css of cssLinks)
        lines.push(`  <link rel="stylesheet" href="${escAttr(css)}">`);
    if (scopedCSS.trim())
        lines.push(`  <style>\n${scopedCSS}\n  </style>`);
    for (const js of jsLinks) {
        const extra = Object.entries(js.attrs)
            .map(([k, v]) => v === "true" ? k : `${k}="${escAttr(v)}"`)
            .join(" ");
        lines.push(`  <script src="${escAttr(js.src)}"${extra ? " " + extra : ""}></script>`);
    }
    if (companionJS)
        lines.push(`  <script src="${escAttr(companionJS)}"></script>`);
    return `<head>\n${lines.join("\n")}\n</head>`;
}
function compileFile(filePath, opts) {
    const absPath = path.resolve(filePath);
    const file = parseFile(absPath);
    const cfg = { projectRoot: opts.projectRoot, libraryPaths: opts.libraryPaths };
    const { allDefs, customEls, cssLinks, jsLinks } = resolveImports(file, cfg);
    const hash = fnv1a(absPath);
    // === v0.0.3: extraCSS collected during rendering (per-instance component styles) ===
    const ctx = {
        allDefs, customEls, cssLinks, jsLinks,
        scopeHash: hash, pageFile: absPath, extraCSS: [],
    };
    if (!file.isPage) {
        // Component file → fragment only
        const body = file.uses.map(u => renderCompUse(u, ctx, new Map(), 0)).join("\n");
        const pageCSS = file.styles.map(s => processStyleBlock(s, hash)).join("\n");
        const allCSS = [pageCSS, ...ctx.extraCSS].join("\n");
        return `${body}\n<style>\n${allCSS}\n</style>`;
    }
    const headData = buildHeadData(file.meta);
    // Render body HTML first (populates ctx.extraCSS from expandUserComp)
    const bodyHTML = file.uses.map(u => renderCompUse(u, ctx, new Map(), 0)).join("\n");
    // Page-level style blocks (no component params)
    const pageCSS = file.styles.map(s => processStyleBlock(s, hash, new Map())).join("\n");
    const scopedCSS = [pageCSS, ...ctx.extraCSS].filter(c => c.trim()).join("\n");
    const { componentScripts, pageScripts } = collectScripts(file, allDefs);
    const companionJS = (() => {
        const base = absPath.replace(/\.sinth$/, ".js");
        return fs.existsSync(base) ? path.basename(base) : undefined;
    })();
    const head = renderHead(headData, cssLinks, jsLinks, scopedCSS, companionJS);
    const scriptTags = [];
    if (componentScripts.length > 0) {
        scriptTags.push(`<script>\n${componentScripts.join("\n\n")}\n</script>`);
    }
    for (const s of pageScripts) {
        const extra = Object.entries(s.attrs)
            .map(([k, v]) => v === "true" ? k : `${k}="${escAttr(v)}"`)
            .join(" ");
        scriptTags.push(`<script${extra ? " " + extra : ""}>\n${s.raw}\n</script>`);
    }
    const html = [
        "<!DOCTYPE html>",
        `<html lang="${escAttr(headData.lang)}">`,
        head,
        `<body data-s="${hash}">`,
        bodyHTML,
        scriptTags.join("\n"),
        "</body>",
        "</html>",
    ].join("\n");
    return opts.minify ? minifyHTML(html) : html;
}
function minifyHTML(html) {
    return html.replace(/>\s+</g, "><").replace(/\n\s*\n/g, "\n").trim();
}
// ═══════════════════════════════════════════════════════════
// SECTION 12: FILE DISCOVERY & ASSET COPY
// ═══════════════════════════════════════════════════════════
// === v0.0.3: findSinthPages skips outDir to prevent infinite watcher loops ===
function findSinthPages(dir, outDir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "node_modules")
            continue;
        const full = path.join(dir, entry.name);
        if (outDir && path.resolve(full) === path.resolve(outDir))
            continue;
        if (entry.isDirectory()) {
            results.push(...findSinthPages(full, outDir));
        }
        else if (entry.name.endsWith(".sinth")) {
            results.push(full);
        }
    }
    return results;
}
// === v0.0.3: Recursive directory copy for assets/ ===
function copyDir(src, dest) {
    if (!fs.existsSync(src))
        return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const sp = path.join(src, entry.name);
        const dp = path.join(dest, entry.name);
        if (entry.isDirectory())
            copyDir(sp, dp);
        else
            fs.copyFileSync(sp, dp);
    }
}
// ═══════════════════════════════════════════════════════════
// SECTION 13: DEV SERVER
// ═══════════════════════════════════════════════════════════
const LIVE_RELOAD_SCRIPT = `<script>
(function(){
  const es = new EventSource('/__sinth_sse__');
  es.onmessage = () => location.reload();
  es.onerror   = () => setTimeout(() => location.reload(), 1000);
})();
</script>`;
async function startDevServer(opts) {
    const clients = [];
    let debounce = null;
    const cache = new Map();
    function notify() {
        for (const c of clients) {
            try {
                c.write("data: reload\n\n");
            }
            catch { }
        }
    }
    function compileAll() {
        cache.clear();
        const pages = findSinthPages(opts.projectRoot, opts.outDir);
        for (const p of pages) {
            try {
                const html = compileFile(p, { ...opts, checkOnly: false });
                if (!html)
                    continue;
                const rel = path.relative(opts.projectRoot, p)
                    .replace(/\.sinth$/, ".html")
                    .replace(/\\/g, "/");
                const url = "/" + rel;
                cache.set(url, html + LIVE_RELOAD_SCRIPT);
                // Also map root URL to index.html
                if (rel === "index.html" || rel.endsWith("/index.html")) {
                    cache.set("/", html + LIVE_RELOAD_SCRIPT);
                }
            }
            catch (e) {
                process.stderr.write(`\x1b[31m${e.message}\x1b[0m\n`);
            }
        }
    }
    compileAll();
    // === v0.0.3: Watch ignores changes whose absolute path is inside outDir ===
    const resolvedOut = path.resolve(opts.outDir);
    try {
        fs.watch(opts.projectRoot, { recursive: true }, (_, filename) => {
            if (!filename)
                return;
            const abs = path.resolve(opts.projectRoot, filename);
            // Skip events from inside the output directory to prevent infinite loops
            if (abs.startsWith(resolvedOut + path.sep) || abs === resolvedOut)
                return;
            if (debounce)
                clearTimeout(debounce);
            debounce = setTimeout(() => { compileAll(); notify(); }, 80);
        });
    }
    catch { }
    const EXT_TYPES = {
        ".css": "text/css", ".js": "application/javascript",
        ".png": "image/png", ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp",
        ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
        ".json": "application/json", ".xml": "application/xml",
    };
    const server = http.createServer((req, res) => {
        const reqUrl = (req.url ?? "/").split("?")[0];
        // SSE endpoint for live reload
        if (reqUrl === "/__sinth_sse__") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            });
            clients.push(res);
            req.on("close", () => {
                const i = clients.indexOf(res);
                if (i !== -1)
                    clients.splice(i, 1);
            });
            return;
        }
        // Serve cached compiled HTML
        const cached = cache.get(reqUrl) ??
            cache.get(reqUrl.endsWith("/") ? reqUrl + "index.html" : reqUrl + ".html");
        if (cached) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(cached);
            return;
        }
        // Serve static files (assets, CSS, fonts, etc.)
        let filePath = path.join(opts.projectRoot, reqUrl);
        if (reqUrl.endsWith("/"))
            filePath = path.join(filePath, "index.html");
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ctype = EXT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
            res.writeHead(200, { "Content-Type": ctype });
            res.end(fs.readFileSync(filePath));
            return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
    });
    server.listen(opts.port, () => {
        process.stdout.write(`\x1b[32m[sinth dev]\x1b[0m Serving at \x1b[4mhttp://localhost:${opts.port}\x1b[0m\n`);
    });
}
// ═══════════════════════════════════════════════════════════
// SECTION 14: CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════
function loadConfig(root) {
    const cfgPath = path.join(root, "sinth.config.json");
    if (fs.existsSync(cfgPath)) {
        try {
            return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
        }
        catch {
            SinthWarning.emit("Could not parse sinth.config.json");
        }
    }
    return {};
}
async function main() {
    const [, , command, ...args] = process.argv;
    const cwd = process.cwd();
    const cfg = loadConfig(cwd);
    const outDirIdx = args.indexOf("--out");
    const outDir = outDirIdx !== -1 ? args[outDirIdx + 1] : cfg.outDir ?? path.join(cwd, "dist");
    const portIdx = args.indexOf("--port");
    const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : cfg.port ?? 3000;
    const minify = args.includes("--prod") || Boolean(cfg.minify);
    const libraryPaths = cfg.libraryPaths ?? [path.join(cwd, "libraries")];
    const opts = { projectRoot: cwd, outDir, libraryPaths, minify, checkOnly: false };
    switch (command) {
        case "build": {
            const pages = findSinthPages(cwd, outDir);
            let hadError = false, built = 0;
            for (const p of pages) {
                try {
                    const html = compileFile(p, opts);
                    if (!html)
                        continue;
                    const rel = path.relative(cwd, p).replace(/\.sinth$/, ".html");
                    const out = path.join(outDir, rel);
                    fs.mkdirSync(path.dirname(out), { recursive: true });
                    fs.writeFileSync(out, html);
                    process.stdout.write(`  \x1b[32m✓\x1b[0m ${rel}\n`);
                    built++;
                }
                catch (e) {
                    process.stderr.write(`  \x1b[31m✗\x1b[0m ${path.relative(cwd, p)}\n${e.message}\n`);
                    hadError = true;
                }
            }
            // === v0.0.3: Copy assets/ to outDir/assets/ ===
            const assetsIn = path.join(cwd, "assets");
            const assetsOut = path.join(outDir, "assets");
            if (fs.existsSync(assetsIn)) {
                copyDir(assetsIn, assetsOut);
                process.stdout.write(`  \x1b[32m✓\x1b[0m assets/ → ${path.relative(cwd, assetsOut)}/\n`);
            }
            process.stdout.write(`\n\x1b[1mBuilt ${built} page(s)\x1b[0m${hadError ? " with errors" : ""}\n`);
            process.exit(hadError ? 1 : 0);
            break;
        }
        case "dev": {
            await startDevServer({ ...opts, port });
            break;
        }
        case "check": {
            opts.checkOnly = true;
            const pages = findSinthPages(cwd, outDir);
            let hadError = false;
            for (const p of pages) {
                try {
                    compileFile(p, opts);
                    process.stdout.write(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, p)}\n`);
                }
                catch (e) {
                    process.stderr.write(`  \x1b[31m✗\x1b[0m ${path.relative(cwd, p)}\n${e.message}\n`);
                    hadError = true;
                }
            }
            process.exit(hadError ? 1 : 0);
            break;
        }
        // === v0.0.3: sinth version command ===
        case "version":
        case "--version":
        case "-v": {
            process.stdout.write("Sinth Compiler v0.0.3\n");
            break;
        }
        case "init": {
            scaffoldProject(cwd);
            break;
        }
        default: {
            process.stdout.write(`
\x1b[1mSinth Compiler v0.0.3\x1b[0m

\x1b[1mCommands:\x1b[0m
  sinth build   [--out ./dist] [--prod]   Compile all .sinth pages + copy assets/
  sinth dev     [--port 3000]             Start dev server with live reload
  sinth check                             Lint without emitting files
  sinth init                              Scaffold a new project
  sinth version                           Print version

\x1b[1mConfig:\x1b[0m sinth.config.json
  { "outDir": "./dist", "libraryPaths": ["./libraries"], "minify": false }
`);
            break;
        }
    }
}
// ── Project scaffolding ───────────────────────────────────────────────────────
function scaffoldProject(root) {
    for (const d of ["pages", "components", "styles", "libraries", "assets"]) {
        fs.mkdirSync(path.join(root, d), { recursive: true });
    }
    // Main page
    fs.writeFileSync(path.join(root, "pages", "index.sinth"), `-- My Sinth Site

page

title = "My Site"
fav   = "assets/favicon.ico"
descr = "Built with Sinth."

import "components/Navbar.sinth"
import css "styles/reset.css"

Navbar

Hero {
  Heading(level: 1) { "Welcome to Sinth" }
  Paragraph { "A declarative, component-based web UI language." }
  Button(onClick: "handleCTA") { "Get Started" }
}

Main {
  Section {
    Heading(level: 2) { "Features" }
    CardGrid {
      -- Add cards here
    }
  }
}

style {
  Hero {
    padding: "4rem 2rem"
    textAlign: "center"
    backgroundColor: "#f0f4ff"
  }
  Main {
    maxWidth: "1100px"
    margin: "0 auto"
    padding: "2rem"
  }
}

script {
  function handleCTA() {
    alert("Hello from Sinth!")
  }
}
`);
    // Navbar component
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
    Header {
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
    // Card component
    fs.writeFileSync(path.join(root, "components", "Card.sinth"), `-- Card component

component Card(title, color = "blue") {
  Div(class: "card") {
    Heading(level: 2) { $title }
    Div(class: "card-body") { $slot }
  }

  style {
    .card {
      backgroundColor: "#f7f7f7"
      borderRadius: "1rem"
      padding: "1.5rem"
      textAlign: "center"
      marginBottom: "1rem"
    }
    .card-body {
      marginTop: "0.75rem"
    }
  }
}
`);
    // Reset CSS
    fs.writeFileSync(path.join(root, "styles", "reset.css"), `*, *::before, *::after { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; line-height: 1.6; }\nimg { max-width: 100%; display: block; }\n`);
    // sinth.config.json
    fs.writeFileSync(path.join(root, "sinth.config.json"), JSON.stringify({ outDir: "./dist", libraryPaths: ["./libraries"], minify: false }, null, 2));
    // .gitignore
    fs.writeFileSync(path.join(root, ".gitignore"), "dist/\nnode_modules/\n");
    // package.json
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
        name: "my-sinth-site",
        version: "1.0.0",
        scripts: {
            build: "npx ts-node sinth.ts build",
            dev: "npx ts-node sinth.ts dev",
        },
        devDependencies: { "ts-node": "^10.0.0", typescript: "^5.0.0", sass: "^1.70.0" },
    }, null, 2));
    process.stdout.write(`
\x1b[32m✓ Sinth project scaffolded!\x1b[0m

\x1b[1mNext steps:\x1b[0m
  npm install
  npx ts-node sinth.ts dev     -- start dev server at http://localhost:3000
  npx ts-node sinth.ts build   -- build to ./dist
`);
}
// ── Entry point ──────────────────────────────────────────────────────────────
main().catch(e => {
    process.stderr.write(`\x1b[31m${e.message}\x1b[0m\n`);
    process.exit(1);
});
