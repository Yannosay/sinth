#!/usr/bin/env node
interface Loc {
    file: string;
    line: number;
    col: number;
}
declare enum TT {
    LBRACE = 0,
    RBRACE = 1,
    LPAREN = 2,
    RPAREN = 3,
    COLON = 4,
    COMMA = 5,
    EQUALS = 6,
    DOT = 7,
    STRING = 8,
    NUMBER = 9,
    BOOL_TRUE = 10,
    BOOL_FALSE = 11,
    NULL_LIT = 12,
    RAW_BLOCK = 13,
    IDENT = 14,
    KW_IMPORT = 15,
    KW_AS = 16,
    KW_CSS = 17,
    KW_COMPONENT = 18,
    KW_STYLE = 19,
    KW_SCRIPT = 20,
    KW_GLOBAL = 21,
    KW_PAGE = 22,
    KW_LANG = 23,
    KW_CUSTOM_EL = 24,
    KW_CUSTOM = 25,
    EOF = 26
}
interface Token {
    type: TT;
    value: string;
    loc: Loc;
}
type LitStr = {
    kind: "str";
    value: string;
};
type LitNum = {
    kind: "num";
    value: number;
};
type LitBool = {
    kind: "bool";
    value: boolean;
};
type LitNull = {
    kind: "null";
};
type Literal = LitStr | LitNum | LitBool | LitNull;
interface Attr {
    name: string;
    value: Literal | null;
    loc: Loc;
}
interface TextNode {
    kind: "text";
    value: string;
    loc: Loc;
}
interface CompUse {
    kind: "use";
    name: string;
    attrs: Attr[];
    children: Child[];
    loc: Loc;
}
type Child = TextNode | CompUse;
interface ParamDecl {
    name: string;
    defaultVal?: Literal;
    loc: Loc;
}
interface StyleBlock {
    global: boolean;
    lang: "css" | "scss";
    raw: string;
    extraAttrs: Record<string, string>;
    loc: Loc;
}
interface ScriptBlock {
    raw: string;
    attrs: Record<string, string>;
    loc: Loc;
}
interface CompDef {
    name: string;
    params: ParamDecl[];
    body: Child[];
    styles: StyleBlock[];
    scripts: ScriptBlock[];
    loc: Loc;
}
interface CustomElDecl {
    sinthName: string;
    tagName: string;
    params: ParamDecl[];
    loc: Loc;
}
type ImportNode = {
    kind: "sinth";
    path: string;
    loc: Loc;
} | {
    kind: "css";
    path: string;
    loc: Loc;
} | {
    kind: "js";
    name: string;
    alias?: string;
    loc: Loc;
};
interface MetaEntry {
    key: string;
    value: Literal;
    loc: Loc;
}
interface SinthFile {
    filePath: string;
    isPage: boolean;
    imports: ImportNode[];
    meta: MetaEntry[];
    defs: CompDef[];
    uses: CompUse[];
    styles: StyleBlock[];
    scripts: ScriptBlock[];
    customEls: CustomElDecl[];
}
export declare class Lexer {
    readonly src: string;
    private readonly file;
    private pos;
    private line;
    private col;
    private rawBlockPending;
    constructor(src: string, file: string);
    tokenize(): Token[];
    private skipWS;
    /** Consume a raw { ... } block tracking nested braces and skipping strings/comments. */
    private readRawBlock;
    private skipRawString;
    private readString;
    private readNumber;
    private readIdent;
    private adv;
    private single;
    private loc;
    private isDigit;
    private isIdentStart;
    private isIdentCont;
}
export declare class Parser {
    private tokens;
    private file;
    private pos;
    constructor(tokens: Token[], file: string);
    parse(): SinthFile;
    private parseImport;
    private isMetaStart;
    private parseMeta;
    private parseCompDef;
    private parseCustomEl;
    private parseParamDecls;
    private parseCompBody;
    private parseBodyContents;
    private parseCompUse;
    private parseChildList;
    private parseStyleBlock;
    private parseScriptBlock;
    private parseLiteral;
    private peek;
    private check;
    private consume;
}
export {};
