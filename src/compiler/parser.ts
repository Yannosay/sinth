import {
  Arg, ArrayItem, AssignOp, Attr, BinaryOp, ComponentDecl, ElementNode, Expr, ForNode, FunctionDecl, IfBranch, IfNode,
  ImportDecl, ImportKind, Lifecycle, MetaEntry, Node, ObjectProp, Param, ScriptBlock, SinthFile, SlotFill, Stmt,
  StyleBlock, TYPE_NAMES, TypeRef, VarDecl, Watcher, BaseType,
} from "./ast";
import { Loc, SinthError, registerSource } from "./diagnostics";
import { Token, tokenize } from "./lexer";

export const META_KEYS: ReadonlySet<string> = new Set([
  "title", "descr", "description", "fav", "favicon", "lang", "charset", "viewport", "author", "keywords", "robots",
  "themeColor", "colorScheme", "canonical", "generator", "manifest", "appleTouchIcon", "base", "bodyClass", "htmlClass",
]);

export function isMetaKey(key: string): boolean {
  return META_KEYS.has(key) || /^(og|twitter)[A-Z]/.test(key);
}

const CAPITALIZED_JS_CALLABLES: ReadonlySet<string> = new Set([
  "String", "Number", "Boolean", "BigInt", "Symbol", "Array", "Object", "Date", "Error", "RegExp", "Promise",
]);

const CAPITALIZED_JS_VALUES: ReadonlySet<string> = new Set(["Infinity", "NaN"]);

const RESERVED: ReadonlySet<string> = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum", "export",
  "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null", "return", "super",
  "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield", "let", "static", "await",
  "implements", "interface", "package", "private", "protected", "public", "and", "or", "not", "arguments", "eval",
]);

const ASSIGN_OPS: ReadonlySet<string> = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "??=", "&&=", "||="]);

type BodyOwner = {
  vars: VarDecl[];
  functions: FunctionDecl[];
  styles: StyleBlock[];
  scripts: ScriptBlock[];
  lifecycle: Lifecycle[];
  watchers: Watcher[];
};

export class Parser {
  private pos = 0;
  private readonly tokens: Token[];

  constructor(private readonly source: string, private readonly file: string) {
    registerSource(file, source);
    this.tokens = tokenize(source, file);
  }

  static fromTokens(tokens: Token[], file: string): Parser {
    const p = Object.create(Parser.prototype) as Parser;
    Object.assign(p, { pos: 0, tokens, file, source: "" });
    return p;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private get tok(): Token {
    return this.peek();
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private isPunct(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === "punct" && t.value === value;
  }

  private isIdent(value?: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === "ident" && (value === undefined || t.value === value);
  }

  private eat(value: string): boolean {
    if (this.isPunct(value)) {
      this.next();
      return true;
    }
    return false;
  }

  private eatIdent(value: string): boolean {
    if (this.isIdent(value)) {
      this.next();
      return true;
    }
    return false;
  }

  private describe(t: Token): string {
    if (t.kind === "eof") return "end of file";
    if (t.kind === "string") return `string "${t.value}"`;
    if (t.kind === "raw") return "block";
    return `'${t.value}'`;
  }

  private fail(message: string, t: Token = this.tok, hint?: string, code = "E0100"): never {
    throw new SinthError(code, message, { ...t.loc, length: Math.max(1, t.end - t.start) }, hint);
  }

  private expect(value: string, context?: string): Token {
    if (!this.isPunct(value)) {
      this.fail(`Expected '${value}'${context ? " " + context : ""}, found ${this.describe(this.tok)}`);
    }
    return this.next();
  }

  private expectIdent(context: string): Token {
    if (this.tok.kind !== "ident") this.fail(`Expected ${context}, found ${this.describe(this.tok)}`);
    return this.next();
  }

  private sameLine(): boolean {
    return !this.tok.newlineBefore;
  }

  private adjacent(): boolean {
    const prev = this.tokens[this.pos - 1];
    return !!prev && prev.end === this.tok.start;
  }

  parseFile(): SinthFile {
    const file: SinthFile = {
      path: this.file, source: this.source, isPage: false, imports: [], meta: [], externs: [], vars: [], functions: [],
      components: [], styles: [], scripts: [], lifecycle: [], watchers: [], body: [],
    };
    if (this.isIdent("page")) {
      this.next();
      file.isPage = true;
    }
    const declared = new Set<string>();
    while (this.tok.kind !== "eof") {
      const t = this.tok;
      if (t.kind === "ident") {
        switch (t.value) {
          case "import": file.imports.push(this.parseImport()); continue;
          case "extern":
            this.next();
            do {
              const n = this.expectIdent("a name after 'extern'");
              file.externs.push({ name: n.value, loc: n.loc });
            } while (this.eat(","));
            continue;
          case "private":
          case "export":
            if (this.isIdent("component", 1) || this.isIdent("custom-element", 1)) {
              const exported = t.value === "export";
              this.next();
              const comp = this.isIdent("component") ? this.parseComponent() : this.parseLegacyCustomElement();
              comp.exported = exported;
              file.components.push(comp);
              continue;
            }
            break;
          case "component": file.components.push(this.parseComponent()); continue;
          case "custom-element":
          case "custom":
            if (this.peek(1).kind === "ident") {
              file.components.push(this.parseLegacyCustomElement());
              continue;
            }
            break;
          default:
            break;
        }
        if (this.tryParseOwnerItem(file, declared)) continue;
        if (t.value !== "var" && this.isPunct("=", 1) && !declared.has(t.value) && isMetaKey(t.value)) {
          this.next();
          this.next();
          file.meta.push({ key: t.value, value: this.parseExpr(), loc: t.loc } satisfies MetaEntry);
          continue;
        }
      }
      file.body.push(...this.parseNode(file));
    }
    return file;
  }

  private tryParseOwnerItem(owner: BodyOwner, declared?: Set<string>): boolean {
    const t = this.tok;
    if (t.kind !== "ident") return false;
    if (t.value === "var" || t.value === "const" || t.value === "computed" || (t.value === "persist" && this.isIdent("var", 1))) {
      const decl = this.parseVarDecl();
      owner.vars.push(decl);
      declared?.add(decl.name);
      return true;
    }
    if (t.value === "function" || (t.value === "async" && this.isIdent("function", 1))) {
      owner.functions.push(this.parseFunction());
      return true;
    }
    if (t.value === "style" && this.peekPastModifiersIsRaw()) {
      owner.styles.push(this.parseStyle());
      return true;
    }
    if (t.value === "script" && this.peekPastModifiersIsRaw()) {
      owner.scripts.push(this.parseScript());
      return true;
    }
    if ((t.value === "onMount" || t.value === "onDestroy") && this.isPunct("{", 1)) {
      this.next();
      owner.lifecycle.push({ kind: t.value === "onMount" ? "mount" : "destroy", body: this.parseStmtBlock(), loc: t.loc });
      return true;
    }
    if (t.value === "watch" && !this.peek(1).newlineBefore && (this.peek(1).kind !== "punct" || this.isPunct("(", 1))) {
      return this.parseWatch(owner);
    }
    return false;
  }

  private parseWatch(owner: BodyOwner): boolean {
    const t = this.next();
    const expr = this.parseExpr();
    owner.watchers.push({ expr, body: this.parseStmtBlock(), loc: t.loc });
    return true;
  }

  private peekPastModifiersIsRaw(): boolean {
    for (let i = 1; i < 32; i++) {
      const t = this.peek(i);
      if (t.kind === "raw") return true;
      if (t.kind === "eof" || (t.kind === "punct" && t.value !== "=")) return false;
    }
    return false;
  }

  private parseImport(): ImportDecl {
    const start = this.next();
    const loc = start.loc;
    const decl: ImportDecl = { kind: "module", source: "", named: [], attrs: {}, sideEffect: false, loc };
    let forced: ImportKind | undefined;
    if (this.isIdent("css") || this.isIdent("style")) {
      this.next();
      forced = "style";
    } else if (this.isIdent("js") || this.isIdent("script")) {
      this.next();
      forced = "script";
    } else if (this.isIdent("font")) {
      this.next();
      forced = "font";
    }

    if (this.tok.kind === "string") {
      decl.source = this.next().value;
      decl.sideEffect = true;
    } else {
      if (this.eat("*")) {
        if (!this.eatIdent("as")) this.fail("Expected 'as' after '*' in import");
        decl.namespace = this.expectIdent("a namespace name").value;
      } else if (this.isPunct("{")) {
        decl.named = this.parseImportSpecifiers();
      } else if (this.tok.kind === "ident" && !this.isIdent("from")) {
        const name = this.next().value;
        if (this.isIdent("as")) {
          this.next();
          decl.defaultName = this.expectIdent("an alias").value;
          decl.named.push({ name, alias: decl.defaultName, loc });
          decl.defaultName = undefined;
          if (!this.isIdent("from")) {
            decl.source = name;
            decl.kind = "library";
            return decl;
          }
        } else {
          decl.defaultName = name;
        }
        if (this.eat(",")) {
          if (this.eat("*")) {
            this.eatIdent("as");
            decl.namespace = this.expectIdent("a namespace name").value;
          } else {
            decl.named.push(...this.parseImportSpecifiers());
          }
        }
        if (!this.isIdent("from")) {
          decl.source = name;
          decl.defaultName = undefined;
          decl.kind = "library";
          decl.sideEffect = true;
          return decl;
        }
      }
      if (!this.eatIdent("from")) this.fail(`Expected 'from' in import, found ${this.describe(this.tok)}`);
      if (this.peek().kind !== "string") this.fail("Expected a module path string after 'from'");
      decl.source = this.next().value;
    }

    let alias: string | undefined;
    if (this.isIdent("as") && decl.sideEffect) {
      this.next();
      alias = this.expectIdent("an alias").value;
      decl.sideEffect = false;
    }

    if (this.isPunct("{") && this.sameLine()) decl.attrs = this.parseImportAttrs();
    decl.kind = forced ?? classifyImport(decl.source);
    if (alias) {
      if (decl.kind === "sinth") decl.defaultName = alias;
      else decl.namespace = alias;
    }
    return decl;
  }

  private parseImportSpecifiers(): { name: string; alias: string; loc: Loc }[] {
    const out: { name: string; alias: string; loc: Loc }[] = [];
    this.expect("{");
    while (!this.isPunct("}")) {
      const t = this.expectIdent("an imported name");
      let alias = t.value;
      if (this.eatIdent("as")) alias = this.expectIdent("an alias").value;
      out.push({ name: t.value, alias, loc: t.loc });
      if (!this.eat(",")) break;
    }
    this.expect("}", "to close the import list");
    return out;
  }

  private parseImportAttrs(): Record<string, string | boolean> {
    const attrs: Record<string, string | boolean> = {};
    this.expect("{");
    while (!this.isPunct("}")) {
      const key = this.expectIdent("an attribute name").value;
      if (this.eat(":")) {
        const v = this.next();
        attrs[key] = v.kind === "string" ? v.value : v.value === "true" ? true : v.value === "false" ? false : v.value;
      } else {
        attrs[key] = true;
      }
      this.eat(",");
    }
    this.expect("}");
    return attrs;
  }

  parseTypeRef(): TypeRef {
    const t = this.expectIdent("a type");
    if (!TYPE_NAMES.has(t.value)) {
      this.fail(`Unknown type '${t.value}'`, t, "Valid types: str, num, bool, obj, ui, any, void (add [] for arrays, ? for nullable)", "E0201");
    }
    const ref: TypeRef = { base: t.value as BaseType, array: 0, nullable: false };
    while (this.isPunct("[") && this.isPunct("]", 1) && this.adjacent()) {
      this.next();
      this.next();
      ref.array++;
    }
    if (this.isPunct("?") && this.adjacent()) {
      this.next();
      ref.nullable = true;
    }
    return ref;
  }

  private looksLikeType(offset = 0): boolean {
    const t = this.peek(offset);
    return t.kind === "ident" && TYPE_NAMES.has(t.value);
  }

  private parseVarDecl(): VarDecl {
    const start = this.tok;
    let persist = false;
    if (this.isIdent("persist")) {
      this.next();
      persist = true;
    }
    const kindTok = this.next();
    const kind = kindTok.value === "const" ? "const" : kindTok.value === "computed" ? "computed" : "var";
    let type: TypeRef | undefined;
    if (this.looksLikeType() && (this.peek(1).kind === "ident" || (this.isPunct("[", 1) && this.isPunct("]", 2)) || this.isPunct("?", 1))) {
      type = this.parseTypeRef();
    }
    const nameTok = this.expectIdent("a variable name");
    this.checkName(nameTok);
    if (!type && this.isPunct(":")) {
      this.next();
      type = this.parseTypeRef();
    }
    let init: Expr | undefined;
    if (this.eat("=")) init = this.parseExpr();
    if (kind !== "var" && !init) this.fail(`'${kind}' declarations need an initial value`, nameTok);
    this.eat(";");
    return { kind, name: nameTok.value, type, init, persist, loc: start.loc };
  }

  private checkName(t: Token): void {
    if (RESERVED.has(t.value)) this.fail(`'${t.value}' is a reserved word and cannot be used as a name`, t, undefined, "E0102");
    if (t.value.startsWith("$$")) this.fail(`Names starting with '$$' are reserved for the Sinth runtime`, t, undefined, "E0102");
  }

  private parseParams(): Param[] {
    const params: Param[] = [];
    if (!this.eat("(")) return params;
    while (!this.isPunct(")")) {
      const start = this.tok;
      const rest = this.eat("...");
      const bindable = this.isIdent("bind") && this.peek(1).kind === "ident" && !this.isPunct(":", 1);
      if (bindable) this.next();
      let type: TypeRef | undefined;
      if (this.looksLikeType() && (this.peek(1).kind === "ident" || (this.isPunct("[", 1) && this.isPunct("]", 2)) || this.isPunct("?", 1))) {
        type = this.parseTypeRef();
      }
      const nameTok = this.expectIdent("a parameter name");
      this.checkName(nameTok);
      let optional = false;
      if (this.isPunct("?") && this.adjacent()) {
        this.next();
        optional = true;
      }
      if (!type && this.eat(":")) type = this.parseTypeRef();
      let defaultValue: Expr | undefined;
      if (this.eat("=")) defaultValue = this.parseExpr();
      if (type?.nullable && !defaultValue) optional = true;
      params.push({ name: nameTok.value, type, defaultValue, optional: optional || !!defaultValue, rest, bindable, loc: start.loc });
      if (!this.eat(",")) break;
    }
    this.expect(")", "to close the parameter list");
    return params;
  }

  private parseFunction(): FunctionDecl {
    const start = this.tok;
    const isAsync = this.eatIdent("async");
    this.next();
    const nameTok = this.expectIdent("a function name");
    this.checkName(nameTok);
    if (/^[A-Z]/.test(nameTok.value)) {
      this.fail(`Function '${nameTok.value}' must start with a lowercase letter`, nameTok, "Use 'component' for reusable UI with a capitalized name");
    }
    const params = this.parseParams();
    let returnType: TypeRef | undefined;
    if (this.eat("->") || this.eat(":")) returnType = this.parseTypeRef();
    const fn: FunctionDecl = { name: nameTok.value, params, returnType, body: [], async: isAsync, loc: start.loc };
    if (returnType?.base === "ui") {
      this.expect("{", "to open the function body");
      const owner = emptyOwner();
      fn.view = this.parseNodesUntilClose(owner, true);
      this.expect("}", "to close the function body");
      fn.body = owner.vars.map(decl => ({ k: "var", decl, loc: decl.loc }));
    } else {
      fn.body = this.parseStmtBlock();
    }
    return fn;
  }

  private parseComponent(): ComponentDecl {
    const start = this.next();
    const nameTok = this.expectIdent("a component name");
    if (!/^[A-Z]/.test(nameTok.value)) this.fail(`Component '${nameTok.value}' must start with an uppercase letter`, nameTok);
    const params = this.parseParams();
    let customTag: string | undefined;
    if (this.eatIdent("as")) customTag = this.parseTagLiteral();
    const comp: ComponentDecl = {
      name: nameTok.value, params, vars: [], functions: [], body: [], styles: [], scripts: [], lifecycle: [], watchers: [],
      customTag, exported: true, file: this.file, loc: start.loc,
    };
    this.expect("{", `to open the body of component '${nameTok.value}'`);
    comp.body = this.parseNodesUntilClose(comp, false);
    this.expect("}", `to close component '${nameTok.value}'`);
    return comp;
  }

  private parseTagLiteral(): string {
    this.expect("<", "to start a tag name like <my-element/>");
    let tag = this.expectIdent("a tag name").value;
    while (this.isPunct("-") && this.adjacent()) {
      this.next();
      tag += "-" + this.expectIdent("a tag name segment").value;
    }
    this.eat("/");
    this.expect(">", "to close the tag literal");
    if (!/^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(tag)) this.fail(`'${tag}' is not a valid custom element name (it must be lowercase and contain a dash)`);
    return tag;
  }

  private parseLegacyCustomElement(): ComponentDecl {
    const start = this.next();
    const nameTok = this.expectIdent("an element name");
    let customTag: string | undefined;
    const params: Param[] = [];
    if (this.eat("(")) {
      while (!this.isPunct(")")) {
        const key = this.expectIdent("an option").value;
        if (key === "export") {
          this.expect(":");
          customTag = this.parseTagLiteral();
        } else {
          params.push({ name: key, optional: true, rest: false, loc: this.tok.loc, defaultValue: this.eat("=") ? this.parseExpr() : undefined });
        }
        if (!this.eat(",")) break;
      }
      this.expect(")");
    }
    const name = /^[A-Z]/.test(nameTok.value) ? nameTok.value : nameTok.value[0].toUpperCase() + nameTok.value.slice(1);
    const comp: ComponentDecl = {
      name, params, vars: [], functions: [], body: [], styles: [], scripts: [], lifecycle: [], watchers: [],
      customTag: customTag ?? `sinth-${nameTok.value.toLowerCase()}`, exported: true, file: this.file, loc: start.loc,
    };
    if (this.tok.kind === "raw") {
      const raw = this.next();
      const sub = Parser.fromTokens(tokenize(raw.value, this.file, raw.loc), this.file);
      comp.body = sub.parseNodesUntilClose(comp, false);
    } else {
      this.expect("{");
      comp.body = this.parseNodesUntilClose(comp, false);
      this.expect("}");
    }
    return comp;
  }

  private parseStyle(): StyleBlock {
    const start = this.next();
    let global = false;
    let lang: StyleBlock["lang"] = "sinth";
    while (this.tok.kind !== "raw") {
      if (this.eatIdent("global")) global = true;
      else if (this.eatIdent("scoped")) global = false;
      else if (this.isIdent("lang")) {
        this.next();
        this.expect("=");
        const v = this.next();
        if (v.value !== "css" && v.value !== "scss" && v.value !== "sinth") this.fail(`Unsupported style language '${v.value}'`, v, "Use lang=\"css\", lang=\"scss\" or omit it");
        lang = v.value as StyleBlock["lang"];
      } else this.fail(`Unexpected ${this.describe(this.tok)} in style block header`);
    }
    const raw = this.next();
    return { global, lang, raw: raw.value, loc: { ...raw.loc, line: raw.loc.line, col: start.loc.col } };
  }

  private parseScript(): ScriptBlock {
    this.next();
    const attrs: Record<string, string> = {};
    while (this.tok.kind !== "raw") {
      const key = this.expectIdent("a script attribute").value;
      attrs[key] = this.eat("=") ? this.next().value : "true";
    }
    const raw = this.next();
    return { raw: raw.value, attrs, loc: raw.loc };
  }

  parseNodesUntilClose(owner: BodyOwner, allowReturn: boolean): Node[] {
    const nodes: Node[] = [];
    while (!this.isPunct("}") && this.tok.kind !== "eof") {
      if (this.tryParseOwnerItem(owner)) continue;
      if (allowReturn && this.isIdent("return")) {
        this.next();
        if (this.isPunct("}")) continue;
      }
      nodes.push(...this.parseNode(owner));
    }
    return nodes;
  }

  private startsElement(): boolean {
    const t = this.tok;
    if (t.kind !== "ident" || !/^[A-Z]/.test(t.value)) return false;
    if (CAPITALIZED_JS_VALUES.has(t.value)) return false;
    if (this.isPunct(".", 1)) {
      const after = this.peek(2);
      return after.kind === "ident" && /^[A-Z]/.test(after.value);
    }
    if (CAPITALIZED_JS_CALLABLES.has(t.value) && this.isPunct("(", 1)) return false;
    return true;
  }

  private parseNode(owner: BodyOwner): Node[] {
    const t = this.tok;
    if (t.kind === "ident") {
      if (t.value === "if") return [this.parseIfNode(owner)];
      if (t.value === "for") return [this.parseForNode(owner)];
      if (t.value === "$slot") return [this.parseSlotOutlet(owner)];
      if (t.value === "var" || t.value === "const" || t.value === "computed") {
        const decl = this.parseVarDecl();
        return [{ k: "var", decl, loc: decl.loc }];
      }
      if (t.value === "slot" && this.isPunct("(", 1)) {
        this.fail("'slot(...) { }' can only be used directly inside a component usage to fill a named slot");
      }
      if (this.startsElement()) return [this.parseElement(owner)];
    }
    if (t.kind === "raw") this.fail("Unexpected block");
    const startLoc = t.loc;
    const expr = this.parseExpr();
    this.eat(";");
    if (isStatementExpr(expr)) return [{ k: "stmt", stmt: { k: "expr", expr, loc: startLoc }, loc: startLoc }];
    const node: Node = { k: "text", expr, loc: startLoc };
    const next = this.tok;
    const startsNode = next.kind === "ident" && (/^[A-Z]/.test(next.value) || ["if", "for", "var", "const", "computed", "$slot", "slot"].includes(next.value));
    if (!next.newlineBefore && (next.kind === "string" || next.kind === "number" || next.kind === "template" || (next.kind === "ident" && !startsNode))) {
      this.fail(`Unexpected ${this.describe(this.tok)} after expression`, this.tok, "Use '+' to join values, or put each child on its own line");
    }
    return [node];
  }

  private parseSlotOutlet(owner: BodyOwner): Node {
    const t = this.next();
    let name = "default";
    let fallback: Node[] = [];
    if (this.isPunct("(") && this.adjacent()) {
      this.next();
      while (!this.isPunct(")")) {
        const key = this.expectIdent("'name' or 'fallback'");
        this.expect(":");
        if (key.value === "name") {
          const v = this.next();
          if (v.kind !== "string") this.fail("Slot names must be string literals", v);
          name = v.value;
        } else if (key.value === "fallback") {
          const e = this.parseExpr();
          fallback = [{ k: "text", expr: e, loc: e.loc }];
        } else this.fail(`Unknown slot option '${key.value}'`, key);
        if (!this.eat(",")) break;
      }
      this.expect(")");
    }
    if (this.isPunct("{") && this.sameLine()) {
      this.next();
      fallback = this.parseNodesUntilClose(owner, false);
      this.expect("}");
    }
    return { k: "slot", name, fallback, loc: t.loc };
  }

  private parseElement(owner: BodyOwner): ElementNode {
    const start = this.next();
    let name = start.value;
    while (this.isPunct(".") && this.peek(1).kind === "ident") {
      this.next();
      name += "." + this.next().value;
    }
    const el: ElementNode = { k: "element", name, attrs: [], children: [], slots: [], hasBody: false, loc: start.loc };
    if (this.isPunct("(") && this.sameLine()) el.attrs = this.parseAttrs();
    if (this.isPunct("{")) {
      this.next();
      el.hasBody = true;
      while (!this.isPunct("}") && this.tok.kind !== "eof") {
        if (this.isIdent("slot") && this.isPunct("(", 1)) {
          el.slots.push(this.parseSlotFill(owner));
          continue;
        }
        if (this.tryParseOwnerItem(owner)) continue;
        el.children.push(...this.parseNode(owner));
      }
      this.expect("}", `to close '${name}'`);
    }
    return el;
  }

  private parseSlotFill(owner: BodyOwner): SlotFill {
    const t = this.next();
    this.expect("(");
    let name = "default";
    while (!this.isPunct(")")) {
      const key = this.expectIdent("'name'");
      this.expect(":");
      const v = this.next();
      if (key.value !== "name" || v.kind !== "string") this.fail("Expected slot(name: \"...\")", v);
      name = v.value;
      if (!this.eat(",")) break;
    }
    this.expect(")");
    this.expect("{", "to open the slot content");
    const children = this.parseNodesUntilClose(owner, false);
    this.expect("}");
    return { name, children, loc: t.loc };
  }

  private parseAttrName(): { full: string; loc: Loc } {
    const first = this.tok;
    if (first.kind !== "ident" && first.kind !== "string") this.fail(`Expected an attribute name, found ${this.describe(first)}`);
    this.next();
    let full = first.value;
    while (first.kind === "ident" && this.isPunct("-") && this.adjacent() && this.peek(1).kind === "ident" && this.peek(1).start === this.tok.end) {
      this.next();
      full += "-" + this.next().value;
    }
    return { full, loc: first.loc };
  }

  private parseAttrs(): Attr[] {
    const attrs: Attr[] = [];
    this.expect("(");
    while (!this.isPunct(")") && this.tok.kind !== "eof") {
      if (this.isPunct("...")) {
        const t = this.next();
        attrs.push({ name: "...", modifiers: [], value: this.parseExpr(), loc: t.loc });
        this.eat(",");
        continue;
      }
      const nameTok = this.parseAttrName();
      const modifiers: string[] = [];
      while (this.isPunct(".") && this.adjacent()) {
        this.next();
        modifiers.push(this.expectIdent("an event modifier").value);
      }
      const attr: Attr = { name: nameTok.full, modifiers, value: null, loc: nameTok.loc };
      if (this.eat(":")) {
        if (/^on[A-Z]/.test(attr.name)) attr.handler = this.parseHandler();
        else attr.value = this.parseExpr();
      }
      attrs.push(attr);
      this.eat(",");
    }
    this.expect(")", "to close the attribute list");
    return attrs;
  }

  private atAttrBoundary(): boolean {
    if (this.isPunct(",") || this.isPunct(")")) return true;
    return this.tok.kind === "ident" && this.isPunct(":", 1) && !this.isIdent("else");
  }

  private parseHandler(): Stmt[] {
    const stmts: Stmt[] = [];
    for (;;) {
      if (this.atAttrBoundary()) break;
      stmts.push(this.parseStmt());
      if (!this.eat(";")) break;
    }
    if (stmts.length === 0) this.fail("Expected an event handler");
    return stmts;
  }

  private parseIfNode(owner: BodyOwner): IfNode {
    const start = this.next();
    const node: IfNode = { k: "if", branches: [], persist: false, loc: start.loc };
    const firstTest = this.parseExpr();
    this.parseIfModifiers(node);
    node.branches.push({ test: firstTest, body: this.parseNodeBlock(owner), loc: start.loc });
    for (;;) {
      if (this.isIdent("elif")) {
        const t = this.next();
        const test = this.parseExpr();
        this.parseIfModifiers(node);
        node.branches.push({ test, body: this.parseNodeBlock(owner), loc: t.loc });
        continue;
      }
      if (this.isIdent("else")) {
        const t = this.next();
        if (this.eatIdent("if")) {
          const test = this.parseExpr();
          this.parseIfModifiers(node);
          node.branches.push({ test, body: this.parseNodeBlock(owner), loc: t.loc });
          continue;
        }
        this.parseIfModifiers(node);
        node.branches.push({ body: this.parseNodeBlock(owner), loc: t.loc } satisfies IfBranch);
      }
      break;
    }
    return node;
  }

  private parseIfModifiers(node: IfNode): void {
    for (;;) {
      if (this.eatIdent("persist")) node.persist = true;
      else if (this.eatIdent("replace")) continue;
      else if (this.isIdent("delay") && this.isPunct("(", 1)) {
        this.next();
        this.next();
        node.delay = this.parseExpr();
        this.expect(")");
      } else if (this.isIdent("hide") && this.isPunct("(", 1)) {
        this.next();
        this.next();
        const v = this.parseExpr();
        this.expect(")");
        if (v.k === "lit" && v.value === true) node.persist = true;
      } else if (this.isIdent("transition") && this.isPunct("(", 1)) {
        this.next();
        this.next();
        const v = this.next();
        if (v.kind !== "string") this.fail("transition(...) expects a string name like \"fade\"", v);
        node.transition = v.value;
        this.expect(")");
      } else break;
    }
  }

  private parseNodeBlock(owner: BodyOwner): Node[] {
    this.expect("{", "to open the block");
    const nodes = this.parseNodesUntilClose(owner, false);
    this.expect("}", "to close the block");
    return nodes;
  }

  private parseLoopHead(): { names: string[]; iter: Expr; keyExpr?: Expr; filter?: Expr } {
    const paren = this.isPunct("(") && this.loopHeadIsParenthesized();
    if (paren) this.next();
    const names: string[] = [];
    do {
      const n = this.expectIdent("a loop variable name");
      this.checkName(n);
      names.push(n.value);
    } while (this.eat(","));
    if (names.length > 3) this.fail("A for loop can declare at most three names: item, index, key");
    if (!this.eatIdent("in")) this.fail(`Expected 'in' after loop variable${names.length > 1 ? "s" : ""}`);
    const iter = this.parseExpr();
    if (paren) this.expect(")", "to close the loop header");
    let keyExpr: Expr | undefined;
    let filter: Expr | undefined;
    for (;;) {
      if (this.isIdent("key")) {
        this.next();
        keyExpr = this.parseExpr();
      } else if (this.isIdent("if")) {
        this.next();
        filter = this.parseExpr();
      } else break;
    }
    return { names, iter, keyExpr, filter };
  }

  private loopHeadIsParenthesized(): boolean {
    let depth = 0;
    for (let i = 0; i < 4096; i++) {
      const t = this.peek(i);
      if (t.kind === "eof") return false;
      if (t.kind === "punct" && (t.value === "(" || t.value === "[" || t.value === "{")) depth++;
      if (t.kind === "punct" && (t.value === ")" || t.value === "]" || t.value === "}")) depth--;
      if (depth === 1 && t.kind === "ident" && t.value === "in") return true;
      if (depth === 0) return false;
    }
    return false;
  }

  private parseForNode(owner: BodyOwner): ForNode {
    const start = this.next();
    const head = this.parseLoopHead();
    this.eatIdent("persist");
    const node: ForNode = { k: "for", ...head, body: this.parseNodeBlock(owner), loc: start.loc };
    if (this.isIdent("else") && this.isPunct("{", 1)) {
      this.next();
      node.empty = this.parseNodeBlock(owner);
    }
    return node;
  }

  parseStmtBlock(): Stmt[] {
    this.expect("{", "to open the block");
    const stmts: Stmt[] = [];
    while (!this.isPunct("}") && this.tok.kind !== "eof") {
      stmts.push(this.parseStmt());
      this.eat(";");
    }
    this.expect("}", "to close the block");
    return stmts;
  }

  private parseStmt(): Stmt {
    const t = this.tok;
    if (t.kind === "ident") {
      switch (t.value) {
        case "var":
        case "const":
        case "computed": {
          const decl = this.parseVarDecl();
          return { k: "var", decl, loc: decl.loc };
        }
        case "if": {
          this.next();
          const test = this.parseExpr();
          const then = this.isPunct("{") ? this.parseStmtBlock() : [this.parseStmt()];
          let otherwise: Stmt[] | undefined;
          if (this.isIdent("elif")) {
            otherwise = [this.parseStmt()];
          } else if (this.isIdent("else")) {
            this.next();
            otherwise = this.isPunct("{") ? this.parseStmtBlock() : [this.parseStmt()];
          }
          return { k: "if", test, then, else: otherwise, loc: t.loc };
        }
        case "elif": {
          this.next();
          const test = this.parseExpr();
          const then = this.parseStmtBlock();
          let otherwise: Stmt[] | undefined;
          if (this.isIdent("elif")) otherwise = [this.parseStmt()];
          else if (this.eatIdent("else")) otherwise = this.isPunct("{") ? this.parseStmtBlock() : [this.parseStmt()];
          return { k: "if", test, then, else: otherwise, loc: t.loc };
        }
        case "for": {
          this.next();
          const head = this.parseLoopHead();
          return { k: "for", names: head.names, iter: head.iter, filter: head.filter, body: this.parseStmtBlock(), loc: t.loc };
        }
        case "while": {
          this.next();
          const test = this.parseExpr();
          return { k: "while", test, body: this.parseStmtBlock(), loc: t.loc };
        }
        case "return": {
          this.next();
          if (this.isPunct("}") || this.isPunct(";") || this.tok.newlineBefore || this.tok.kind === "eof" || this.atAttrBoundary()) {
            return { k: "return", loc: t.loc };
          }
          return { k: "return", value: this.parseExpr(), loc: t.loc };
        }
        case "break":
          this.next();
          return { k: "break", loc: t.loc };
        case "continue":
          this.next();
          return { k: "continue", loc: t.loc };
        default:
          break;
      }
    }
    const expr = this.parseExpr();
    return { k: "expr", expr, loc: t.loc };
  }

  parseExpr(): Expr {
    return this.parseAssign();
  }

  private parseAssign(): Expr {
    const arrow = this.tryParseArrow();
    if (arrow) return arrow;
    const left = this.parseTernary();
    const t = this.tok;
    if (t.kind === "punct" && ASSIGN_OPS.has(t.value)) {
      if (left.k !== "id" && left.k !== "member" && left.k !== "index") this.fail("Invalid assignment target", t, undefined, "E0103");
      this.next();
      const value = this.parseAssign();
      return { k: "assign", op: t.value as AssignOp, target: left, value, loc: left.loc };
    }
    return left;
  }

  private tryParseArrow(): Expr | undefined {
    const start = this.tok;
    const isAsync = this.isIdent("async") && (this.isPunct("(", 1) || (this.peek(1).kind === "ident" && this.isPunct("=>", 2)));
    const offset = isAsync ? 1 : 0;
    if (this.peek(offset).kind === "ident" && this.isPunct("=>", offset + 1)) {
      if (isAsync) this.next();
      const p = this.next();
      this.next();
      return { k: "arrow", params: [{ name: p.value, optional: false, rest: false, loc: p.loc }], body: this.parseArrowBody(), async: isAsync, loc: start.loc };
    }
    if (!this.isPunct("(", offset)) return undefined;
    let depth = 0;
    let i = offset;
    for (; i < 4096; i++) {
      const t = this.peek(i);
      if (t.kind === "eof") return undefined;
      if (t.kind === "punct" && (t.value === "(" || t.value === "[" || t.value === "{")) depth++;
      if (t.kind === "punct" && (t.value === ")" || t.value === "]" || t.value === "}")) depth--;
      if (depth === 0) break;
    }
    const after = this.peek(i + 1);
    const isArrow = after.kind === "punct" && (after.value === "=>" || (after.value === "->" && this.peek(i + 2).kind === "ident" && TYPE_NAMES.has(this.peek(i + 2).value)));
    if (!isArrow) return undefined;
    if (isAsync) this.next();
    const params = this.parseParams();
    if (this.eat("->")) {
      this.parseTypeRef();
      if (this.eat("=>")) return { k: "arrow", params, body: this.parseArrowBody(), async: isAsync, loc: start.loc };
      return { k: "arrow", params, body: this.parseStmtBlock(), async: isAsync, loc: start.loc };
    }
    this.expect("=>");
    return { k: "arrow", params, body: this.parseArrowBody(), async: isAsync, loc: start.loc };
  }

  private parseArrowBody(): Expr | Stmt[] {
    if (this.isPunct("{")) return this.parseStmtBlock();
    return this.parseAssign();
  }

  private parseTernary(): Expr {
    const test = this.parseNullish();
    if (this.isPunct("?")) {
      this.next();
      const then = this.parseAssign();
      this.expect(":", "in conditional expression");
      const otherwise = this.parseAssign();
      return { k: "cond", test, then, else: otherwise, loc: test.loc };
    }
    return test;
  }

  private binaryLevel(next: () => Expr, ops: Record<string, BinaryOp>, words: Record<string, BinaryOp> = {}): Expr {
    let left = next();
    for (;;) {
      const t = this.tok;
      let op: BinaryOp | undefined;
      if (t.kind === "punct") op = ops[t.value];
      else if (t.kind === "ident") op = words[t.value];
      if (!op) return left;
      this.next();
      const right = next();
      left = { k: "binary", op, left, right, loc: left.loc };
    }
  }

  private parseNullish(): Expr {
    return this.binaryLevel(() => this.parseOr(), { "??": "??" });
  }

  private parseOr(): Expr {
    return this.binaryLevel(() => this.parseAnd(), { "||": "||" }, { or: "||" });
  }

  private parseAnd(): Expr {
    return this.binaryLevel(() => this.parseEquality(), { "&&": "&&" }, { and: "&&" });
  }

  private parseEquality(): Expr {
    return this.binaryLevel(() => this.parseRelational(), { "==": "==", "!=": "!=" });
  }

  private parseRelational(): Expr {
    return this.binaryLevel(() => this.parseAdditive(), { "<": "<", ">": ">", "<=": "<=", ">=": ">=" });
  }

  private parseAdditive(): Expr {
    return this.binaryLevel(() => this.parseMultiplicative(), { "+": "+", "-": "-" });
  }

  private parseMultiplicative(): Expr {
    return this.binaryLevel(() => this.parseExponent(), { "*": "*", "/": "/", "%": "%" });
  }

  private parseExponent(): Expr {
    const base = this.parseUnary();
    if (this.isPunct("**")) {
      this.next();
      const exp = this.parseExponent();
      return { k: "binary", op: "**", left: base, right: exp, loc: base.loc };
    }
    return base;
  }

  private parseUnary(): Expr {
    const t = this.tok;
    if (t.kind === "punct" && (t.value === "!" || t.value === "-" || t.value === "+" || t.value === "~")) {
      this.next();
      return { k: "unary", op: t.value, arg: this.parseUnary(), loc: t.loc };
    }
    if (t.kind === "ident" && (t.value === "not" || t.value === "typeof" || t.value === "await")) {
      this.next();
      const op = t.value === "not" ? "!" : t.value;
      return { k: "unary", op, arg: this.parseUnary(), loc: t.loc };
    }
    if (this.isPunct("++")) {
      this.next();
      const target = this.parseUnary();
      return { k: "update", op: "++", prefix: true, target, loc: t.loc };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parseCallMember();
    if (this.isPunct("++") && this.sameLine()) {
      this.next();
      expr = { k: "update", op: "++", prefix: false, target: expr, loc: expr.loc };
    }
    return expr;
  }

  private parseArgs(): Arg[] {
    const args: Arg[] = [];
    this.expect("(");
    while (!this.isPunct(")") && this.tok.kind !== "eof") {
      const loc = this.tok.loc;
      if (this.eat("...")) {
        args.push({ value: this.parseExpr(), spread: true, loc });
      } else if (this.tok.kind === "ident" && this.isPunct(":", 1) && !this.isPunct(":", 2)) {
        const name = this.next().value;
        this.next();
        args.push({ name, value: this.parseExpr(), spread: false, loc });
      } else {
        args.push({ value: this.parseExpr(), spread: false, loc });
      }
      if (!this.eat(",")) break;
    }
    this.expect(")", "to close the argument list");
    return args;
  }

  private parseCallMember(): Expr {
    let expr: Expr;
    if (this.isIdent("new")) {
      const t = this.next();
      let callee: Expr = this.parsePrimary();
      while (this.isPunct(".")) {
        this.next();
        const prop = this.expectIdent("a property name");
        callee = { k: "member", object: callee, prop: prop.value, optional: false, loc: callee.loc };
      }
      const args = this.isPunct("(") ? this.parseArgs() : [];
      expr = { k: "new", callee, args, loc: t.loc };
    } else {
      expr = this.parsePrimary();
    }
    for (;;) {
      if (this.isPunct(".")) {
        this.next();
        const prop = this.tok;
        if (prop.kind !== "ident") this.fail(`Expected a property name after '.', found ${this.describe(prop)}`);
        this.next();
        expr = { k: "member", object: expr, prop: prop.value, optional: false, loc: expr.loc };
      } else if (this.isPunct("?.")) {
        this.next();
        if (this.isPunct("(")) {
          expr = { k: "call", callee: expr, args: this.parseArgs(), optional: true, memo: false, loc: expr.loc };
        } else if (this.isPunct("[")) {
          this.next();
          const index = this.parseExpr();
          this.expect("]");
          expr = { k: "index", object: expr, index, optional: true, loc: expr.loc };
        } else {
          const prop = this.expectIdent("a property name");
          expr = { k: "member", object: expr, prop: prop.value, optional: true, loc: expr.loc };
        }
      } else if (this.isPunct("(") && this.sameLine()) {
        let memo = false;
        let callee = expr;
        if (callee.k === "id" && callee.name.startsWith("$") && callee.name.length > 1 && callee.name !== "$slot") {
          memo = true;
          callee = { ...callee, name: callee.name.slice(1) };
        }
        expr = { k: "call", callee, args: this.parseArgs(), optional: false, memo, loc: expr.loc };
      } else if (this.isPunct("[") && this.sameLine()) {
        this.next();
        const index = this.parseExpr();
        this.expect("]");
        expr = { k: "index", object: expr, index, optional: false, loc: expr.loc };
      } else if (this.tok.kind === "template" && this.tok.quote === "`" && this.adjacent()) {
        this.fail("Tagged templates are not supported");
      } else {
        return expr;
      }
    }
  }

  private parsePrimary(): Expr {
    const t = this.tok;
    switch (t.kind) {
      case "number":
        this.next();
        return { k: "lit", value: Number(t.value), loc: t.loc };
      case "string":
        this.next();
        return { k: "lit", value: t.value, loc: t.loc };
      case "template":
        this.next();
        return this.parseTemplate(t);
      case "ident":
        this.next();
        if (t.value === "true" || t.value === "false") return { k: "lit", value: t.value === "true", loc: t.loc };
        if (t.value === "null" || t.value === "undefined") return { k: "lit", value: null, loc: t.loc };
        return { k: "id", name: t.value, loc: t.loc };
      case "punct":
        if (t.value === "(") {
          this.next();
          const inner = this.parseExpr();
          this.expect(")", "to close the parenthesized expression");
          return inner;
        }
        if (t.value === "[") return this.parseArray();
        if (t.value === "{") return this.parseObject();
        break;
      default:
        break;
    }
    return this.fail(`Expected an expression, found ${this.describe(t)}`);
  }

  private parseArray(): Expr {
    const start = this.next();
    const items: ArrayItem[] = [];
    while (!this.isPunct("]") && this.tok.kind !== "eof") {
      const spread = this.eat("...");
      items.push({ value: this.parseExpr(), spread });
      if (!this.eat(",") && !this.tok.newlineBefore) break;
    }
    this.expect("]", "to close the array");
    return { k: "array", items, loc: start.loc };
  }

  private parseObject(): Expr {
    const start = this.next();
    const props: ObjectProp[] = [];
    while (!this.isPunct("}") && this.tok.kind !== "eof") {
      const loc = this.tok.loc;
      if (this.eat("...")) {
        props.push({ key: "", value: this.parseExpr(), spread: true, loc });
      } else if (this.isPunct("[")) {
        this.next();
        const computedKey = this.parseExpr();
        this.expect("]");
        this.expect(":");
        props.push({ key: "", computedKey, value: this.parseExpr(), spread: false, loc });
      } else {
        const k = this.tok;
        if (k.kind !== "ident" && k.kind !== "string" && k.kind !== "number") this.fail(`Expected an object key, found ${this.describe(k)}`);
        this.next();
        let key = k.value;
        while (k.kind === "ident" && this.isPunct("-") && this.adjacent() && this.peek(1).kind === "ident") {
          this.next();
          key += "-" + this.next().value;
        }
        if (this.eat(":")) props.push({ key, value: this.parseExpr(), spread: false, loc });
        else if (k.kind === "ident") props.push({ key, value: { k: "id", name: key, loc: k.loc }, spread: false, loc });
        else this.fail("Expected ':' after object key");
      }
      if (!this.eat(",") && !this.eat(";") && !this.tok.newlineBefore) break;
    }
    this.expect("}", "to close the object");
    return { k: "object", props, loc: start.loc };
  }

  private parseTemplate(t: Token): Expr {
    const parts: (string | Expr)[] = [];
    const raw = t.value;
    let buf = "";
    let i = 0;
    while (i < raw.length) {
      const c = raw[i];
      if (c === "\\" && (raw[i + 1] === "{" || raw[i + 1] === "}")) {
        buf += raw[i + 1];
        i += 2;
        continue;
      }
      if (c === "{") {
        let depth = 1;
        let j = i + 1;
        let quote = "";
        for (; j < raw.length; j++) {
          const ch = raw[j];
          if (quote) {
            if (ch === "\\") j++;
            else if (ch === quote) quote = "";
            continue;
          }
          if (ch === '"' || ch === "'") quote = ch;
          else if (ch === "{") depth++;
          else if (ch === "}" && --depth === 0) break;
        }
        if (depth !== 0) this.fail("Unmatched '{' in formatted string", t, "Escape literal braces as \\{ and \\}");
        const inner = raw.slice(i + 1, j);
        if (buf) parts.push(buf);
        buf = "";
        const sub = Parser.fromTokens(tokenize(inner, this.file, { ...t.loc, col: t.loc.col + 2 + i }), this.file);
        const e = sub.parseExpr();
        if (sub.tok.kind !== "eof") sub.fail(`Unexpected ${sub.describe(sub.tok)} inside formatted string`);
        parts.push(e);
        i = j + 1;
        continue;
      }
      buf += c;
      i++;
    }
    if (buf) parts.push(buf);
    if (parts.every(p => typeof p === "string")) return { k: "lit", value: parts.join(""), loc: t.loc };
    return { k: "tpl", parts, loc: t.loc };
  }
}

function emptyOwner(): BodyOwner {
  return { vars: [], functions: [], styles: [], scripts: [], lifecycle: [], watchers: [] };
}

export function isStatementExpr(expr: Expr): boolean {
  if (expr.k === "assign" || expr.k === "update") return true;
  if (expr.k === "unary" && expr.op === "await") return true;
  if (expr.k === "call") {
    const root = calleeRoot(expr.callee);
    return root === "console" || root === "alert" || root === "localStorage" || root === "sessionStorage" || root === "history";
  }
  return false;
}

function calleeRoot(e: Expr): string | undefined {
  if (e.k === "id") return e.name;
  if (e.k === "member") return calleeRoot(e.object);
  return undefined;
}

export function classifyImport(source: string): ImportKind {
  const clean = source.split(/[?#]/)[0].toLowerCase();
  if (/\.(css|scss|sass)$/.test(clean)) return "style";
  if (clean.endsWith(".sinth")) return "sinth";
  if (clean.endsWith(".json")) return "json";
  if (/^https?:\/\//.test(clean) || clean.startsWith("//")) return "script";
  if (/\.(m?js|ts|mts|jsx|tsx)$/.test(clean)) return "module";
  if (clean.startsWith("sinth:")) return "sinth";
  if (clean.startsWith(".") || clean.startsWith("/")) return "sinth";
  return "module";
}

export function parseSinth(source: string, file: string): SinthFile {
  return new Parser(source, file).parseFile();
}
