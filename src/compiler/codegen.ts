import {
  Arg, Attr, ComponentDecl, ElementNode, Expr, ForNode, FunctionDecl, IfNode, ImportDecl, Node, Param, SinthFile, Stmt,
  TypeRef, VarDecl,
} from "./ast";
import { DiagnosticBag, levenshtein, Loc, SinthError, suggest } from "./diagnostics";
import { attrNameToHtml, BOOLEAN_ATTRS, ELEMENTS, INLINE_STYLE_PROPS, SPECIAL_ELEMENTS, VOID_TAGS } from "./elements";
import { JS_GLOBALS, RUNTIME_GLOBALS } from "./globals";
import { isStatementExpr, Parser } from "./parser";
import { tokenize } from "./lexer";
import { analyzeScript } from "./script-analysis";
import { compileStyle, ScssCompiler } from "./style";
import { escapeAttr, escapeHtml, hashString } from "./html";

export interface ComponentSig {
  name: string;
  params: Param[];
  customTag?: string;
}

export interface FunctionSig {
  name: string;
  params: Param[];
  returnType?: TypeRef;
  ui: boolean;
}

export interface VarSig {
  name: string;
  kind: VarDecl["kind"];
  type?: TypeRef;
}

export interface ModuleExports {
  components: Map<string, ComponentSig>;
  functions: Map<string, FunctionSig>;
  vars: Map<string, VarSig>;
  defaultComponent?: string;
}

export interface ResolvedImport {
  decl: ImportDecl;
  kind: "sinth" | "style" | "module" | "script" | "font" | "json";
  specifier: string;
  exports?: ModuleExports;
  json?: unknown;
}

export interface CodegenOptions {
  runtime: string;
  dev: boolean;
  scss?: ScssCompiler;
  persistPrefix: string;
}

export interface InteractivityInfo {
  interactive: boolean;
  uses: string[];
}

export interface ModuleOutput {
  js: string;
  css: string;
  exports: ModuleExports;
  interactive: boolean;
  base: boolean;
  components: Record<string, InteractivityInfo>;
  page?: InteractivityInfo;
  usesState: boolean;
  diagnostics: DiagnosticBag;
}

type BindingKind = "local" | "loop" | "param" | "state" | "computed" | "const" | "function" | "component" | "global" | "import";

interface Binding {
  kind: BindingKind;
  js: string;
  type?: TypeRef;
  fn?: FunctionSig;
  comp?: ComponentSig;
  defaultValue?: Expr;
  bindable?: boolean;
  ref?: string;
  loc?: Loc;
}

class Scope {
  private readonly names = new Map<string, Binding>();

  constructor(readonly parent: Scope | null, readonly kind: "module" | "component" | "function" | "block" | "loop" = "block") {}

  define(name: string, b: Binding): void {
    this.names.set(name, b);
  }

  has(name: string): boolean {
    return this.names.has(name);
  }

  lookup(name: string): Binding | undefined {
    return this.names.get(name) ?? this.parent?.lookup(name);
  }

  all(): string[] {
    const out = new Set(this.names.keys());
    if (this.parent) for (const n of this.parent.all()) out.add(n);
    return [...out];
  }

  inComponent(): boolean {
    return this.kind === "component" || !!this.parent?.inComponent();
  }
}

const T = (base: TypeRef["base"], array = 0): TypeRef => ({ base, array, nullable: false });

function typeName(t: TypeRef): string {
  return t.base + "[]".repeat(t.array) + (t.nullable ? "?" : "");
}

function sameKind(a: TypeRef, b: TypeRef): boolean {
  const norm = (t: TypeRef): string => (t.base === "int" ? "num" : t.base);
  if (a.base === "any" || b.base === "any") return true;
  if (a.array !== b.array) return a.base === "obj" && a.array === 0 && b.array > 0;
  if (norm(a) === norm(b)) return true;
  if (a.base === "obj" && b.base === "obj") return true;
  if (a.base === "fn" || b.base === "fn") return a.base === b.base;
  return false;
}

export function collectExports(file: SinthFile): ModuleExports {
  const exports: ModuleExports = { components: new Map(), functions: new Map(), vars: new Map() };
  for (const c of file.components) {
    if (c.exported) exports.components.set(c.name, { name: c.name, params: c.params, customTag: c.customTag });
  }
  for (const f of file.functions) {
    exports.functions.set(f.name, { name: f.name, params: f.params, returnType: f.returnType, ui: f.returnType?.base === "ui" });
  }
  for (const v of file.vars) exports.vars.set(v.name, { name: v.name, kind: v.kind, type: v.type ?? undefined });
  const base = file.path.replace(/\\/g, "/").split("/").pop()?.replace(/\.sinth$/, "") ?? "";
  const named = file.components.find(c => c.name === base || c.name.toLowerCase() === base.toLowerCase());
  exports.defaultComponent = named?.name ?? (file.components.length === 1 ? file.components[0].name : undefined);
  return exports;
}

const EVENT_NAME_MAP: Record<string, string> = { doubleclick: "dblclick", dblclick: "dblclick" };

function eventName(attr: string): string {
  const raw = attr.slice(2).toLowerCase();
  return EVENT_NAME_MAP[raw] ?? raw;
}

const SIZE_ATTR_TAGS = new Set(["img", "video", "canvas", "iframe", "svg", "embed", "object", "source", "input", "rect", "image", "td", "th", "col", "table"]);
const DIRECTIVE_ATTRS = new Set(["model", "bind", "ref", "hide", "show", "html", "delay", "key", "..."]);
const PROP_ATTRS = new Set(["value", "checked", "selected", "indeterminate", "muted", "volume", "currentTime"]);

interface RenderCtx {
  scope: Scope;
  comp?: ComponentDecl;
  scopeClass?: string;
  slotsVar?: string;
  svg: boolean;
  rootHook?: (roots: string[]) => string;
}

export class ModuleCompiler {
  private readonly out: string[] = [];
  private readonly css: string[] = [];
  private uid = 0;
  private interactive = false;
  private uses = new Set<string>();
  private readonly componentInfo: Record<string, InteractivityInfo> = {};
  private usesState = false;
  readonly diagnostics = new DiagnosticBag();
  private readonly moduleScope = new Scope(null, "module");
  private readonly importLines: string[] = [];
  private readonly exportsInfo: ModuleExports;
  private readonly fileHash: string;
  private readonly pageCssVars: [string, Expr][] = [];

  constructor(private readonly file: SinthFile, private readonly imports: ResolvedImport[], private readonly opts: CodegenOptions) {
    this.exportsInfo = collectExports(file);
    this.fileHash = hashString(file.path.replace(/\\/g, "/")).slice(0, 6);
  }

  private id(prefix: string): string {
    return `$$${prefix}${++this.uid}`;
  }

  private fail(code: string, message: string, loc?: Loc, hint?: string): never {
    throw new SinthError(code, message, loc, hint);
  }

  compile(): ModuleOutput {
    const file = this.file;
    this.importLines.push(`import * as $$ from ${JSON.stringify(this.opts.runtime)};`);
    this.declareImports();
    for (const ext of file.externs) this.moduleScope.define(ext.name, { kind: "global", js: ext.name });
    for (const c of file.components) this.defineComponent(this.moduleScope, c.name, c.name, { name: c.name, params: c.params, customTag: c.customTag }, `${file.path}#${c.name}`, c.loc);
    for (const f of file.functions) {
      this.moduleScope.define(f.name, { kind: "function", js: f.name, fn: { name: f.name, params: f.params, returnType: f.returnType, ui: f.returnType?.base === "ui" }, loc: f.loc });
    }
    const scriptNames: string[] = [];
    for (const s of file.scripts) scriptNames.push(...analyzeScript(s.raw, s.loc, false).declared);
    for (const n of scriptNames) if (!this.moduleScope.has(n)) this.moduleScope.define(n, { kind: "global", js: n });
    if (file.scripts.length) this.interactive = true;

    const body: string[] = [];
    for (const v of file.vars) {
      this.checkDuplicate(this.moduleScope, v.name, v.loc);
      body.push(this.genVarDecl(v, this.moduleScope, true));
    }
    for (const s of file.scripts) body.push(s.raw.trim());
    for (const f of file.functions) body.push("export " + this.genFunction(f, this.moduleScope));
    const base = this.interactive;
    for (const c of file.components) {
      this.interactive = false;
      this.uses = new Set();
      body.push(this.genComponent(c));
      this.componentInfo[c.name] = { interactive: this.interactive, uses: [...this.uses] };
    }
    this.interactive = false;
    this.uses = new Set();


    const stateVars = file.vars.filter(v => v.kind === "var");
    if (file.vars.length) {
      const accessors = file.vars.map(v => v.kind === "computed"
        ? `get ${v.name}() { return ${v.name}(); }`
        : v.kind === "const"
          ? `get ${v.name}() { return ${v.name}; }`
          : `get ${v.name}() { return ${v.name}; }, set ${v.name}($$v) { ${v.name} = $$v; }`);
      body.push(`export const $$vars = { ${accessors.join(", ")} };`);
    }

    if (file.isPage) {
      const ctx: RenderCtx = { scope: new Scope(this.moduleScope, "function"), svg: false };
      const renderBody: string[] = [];
      for (const v of stateVars) if (v.persist) renderBody.push(`$$.persist(${JSON.stringify(this.persistKey(v.name))}, () => ${v.name});`);
      renderBody.push(...this.genLifecycle(file.lifecycle, file.watchers, ctx.scope));
      renderBody.push(this.genNodes(file.body, "$$root", ctx));
      body.push(`export function render($$root) {\n${indent(renderBody.filter(Boolean).join("\n"))}\n}`);
      body.push(`export function state() { return { ${stateVars.map(v => `${JSON.stringify(v.name)}: ${v.name}`).join(", ")} }; }`);
      const restore = stateVars.map(v => `if (${JSON.stringify(v.name)} in $$s) ${v.name} = $$s[${JSON.stringify(v.name)}];`);
      body.push(`export function restore($$s) {${restore.length ? "\n" + indent(restore.join("\n")) + "\n" : " "}}`);
      if (stateVars.length || file.lifecycle.length || file.watchers.length) this.usesState = true;
      if (stateVars.some(v => v.persist) || file.lifecycle.length || file.watchers.length) this.interactive = true;
    } else if (file.body.length) {
      const first = file.body[0];
      this.diagnostics.warn("W0101", "Markup outside a component in a non-page file is ignored", first.loc, "Add 'page' at the top of the file, or wrap the markup in a component");
    }

    for (const c of file.components) {
      if (!c.customTag) continue;
      const params = c.params.map(p => `[${JSON.stringify(p.name)}, ${JSON.stringify(p.type ? typeName(p.type) : "str")}]`).join(", ");
      body.push(`$$.defineElement(${JSON.stringify(c.customTag)}, ${c.name}, [${params}]);`);
      this.interactive = true;
    }

    const pageInfo: InteractivityInfo | undefined = file.isPage ? { interactive: this.interactive, uses: [...this.uses] } : undefined;
    let moduleBase = base;
    for (const s of file.styles) {
      this.interactive = false;
      this.addStyle(s, undefined, this.moduleScope, file.isPage ? "page" : "module");
      if (this.interactive) moduleBase = true;
    }
    if (file.components.some(c => c.customTag)) moduleBase = true;
    if (this.css.length) this.importLines.push(`import ${JSON.stringify("sinth-css:" + this.file.path)};`);
    const js = [...this.importLines, "", ...body].join("\n") + "\n";
    const anyInteractive = moduleBase || !!pageInfo?.interactive || Object.values(this.componentInfo).some(i => i.interactive);
    return {
      js, css: this.css.join("\n\n"), exports: this.exportsInfo, interactive: anyInteractive, base: moduleBase,
      components: this.componentInfo, page: pageInfo, usesState: this.usesState, diagnostics: this.diagnostics,
    };
  }

  private persistKey(name: string): string {
    return `${this.opts.persistPrefix}:${name}`;
  }

  private checkDuplicate(scope: Scope, name: string, loc: Loc): void {
    if (scope.has(name)) this.fail("E0202", `'${name}' is already declared in this scope`, loc);
  }

  private defineComponent(scope: Scope, name: string, js: string, sig: ComponentSig, ref: string, loc?: Loc): void {
    scope.define(name, { kind: "component", js, comp: sig, ref, loc });
  }

  private declareImports(): void {
    let n = 0;
    for (const imp of this.imports) {
      const d = imp.decl;
      const spec = JSON.stringify(imp.specifier);
      switch (imp.kind) {
        case "style":
          if (!/^(https?:)?\/\//.test(imp.specifier)) this.importLines.push(`import ${spec};`);
          break;
        case "script":
        case "font":
          if (d.namespace) this.moduleScope.define(d.namespace, { kind: "global", js: d.namespace });
          for (const s of d.named) this.moduleScope.define(s.alias, { kind: "global", js: s.alias });
          break;
        case "json": {
          const name = d.defaultName ?? d.namespace;
          if (name) {
            this.importLines.push(`const ${name} = ${JSON.stringify(imp.json)};`);
            this.moduleScope.define(name, { kind: "const", js: name, type: T(Array.isArray(imp.json) ? "obj" : "obj") });
          } else if (d.named.length) {
            const data = (imp.json ?? {}) as Record<string, unknown>;
            for (const s of d.named) {
              if (!(s.name in data)) this.fail("E0603", `'${s.name}' does not exist in ${d.source}`, s.loc);
              this.importLines.push(`const ${s.alias} = ${JSON.stringify(data[s.name])};`);
              this.moduleScope.define(s.alias, { kind: "const", js: s.alias });
            }
          }
          break;
        }
        case "module": {
          this.interactive = true;
          const parts: string[] = [];
          if (d.defaultName) parts.push(d.defaultName);
          if (d.namespace) parts.push(`* as ${d.namespace}`);
          if (d.named.length) parts.push(`{ ${d.named.map(s => (s.name === s.alias ? s.name : `${s.name} as ${s.alias}`)).join(", ")} }`);
          this.importLines.push(parts.length ? `import ${parts.join(", ")} from ${spec};` : `import ${spec};`);
          for (const name of [d.defaultName, d.namespace, ...d.named.map(s => s.alias)]) {
            if (name) this.moduleScope.define(name, { kind: "import", js: name });
          }
          break;
        }
        case "sinth": {
          const ex = imp.exports;
          if (!ex) break;
          const ns = `$$m${++n}`;
          this.importLines.push(`import * as ${ns} from ${spec};`);
          const bindAll = d.sideEffect || (!d.named.length && !d.defaultName && !d.namespace);
          const bindName = (name: string, alias: string, loc: Loc): void => {
            const comp = ex.components.get(name);
            const fn = ex.functions.get(name);
            const v = ex.vars.get(name);
            if (comp) this.defineComponent(this.moduleScope, alias, `${ns}.${name}`, comp, `${imp.specifier}#${name}`, loc);
            else if (fn) this.moduleScope.define(alias, { kind: "function", js: `${ns}.${name}`, fn });
            else if (v) {
              const kind: BindingKind = v.kind === "computed" ? "computed" : v.kind === "const" ? "const" : "state";
              this.moduleScope.define(alias, { kind, js: `${ns}.$$vars.${name}`, type: v.type });
            } else {
              const all = [...ex.components.keys(), ...ex.functions.keys(), ...ex.vars.keys()];
              const s = suggest(name, all);
              this.fail("E0602", `'${d.source}' has no export named '${name}'`, loc, s ? `Did you mean '${s}'?` : all.length ? `Available: ${all.join(", ")}` : undefined);
            }
          };
          if (bindAll) {
            for (const name of ex.components.keys()) bindName(name, name, d.loc);
          }
          if (d.defaultName) {
            if (!ex.defaultComponent) this.fail("E0604", `'${d.source}' has no default component`, d.loc, "Name the component like the file, or use: import { Name } from \"...\"");
            bindName(ex.defaultComponent, d.defaultName, d.loc);
          }
          if (d.namespace) this.moduleScope.define(d.namespace, { kind: "global", js: ns, comp: undefined });
          for (const s of d.named) bindName(s.name, s.alias, s.loc);
          break;
        }
      }
    }
  }

  private resolveNamespacedComponent(name: string): Binding | undefined {
    const [ns, member] = name.split(".");
    if (!member) return undefined;
    const imp = this.imports.find(i => i.kind === "sinth" && i.decl.namespace === ns);
    const nsBinding = this.moduleScope.lookup(ns);
    const sig = imp?.exports?.components.get(member);
    if (!sig || !nsBinding) return undefined;
    return { kind: "component", js: `${nsBinding.js}.${member}`, comp: sig, ref: `${imp?.specifier}#${member}` };
  }

  private genVarDecl(v: VarDecl, scope: Scope, moduleLevel: boolean): string {
    const type = v.type ?? (v.init ? this.inferType(v.init, scope) : undefined);
    if (v.type?.base === "int") {
      this.diagnostics.warn("W0201", "'int' is deprecated; use 'num'", v.loc);
    }
    if (v.type && v.init) this.checkAssignable(v.type, v.init, scope, v.loc, `'${v.name}'`);
    let init = v.init ? this.expr(v.init, scope) : defaultFor(v.type);
    let line: string;
    if (v.kind === "computed") {
      line = `const ${v.name} = () => ${init};`;
      scope.define(v.name, { kind: "computed", js: `${v.name}()`, type });
    } else if (v.kind === "const") {
      line = `const ${v.name} = ${init};`;
      scope.define(v.name, { kind: "const", js: v.name, type });
    } else {
      if (v.persist) {
        if (!moduleLevel && !scope.inComponent()) this.fail("E0210", "'persist' is only allowed on page or component variables", v.loc);
        init = `$$.persisted(${JSON.stringify(this.persistKey(v.name))}, ${init})`;
        this.interactive = true;
      }
      line = `let ${v.name} = ${init};`;
      scope.define(v.name, { kind: moduleLevel ? "state" : "local", js: v.name, type });
    }
    return line;
  }

  private genFunction(f: FunctionDecl, parent: Scope): string {
    const scope = new Scope(parent, "function");
    const params = this.genParams(f.params, scope);
    if (f.view) {
      const ctx: RenderCtx = { scope, svg: false, scopeClass: undefined };
      const locals = f.body.map(s => this.stmt(s, scope)).join("\n");
      const view = this.genNodes(f.view, "$$parent", ctx);
      return `function ${f.name}($$parent${params ? ", " + params : ""}) {\n${indent([locals, view].filter(Boolean).join("\n"))}\n}`;
    }
    const body = this.stmts(f.body, scope, f.returnType);
    return `${f.async || containsAwait(f.body) ? "async " : ""}function ${f.name}(${params}) {\n${indent(body)}\n}`;
  }

  private genParams(params: Param[], scope: Scope): string {
    return params.map(p => {
      scope.define(p.name, { kind: "local", js: p.name, type: p.type });
      if (p.rest) return `...${p.name}`;
      return p.defaultValue ? `${p.name} = ${this.expr(p.defaultValue, scope)}` : p.name;
    }).join(", ");
  }

  private genComponent(c: ComponentDecl): string {
    const scope = new Scope(this.moduleScope, "component");
    const scopeClass = `s-${hashString(this.file.path.replace(/\\/g, "/") + "#" + c.name).slice(0, 7)}`;
    for (const p of c.params) {
      this.checkDuplicate(scope, p.name, p.loc);
      scope.define(p.name, { kind: "param", js: `$$p.${p.name}`, type: p.type, defaultValue: p.defaultValue, bindable: p.bindable });
    }
    const lines: string[] = [];
    for (const v of c.vars) {
      this.checkDuplicate(scope, v.name, v.loc);
      lines.push(this.genVarDecl(v, scope, false));
      if (v.persist) lines.push(`$$.persist(${JSON.stringify(this.persistKey(c.name + "." + v.name))}, () => ${v.name});`);
    }
    for (const f of c.functions) {
      scope.define(f.name, { kind: "function", js: f.name, fn: { name: f.name, params: f.params, returnType: f.returnType, ui: f.returnType?.base === "ui" } });
    }
    for (const s of c.scripts) {
      const info = analyzeScript(s.raw, s.loc, true);
      if (info.hasImports) this.fail("E0501", "Component script blocks cannot contain 'import' statements", s.loc, "Use a top-level 'import' in the .sinth file instead");
      for (const n of info.declared) if (!scope.has(n)) scope.define(n, { kind: "local", js: n });
      this.interactive = true;
    }
    for (const f of c.functions) lines.push(this.genFunction(f, scope));
    for (const s of c.scripts) lines.push(s.raw.trim());
    if (c.lifecycle.length || c.watchers.length) this.interactive = true;
    lines.push(...this.genLifecycle(c.lifecycle, c.watchers, scope));

    const styleVars: Record<string, Expr> = {};
    for (const s of c.styles) Object.assign(styleVars, this.addStyle(s, s.global ? undefined : scopeClass, scope, c.name));

    const varEntries = Object.entries(styleVars);
    const rootHook = (roots: string[]): string => {
      const out: string[] = [];
      if (roots[0]) out.push(`if ($$a) $$a(${roots[0]});`);
      if (varEntries.length && roots.length) {
        out.push(`$$.cssVars([${roots.join(", ")}], { ${varEntries.map(([k, e]) => `${JSON.stringify(k)}: () => ${this.expr(e, scope)}`).join(", ")} });`);
      }
      return out.join("\n");
    };
    const ctx: RenderCtx = { scope, comp: c, scopeClass, slotsVar: "$$s", svg: false, rootHook };
    const roots: string[] = [];
    lines.push(this.genNodes(c.body, "$$parent", ctx, roots));
    lines.push(rootHook(roots));
    return `export function ${c.name}($$parent, $$p, $$s, $$a) {\n${indent(lines.filter(Boolean).join("\n"))}\n}`;
  }

  private genLifecycle(lifecycle: ComponentDecl["lifecycle"], watchers: ComponentDecl["watchers"], scope: Scope): string[] {
    const out: string[] = [];
    for (const l of lifecycle) {
      const inner = new Scope(scope, "function");
      const body = this.stmts(l.body, inner);
      const asyncKw = containsAwait(l.body) ? "async " : "";
      out.push(l.kind === "mount" ? `$$.onMount(${asyncKw}() => {\n${indent(body)}\n});` : `$$.onDestroy(() => {\n${indent(body)}\n});`);
    }
    for (const w of watchers) {
      const inner = new Scope(scope, "function");
      inner.define("value", { kind: "local", js: "value" });
      inner.define("previous", { kind: "local", js: "previous" });
      const asyncKw = containsAwait(w.body) ? "async " : "";
      out.push(`$$.watch(() => ${this.expr(w.expr, scope)}, ${asyncKw}(value, previous) => {\n${indent(this.stmts(w.body, inner))}\n});`);
    }
    return out;
  }

  private addStyle(s: SinthFile["styles"][number], scopeClass: string | undefined, scope: Scope, label: string): Record<string, Expr> {
    const reactiveNames = new Set(scope.all().filter(n => {
      const b = scope.lookup(n);
      return b && (b.kind === "param" || b.kind === "state" || b.kind === "computed" || b.kind === "local" || b.kind === "const");
    }));
    const varPrefix = `--sv-${hashString(this.file.path + label).slice(0, 5)}-`;
    const result = compileStyle(s.raw, s.lang, { scope: scopeClass, reactiveNames, varPrefix, loc: s.loc, sinthSyntax: s.lang === "sinth" }, this.opts.scss);
    if (result.css.trim()) this.css.push(`/* ${label} */\n${result.css}`);
    const vars: Record<string, Expr> = {};
    for (const e of result.expressions) {
      const sub = parseInlineExpr(e.source, { file: s.loc.file, line: e.line, col: 1 });
      this.expr(sub, scope);
      vars[e.cssVar] = sub;
    }
    if (result.expressions.length && !scopeClass) {
      this.interactive = true;
      if (scope === this.moduleScope) this.pageCssVars.push(...Object.entries(vars));
    }
    return vars;
  }

  private genNodes(nodes: Node[], parent: string, ctx: RenderCtx, roots?: string[]): string {
    const out: string[] = [];
    if (this.pageCssVars.length && parent === "$$root") {
      out.push(`$$.cssVars([document.documentElement], { ${this.pageCssVars.map(([k, e]) => `${JSON.stringify(k)}: () => ${this.expr(e, ctx.scope)}`).join(", ")} });`);
    }
    for (const node of nodes) out.push(this.genNode(node, parent, ctx, roots));
    return out.filter(Boolean).join("\n");
  }

  private genNode(node: Node, parent: string, ctx: RenderCtx, roots?: string[]): string {
    switch (node.k) {
      case "text":
        return this.genText(node.expr, parent, ctx);
      case "element":
        return this.genElement(node, parent, ctx, roots);
      case "if":
        return this.genIf(node, parent, ctx, !!roots);
      case "for":
        return this.genFor(node, parent, ctx, !!roots);
      case "slot": {
        if (!ctx.slotsVar) this.fail("E0310", "'$slot' can only be used inside a component", node.loc);
        const fb = node.fallback.length ? `, ($$f) => {\n${indent(this.genNodes(node.fallback, "$$f", ctx))}\n}` : "";
        return `$$.slot(${parent}, ${ctx.slotsVar}, ${JSON.stringify(node.name)}${fb});`;
      }
      case "stmt":
            return this.stmt(node.stmt, ctx.scope);
      case "var":
        this.checkDuplicate(ctx.scope, node.decl.name, node.loc);
        return this.genVarDecl(node.decl, ctx.scope, false);
    }
  }

  private genText(expr: Expr, parent: string, ctx: RenderCtx): string {
    if (expr.k === "lit") return expr.value === null ? "" : `${parent}.append(${JSON.stringify(String(expr.value))});`;
    if (expr.k === "call") {
      const b = this.calleeBinding(expr.callee, ctx.scope);
      if (b?.fn?.ui) return this.genUiCall(expr, b, parent, ctx);
    }
    const js = this.expr(expr, ctx.scope);
    if (this.isConstantExpr(expr, ctx.scope)) return `${parent}.append($$.toText(${js}));`;
    return `$$.text(${parent}, () => ${js});`;
  }

  private genUiCall(expr: Extract<Expr, { k: "call" }>, b: Binding, parent: string, ctx: RenderCtx): string {
    const fn = b.fn as FunctionSig;
    const args = this.genCallArgs(expr.args, fn, ctx.scope, expr.loc);
    return `${b.js}(${parent}${args ? ", " + args : ""});`;
  }

  private isConstantExpr(expr: Expr, scope: Scope): boolean {
    switch (expr.k) {
      case "lit": return true;
      case "id": {
        const b = scope.lookup(expr.name);
        return b?.kind === "const" && !b.js.includes(".");
      }
      case "binary": return this.isConstantExpr(expr.left, scope) && this.isConstantExpr(expr.right, scope);
      case "unary": return expr.op !== "await" && this.isConstantExpr(expr.arg, scope);
      case "tpl": return expr.parts.every(p => typeof p === "string" || this.isConstantExpr(p, scope));
      case "cond": return this.isConstantExpr(expr.test, scope) && this.isConstantExpr(expr.then, scope) && this.isConstantExpr(expr.else, scope);
      default: return false;
    }
  }

  private isStaticNode(node: Node, ctx: RenderCtx): boolean {
    if (node.k === "text") return node.expr.k === "lit";
    if (node.k !== "element") return false;
    if (SPECIAL_ELEMENTS.has(node.name)) return false;
    if (!ELEMENTS[node.name] || (ctx.scope.lookup(node.name)?.kind === "component" && ctx.comp?.name !== node.name)) return false;
    if (node.slots.length) return false;
    for (const a of node.attrs) {
      if (a.handler || a.name === "..." || a.name === "model" || a.name === "bind" || a.name === "ref" || a.name === "hide" || a.name === "show" || a.name === "html" || a.name === "delay") return false;
      if (a.value && !(a.value.k === "lit" || (a.name === "style" && isLiteralObject(a.value)))) return false;
      if (a.name === "level" && a.value && a.value.k !== "lit") return false;
    }
    return node.children.every(c => this.isStaticNode(c, ctx));
  }

  private staticHtml(node: Node, ctx: RenderCtx): string {
    if (node.k === "text") return node.expr.k === "lit" && node.expr.value !== null ? escapeHtml(String(node.expr.value)) : "";
    if (node.k !== "element") return "";
    const { tag, attrs } = this.elementShape(node, ctx);
    const attrStr = Object.entries(attrs).map(([k, v]) => (v === "" && BOOLEAN_ATTRS.has(k) ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`)).join("");
    if (VOID_TAGS.has(tag)) return `<${tag}${attrStr}>`;
    return `<${tag}${attrStr}>${node.children.map(c => this.staticHtml(c, ctx)).join("")}</${tag}>`;
  }

  private headingTag(node: ElementNode): string {
    const level = node.attrs.find(a => a.name === "level");
    if (!level || !level.value) return ELEMENTS[node.name]?.tag ?? "h1";
    if (level.value.k !== "lit" || typeof level.value.value !== "number") this.fail("E0320", "Heading 'level' must be a number literal from 1 to 6", level.loc);
    const n = level.value.value;
    if (!Number.isInteger(n) || n < 1 || n > 6) this.fail("E0320", `Heading level must be between 1 and 6, got ${n}`, level.loc);
    return `h${n}`;
  }

  private elementShape(node: ElementNode, ctx: RenderCtx): { tag: string; attrs: Record<string, string>; svg: boolean } {
    const info = ELEMENTS[node.name];
    const tag = node.name === "Heading" ? this.headingTag(node) : info.tag;
    const attrs: Record<string, string> = { ...(info.attrs ?? {}) };
    const classes: string[] = [];
    if (info.className) classes.push(info.className);
    if (ctx.scopeClass) classes.push(ctx.scopeClass);
    const styles: string[] = [];
    for (const a of node.attrs) {
      if (a.name === "level" && node.name === "Heading") continue;
      if (a.handler || DIRECTIVE_ATTRS.has(a.name)) continue;
      if (/^on[a-z]+$/.test(a.name)) {
        this.fail("E0334", `Inline event attribute '${a.name}' is not allowed`, a.loc, `Use '${"on" + a.name[2].toUpperCase() + a.name.slice(3)}: ...' with a Sinth handler instead`);
      }
      if (a.value === null) {
        attrs[attrNameToHtml(a.name)] = "";
        continue;
      }
      if (a.name === "class" && a.value.k === "lit") {
        if (a.value.value) classes.push(String(a.value.value));
        continue;
      }
      if (a.name === "style" && isLiteralObject(a.value)) {
        styles.push(literalObjectToCss(a.value));
        continue;
      }
      if (a.value.k !== "lit") continue;
      if (this.isStyleProp(a.name, tag)) {
        if (a.value.value !== null && a.value.value !== false) styles.push(`${kebabCss(a.name)}: ${a.value.value}`);
        continue;
      }
      const v = a.value.value;
      if (v === false || v === null) continue;
      attrs[attrNameToHtml(a.name)] = v === true ? "" : String(v);
    }
    if (classes.length) attrs.class = classes.join(" ");
    if (styles.length) attrs.style = [attrs.style, ...styles].filter(Boolean).join("; ");
    return { tag, attrs, svg: !!info.svg };
  }

  private isStyleProp(name: string, tag: string): boolean {
    if (!INLINE_STYLE_PROPS.has(name)) return false;
    if ((name === "width" || name === "height") && SIZE_ATTR_TAGS.has(tag)) return false;
    return true;
  }

  private genElement(node: ElementNode, parent: string, ctx: RenderCtx, roots?: string[]): string {
    const binding = node.name.includes(".") ? this.resolveNamespacedComponent(node.name) : ctx.scope.lookup(node.name);
    const selfWrapsBuiltin = ctx.comp?.name === node.name && !!ELEMENTS[node.name];
    if (binding?.kind === "component" && binding.comp && !selfWrapsBuiltin) return this.genComponentUse(node, binding, parent, ctx, roots);
    if (node.name === "Fragment") return this.genNodes(node.children, parent, ctx);
    if (node.name === "RawHTML" || node.name === "Html") return this.genRawHtml(node, parent, ctx);
    const info = ELEMENTS[node.name];
    if (!info) {
      const candidates = [...Object.keys(ELEMENTS), ...ctx.scope.all().filter(n => /^[A-Z]/.test(n))];
      const s = suggest(node.name, candidates);
      this.fail("E0301", `Unknown component '${node.name}'`, node.loc, s ? `Did you mean '${s}'?` : "Import it, e.g. import { " + node.name + " } from \"./components/" + node.name + ".sinth\"");
    }
    if (node.slots.length) this.fail("E0311", "slot(...) fills can only be used inside components that declare $slot", node.slots[0].loc);

    if (this.isStaticNode(node, ctx)) {
      const html = this.staticHtml(node, ctx);
      if (roots) {
        const v = this.id("e");
        roots.push(v);
        return `const ${v} = $$.tpl(${JSON.stringify(html)}${info.svg ? ", true" : ""}).firstChild;\n${parent}.appendChild(${v});`;
      }
      return `${parent}.appendChild($$.tpl(${JSON.stringify(html)}${info.svg || ctx.svg ? ", true" : ""}));`;
    }

    const { tag, attrs } = this.elementShape(node, ctx);
    const v = this.id("e");
    roots?.push(v);
    const lines: string[] = [];
    const isSvg = !!info.svg || ctx.svg;
    lines.push(`const ${v} = ${isSvg ? `$$.svg(${JSON.stringify(tag)})` : `$$.el(${JSON.stringify(tag)})`};`);
    for (const [k, val] of Object.entries(attrs)) lines.push(`${v}.setAttribute(${JSON.stringify(k)}, ${JSON.stringify(val)});`);
    lines.push(...this.genDynamicAttrs(node, v, tag, ctx));
    const childCtx: RenderCtx = { ...ctx, svg: isSvg && tag !== "foreignObject" };
    const htmlAttr = node.attrs.find(a => a.name === "html");
    if (htmlAttr && node.children.length) this.fail("E0330", "An element with 'html' cannot also have children", htmlAttr.loc);
    if (VOID_TAGS.has(tag) && node.children.length) this.fail("E0331", `<${tag}> is a void element and cannot have children`, node.loc);
    if (node.children.length) lines.push(this.genNodes(node.children, v, childCtx));
    lines.push(`${parent}.appendChild(${v});`);
    return lines.filter(Boolean).join("\n");
  }

  private genRawHtml(node: ElementNode, parent: string, ctx: RenderCtx): string {
    const content = node.attrs.find(a => a.name === "content" || a.name === "html");
    if (!content?.value) this.fail("E0332", `${node.name} requires a 'content' attribute`, node.loc);
    if (content.value.k !== "lit") {
      this.diagnostics.warn("W0301", `${node.name} renders dynamic content as unescaped HTML. Only use it with trusted content`, content.loc);
    }
    return `$$.html(${parent}, () => ${this.expr(content.value, ctx.scope)});`;
  }

  private genDynamicAttrs(node: ElementNode, v: string, tag: string, ctx: RenderCtx): string[] {
    const lines: string[] = [];
    const scope = ctx.scope;
    for (const a of node.attrs) {
      if (a.name === "level" && node.name === "Heading") continue;
      if (a.handler) {
        this.interactive = true;
        lines.push(`$$.on(${v}, ${JSON.stringify(eventName(a.name))}, ${this.genHandler(a, scope)}${a.modifiers.length ? ", " + JSON.stringify(a.modifiers) : ""});`);
        continue;
      }
      if (a.name === "...") this.fail("E0333", "Spread attributes are only supported on components", a.loc);
      if (a.value === null) continue;
      const val = a.value;
      switch (a.name) {
        case "model":
        case "bind": {
          this.interactive = true;
          if (val.k !== "id" && val.k !== "member" && val.k !== "index") this.fail("E0340", `'${a.name}' needs a variable to bind to`, a.loc);
          const get = this.expr(val, scope);
          const target = this.assignTarget(val, scope, a.loc);
          const t = this.inferType(val, scope);
          const numeric = !!t && (t.base === "num" || t.base === "int") && t.array === 0;
          lines.push(`$$.model(${v}, () => ${get}, ($$v) => { ${target} = $$v; }${numeric ? ", true" : ""});`);
          continue;
        }
        case "ref":
          this.interactive = true;
          if (val.k !== "id" && val.k !== "member") this.fail("E0341", "'ref' needs a variable to store the element in", a.loc);
          lines.push(`$$.ref(${v}, ($$v) => { ${this.assignTarget(val, scope, a.loc)} = $$v; });`);
          continue;
        case "hide":
          lines.push(`$$.show(${v}, () => !(${this.expr(val, scope)}));`);
          continue;
        case "show":
          lines.push(`$$.show(${v}, () => ${this.expr(val, scope)});`);
          continue;
        case "html":
          if (val.k !== "lit") this.diagnostics.warn("W0301", "'html' renders dynamic content as unescaped HTML. Only use it with trusted content", a.loc);
          lines.push(`$$.html(${v}, () => ${this.expr(val, scope)});`);
          continue;
        case "delay":
          lines.push(`$$.show(${v}, () => false);`, `setTimeout(() => { ${v}.style.display = ""; }, Number(${this.expr(val, scope)}) || 0);`);
          this.interactive = true;
          continue;
        case "key":
          continue;
        default:
          break;
      }
      if (val.k === "lit") continue;
      if (a.name === "style" && isLiteralObject(val)) continue;
      const js = this.expr(val, scope);
      if (a.name === "class") lines.push(`$$.cls(${v}, () => ${js});`);
      else if (a.name === "style") lines.push(`$$.style(${v}, () => ${js});`);
      else if (this.isStyleProp(a.name, tag)) lines.push(`$$.styleProp(${v}, ${JSON.stringify(a.name)}, () => ${js});`);
      else if (PROP_ATTRS.has(a.name)) lines.push(`$$.prop(${v}, ${JSON.stringify(a.name)}, () => ${js});`);
      else lines.push(`$$.attr(${v}, ${JSON.stringify(attrNameToHtml(a.name))}, () => ${js});`);
    }
    return lines;
  }

  private genHandler(a: Attr, scope: Scope): string {
    const stmts = a.handler as Stmt[];
    const inner = new Scope(scope, "function");
    inner.define("e", { kind: "local", js: "e" });
    inner.define("event", { kind: "local", js: "e" });
    if (stmts.length === 1 && stmts[0].k === "expr") {
      const ex = stmts[0].expr;
      if (ex.k === "arrow") return this.expr(ex, scope);
      if (ex.k === "id" || ex.k === "member") {
        const b = ex.k === "id" ? scope.lookup(ex.name) : undefined;
        if (ex.k === "id" && !b) this.unknownName(ex.name, ex.loc, scope);
        if (ex.k === "id" && b && (b.kind === "state" || b.kind === "local" || b.kind === "param") && b.type && b.type.base !== "fn" && b.type.base !== "any") {
          this.fail("E0350", `'${ex.name}' is a ${typeName(b.type)}, not a function, so it cannot be used as an event handler`, ex.loc);
        }
        if (b?.fn) {
          const first = b.fn.params[0];
          if (first && (first.name === "e" || first.name === "event")) return `(e) => ${this.expr(ex, inner)}(e)`;
          const missing = b.fn.params.find(p => !p.optional && !p.rest);
          if (missing) this.fail("E0315", `Missing argument '${missing.name}' for function '${b.fn.name}'`, ex.loc, `Call it with arguments, e.g. onClick: ${b.fn.name}(...)`);
          return `() => ${this.expr(ex, inner)}()`;
        }
        return `(e) => ${this.expr(ex, inner)}(e)`;
      }
    }
    const body = this.stmts(stmts, inner);
    return `${containsAwait(stmts) ? "async " : ""}(e) => {\n${indent(body)}\n}`;
  }

  private genComponentUse(node: ElementNode, b: Binding, parent: string, ctx: RenderCtx, roots?: string[]): string {
    const sig = b.comp as ComponentSig;
    if (b.ref) this.uses.add(b.ref);
    const scope = ctx.scope;
    const props: string[] = [];
    const passed = new Set<string>();
    const fallthrough: Attr[] = [];
    for (const a of node.attrs) {
      if (a.name === "...") {
        props.push(`...${this.expr(a.value as Expr, scope)}`);
        continue;
      }
      const param = sig.params.find(p => p.name === a.name);
      if (!param) {
        const s = suggest(a.name, sig.params.map(p => p.name));
        if (s && !a.handler && !["class", "style", "id"].includes(a.name)) {
          this.diagnostics.warn("W0310", `'${node.name}' has no parameter '${a.name}'; it is passed to the root element instead`, a.loc, `Did you mean '${s}'?`);
        }
        fallthrough.push(a);
        continue;
      }
      passed.add(param.name);
      if (a.handler) {
        props.push(`${JSON.stringify(param.name)}: ${this.genHandler(a, scope)}`);
        continue;
      }
      const value: Expr = a.value ?? { k: "lit", value: true, loc: a.loc };
      if (param.type) this.checkAssignable(param.type, value, scope, a.loc, `parameter '${param.name}' of '${node.name}'`);
      const js = this.expr(value, scope);
      if (param.bindable && (value.k === "id" || value.k === "member" || value.k === "index")) {
        const target = this.assignTarget(value, scope, a.loc);
        props.push(`get ${JSON.stringify(param.name)}() { return ${js}; }, set ${JSON.stringify(param.name)}($$v) { ${target} = $$v; }`);
        continue;
      }
      props.push(this.isConstantExpr(value, scope) ? `${JSON.stringify(param.name)}: ${js}` : `get ${JSON.stringify(param.name)}() { return ${js}; }`);
    }
    for (const p of sig.params) {
      if (!passed.has(p.name) && !p.optional && !p.rest) {
        this.fail("E0360", `Missing required parameter '${p.name}' for component '${node.name}'`, node.loc, `Pass it like: ${node.name}(${p.name}: ...)`);
      }
    }
    const slotEntries: string[] = [];
    if (node.children.length) slotEntries.push(`default: ($$f) => {\n${indent(this.genNodes(node.children, "$$f", { ...ctx, svg: false }))}\n}`);
    for (const sf of node.slots) slotEntries.push(`${JSON.stringify(sf.name)}: ($$f) => {\n${indent(this.genNodes(sf.children, "$$f", ctx))}\n}`);
    let ft = "";
    if (fallthrough.length) {
      const fv = "$$t";
      const fake: ElementNode = { ...node, attrs: fallthrough, name: "Div" };
      const lines = this.genDynamicAttrs(fake, fv, "div", ctx);
      for (const a of fallthrough) {
        if (a.handler || !a.value || a.value.k !== "lit") continue;
        if (a.name === "class") lines.push(`${fv}.classList.add(...${JSON.stringify(String(a.value.value).split(/\s+/).filter(Boolean))});`);
        else if (a.value.value !== false && a.value.value !== null) lines.push(`${fv}.setAttribute(${JSON.stringify(attrNameToHtml(a.name))}, ${JSON.stringify(a.value.value === true ? "" : String(a.value.value))});`);
      }
      for (const a of fallthrough) if (a.value === null && !a.handler) lines.push(`${fv}.setAttribute(${JSON.stringify(attrNameToHtml(a.name))}, "");`);
      ft = `, (${fv}) => {\n${indent(lines.join("\n"))}\n}`;
    }
    const call = `$$.component(${parent}, ${b.js}, { ${props.join(", ")} }, { ${slotEntries.join(", ")} }${ft});`;
    if (roots) {
      const v = this.id("c");
      roots.push(v);
      return `const ${v} = ${call}`;
    }
    return call;
  }

  private genIf(node: IfNode, parent: string, ctx: RenderCtx, topLevel = false): string {
    const branches = node.branches.map(br => {
      const test = br.test ? `() => ${this.expr(br.test, ctx.scope)}` : "null";
      const inner: RenderCtx = { ...ctx, scope: new Scope(ctx.scope, "block") };
      const p = this.id("b");
      const branchRoots: string[] = [];
      const body = this.genNodes(br.body, p, inner, topLevel ? branchRoots : undefined);
      const hook = topLevel && ctx.rootHook ? ctx.rootHook(branchRoots) : "";
      return `[${test}, (${p}) => {\n${indent([body, hook].filter(Boolean).join("\n"))}\n}]`;
    });
    const opts: string[] = [];
    if (node.persist) opts.push("persist: true");
    if (node.delay) opts.push(`delay: () => ${this.expr(node.delay, ctx.scope)}`);
    if (node.transition) opts.push(`transition: ${JSON.stringify(node.transition)}`);
    return `$$.when(${parent}, [\n${indent(branches.join(",\n"))}\n]${opts.length ? `, { ${opts.join(", ")} }` : ""});`;
  }

  private genFor(node: ForNode, parent: string, ctx: RenderCtx, topLevel = false): string {
    const iter = this.expr(node.iter, ctx.scope);
    const l = this.id("l");
    const loopScope = new Scope(ctx.scope, "loop");
    const fields = ["item", "index", "key"];
    node.names.forEach((n, i) => {
      const iterType = this.inferType(node.iter, ctx.scope);
      const type = i === 1 ? T("num") : i === 0 && iterType && iterType.array > 0 ? { ...iterType, array: iterType.array - 1 } : undefined;
      loopScope.define(n, { kind: "loop", js: `${l}.${fields[i]}`, type });
    });
    const p = this.id("b");
    const itemRoots: string[] = [];
    const body = this.genNodes(node.body, p, { ...ctx, scope: loopScope }, topLevel ? itemRoots : undefined) + (topLevel && ctx.rootHook ? "\n" + ctx.rootHook(itemRoots) : "");
    const keyFn = node.keyExpr ? `(${l}) => ${this.expr(node.keyExpr, loopScope)}` : "undefined";
    const filterFn = node.filter ? `(${l}) => ${this.expr(node.filter, loopScope)}` : "undefined";
    const empty = node.empty ? `($$f) => {\n${indent(this.genNodes(node.empty, "$$f", ctx))}\n}` : "";
    const extra = [keyFn, filterFn, empty].filter(Boolean);
    while (extra.length && extra[extra.length - 1] === "undefined") extra.pop();
    return `$$.each(${parent}, () => ${iter}, (${p}, ${l}) => {\n${indent(body)}\n}${extra.length ? ", " + extra.join(", ") : ""});`;
  }

  private stmts(stmts: Stmt[], scope: Scope, returnType?: TypeRef): string {
    return stmts.map(s => this.stmt(s, scope, returnType)).filter(Boolean).join("\n");
  }

  private stmt(s: Stmt, scope: Scope, returnType?: TypeRef): string {
    switch (s.k) {
      case "expr": {
        if (s.expr.k === "call") {
          const b = this.calleeBinding(s.expr.callee, scope);
          if (b?.fn?.ui) this.fail("E0370", `'${b.fn.name}' returns UI and can only be used inside markup`, s.loc);
        }
        return `${this.expr(s.expr, scope)};`;
      }
      case "var":
        this.checkDuplicate(scope, s.decl.name, s.loc);
        return this.genVarDecl(s.decl, scope, false);
      case "if": {
        const thenScope = new Scope(scope);
        let code = `if (${this.expr(s.test, scope)}) {\n${indent(this.stmts(s.then, thenScope, returnType))}\n}`;
        if (s.else) {
          const elseScope = new Scope(scope);
          if (s.else.length === 1 && s.else[0].k === "if") code += ` else ${this.stmt(s.else[0], elseScope, returnType)}`;
          else code += ` else {\n${indent(this.stmts(s.else, elseScope, returnType))}\n}`;
        }
        return code;
      }
      case "for": {
        const inner = new Scope(scope, "block");
        for (const n of s.names) inner.define(n, { kind: "local", js: n });
        const pattern = `[${s.names.join(", ")}]`;
        const filter = s.filter ? `if (!(${this.expr(s.filter, inner)})) continue;\n` : "";
        return `for (const ${pattern} of $$.iter(${this.expr(s.iter, scope)})) {\n${indent(filter + this.stmts(s.body, inner, returnType))}\n}`;
      }
      case "while":
        return `while (${this.expr(s.test, scope)}) {\n${indent(this.stmts(s.body, new Scope(scope), returnType))}\n}`;
      case "return":
        if (s.value && returnType && returnType.base !== "any") {
          if (returnType.base === "void") this.fail("E0380", "This function is declared '-> void' and cannot return a value", s.loc);
          this.checkAssignable(returnType, s.value, scope, s.loc, "the return value");
        }
        return s.value ? `return ${this.expr(s.value, scope)};` : "return;";
      case "break":
        return "break;";
      case "continue":
        return "continue;";
    }
  }

  private calleeBinding(callee: Expr, scope: Scope): Binding | undefined {
    if (callee.k === "id") return scope.lookup(callee.name);
    return undefined;
  }

  private unknownName(name: string, loc: Loc, scope: Scope): never {
    const s = suggest(name, scope.all()) ?? [...JS_GLOBALS].find(g => g.toLowerCase() === name.toLowerCase() || levenshtein(g, name) === 1);
    this.fail("E0302", `Unknown name '${name}'`, loc, s ? `Did you mean '${s}'?` : `Declare it with 'var', import it, or declare a browser global with 'extern ${name}'`);
  }

  private resolveId(name: string, loc: Loc, scope: Scope): Binding {
    const b = scope.lookup(name);
    if (b) return b;
    const rt = RUNTIME_GLOBALS.get(name);
    if (rt) return { kind: "global", js: rt };
    if (JS_GLOBALS.has(name)) return { kind: "global", js: name };
    return this.unknownName(name, loc, scope);
  }

  private bindingJs(b: Binding, scope: Scope): string {
    if (b.kind === "param" && b.defaultValue) {
      return `(${b.js} === undefined ? ${this.expr(b.defaultValue, scope)} : ${b.js})`;
    }
    if (b.kind === "state" || b.kind === "computed") this.usesState = true;
    return b.js;
  }

  private assignTarget(target: Expr, scope: Scope, loc: Loc): string {
    if (target.k === "id") {
      const b = this.resolveId(target.name, target.loc, scope);
      switch (b.kind) {
        case "param":
          if (b.bindable) return b.js;
          this.fail("E0390", `Cannot assign to parameter '${target.name}'; parameters are read-only`, loc, `Copy it into a variable (var ${target.name}Value = ${target.name}) or declare it as 'bind ${target.name}' for two-way binding`);
          break;
        case "const":
          this.fail("E0391", `Cannot assign to constant '${target.name}'`, loc);
          break;
        case "computed":
          this.fail("E0392", `Cannot assign to computed value '${target.name}'`, loc);
          break;
        case "function":
        case "component":
          this.fail("E0393", `Cannot assign to ${b.kind} '${target.name}'`, loc);
          break;
        case "loop":
          this.fail("E0394", `Cannot assign to loop variable '${target.name}'`, loc, "Change the list instead, e.g. items[index] = newValue");
          break;
        default:
          break;
      }
      if (b.kind === "state") this.usesState = true;
      return b.js;
    }
    return this.expr(target, scope);
  }

  private genCallArgs(args: Arg[], fn: FunctionSig, scope: Scope, loc: Loc): string {
    const params = fn.params;
    const ordered: (Expr | undefined)[] = [];
    let positional = 0;
    let sawNamed = false;
    const rest = params.find(p => p.rest);
    const restArgs: Expr[] = [];
    for (const a of args) {
      if (a.spread) return args.map(x => (x.spread ? "..." : "") + this.expr(x.value, scope)).join(", ");
      if (a.name) {
        sawNamed = true;
        const idx = params.findIndex(p => p.name === a.name);
        if (idx === -1) {
          const s = suggest(a.name, params.map(p => p.name));
          this.fail("E0311", `'${fn.name}' has no parameter named '${a.name}'`, a.loc, s ? `Did you mean '${s}'?` : undefined);
        }
        if (ordered[idx]) this.fail("E0312", `Parameter '${a.name}' was passed twice`, a.loc);
        ordered[idx] = a.value;
      } else {
        if (sawNamed) this.fail("E0313", "Positional arguments cannot follow named arguments", a.loc);
        if (positional >= params.length || params[positional].rest) {
          if (rest) {
            restArgs.push(a.value);
            continue;
          }
          this.fail("E0314", `Too many arguments for '${fn.name}': expected at most ${params.length}, got ${args.length}`, a.loc);
        }
        ordered[positional++] = a.value;
      }
    }
    params.forEach((p, i) => {
      if (p.rest) return;
      const given = ordered[i];
      if (!given && !p.optional) {
        this.fail("E0315", `Missing argument '${p.name}' for function '${fn.name}'`, loc, `Expected: ${fn.name}(${params.map(x => x.name + (x.optional ? "?" : "")).join(", ")})`);
      }
      if (given && p.type) this.checkAssignable(p.type, given, scope, given.loc, `argument '${p.name}' of '${fn.name}'`);
    });
    let last = ordered.length - 1;
    while (last >= 0 && !ordered[last]) last--;
    const out: string[] = [];
    for (let i = 0; i <= last; i++) out.push(ordered[i] ? this.expr(ordered[i] as Expr, scope) : "undefined");
    for (const r of restArgs) out.push(this.expr(r, scope));
    return out.join(", ");
  }

  expr(e: Expr, scope: Scope): string {
    switch (e.k) {
      case "lit":
        return e.value === null ? "null" : JSON.stringify(e.value);
      case "tpl":
        return "`" + e.parts.map(p => (typeof p === "string" ? p.replace(/[`\\$]/g, m => "\\" + m) : "${$$.toText(" + this.expr(p, scope) + ")}")).join("") + "`";
      case "id":
        return this.bindingJs(this.resolveId(e.name, e.loc, scope), scope);
      case "member":
        return `${this.expr(e.object, scope)}${e.optional ? "?." : "."}${e.prop}`;
      case "index":
        return `${this.expr(e.object, scope)}${e.optional ? "?.[" : "["}${this.expr(e.index, scope)}]`;
      case "call": {
        const b = this.calleeBinding(e.callee, scope);
        if (e.callee.k === "id" && !b) this.resolveId(e.callee.name, e.callee.loc, scope);
        if (b?.kind === "component") this.fail("E0371", `'${e.callee.k === "id" ? e.callee.name : ""}' is a component; use it as markup, not as a function call`, e.loc);
        if (b?.fn?.ui) this.fail("E0370", `'${b.fn.name}' returns UI and can only be used inside markup`, e.loc);
        const callee = this.expr(e.callee, scope);
        const args = b?.fn ? this.genCallArgs(e.args, b.fn, scope, e.loc) : e.args.map(a => (a.spread ? "..." : "") + this.expr(a.value, scope)).join(", ");
        if (!b?.fn && e.args.some(a => a.name)) this.fail("E0316", "Named arguments are only supported for Sinth functions", e.args.find(a => a.name)?.loc);
        const call = `${callee}${e.optional ? "?." : ""}(${args})`;
        if (e.memo) return `$$.memo(${JSON.stringify(this.fileHash + ":" + e.loc.line + ":" + e.loc.col)}, () => ${call}, [${args}])`;
        return call;
      }
      case "new":
        return `new ${this.expr(e.callee, scope)}(${e.args.map(a => (a.spread ? "..." : "") + this.expr(a.value, scope)).join(", ")})`;
      case "unary": {
        const arg = this.expr(e.arg, scope);
        if (e.op === "typeof" || e.op === "await") return `(${e.op} ${arg})`;
        return `(${e.op}${arg})`;
      }
      case "binary": {
        this.checkBinary(e, scope);
        const op = e.op === "==" ? "===" : e.op === "!=" ? "!==" : e.op;
        return `(${this.expr(e.left, scope)} ${op} ${this.expr(e.right, scope)})`;
      }
      case "cond":
        return `(${this.expr(e.test, scope)} ? ${this.expr(e.then, scope)} : ${this.expr(e.else, scope)})`;
      case "assign": {
        const target = this.assignTarget(e.target, scope, e.loc);
        if (e.target.k === "id") {
          const t = this.resolveId(e.target.name, e.loc, scope).type;
          if (t) {
            if (e.op === "=") this.checkAssignable(t, e.value, scope, e.value.loc, `'${e.target.name}'`);
            else if (e.op === "+=" && t.base === "num" && t.array === 0) {
              const vt = this.inferType(e.value, scope);
              if (vt && vt.base === "str" && vt.array === 0) this.fail("E0400", `Cannot add a str to num variable '${e.target.name}'`, e.value.loc);
            }
          }
        }
        return `${target} ${e.op} ${this.expr(e.value, scope)}`;
      }
      case "update":
        return e.prefix ? `++${this.assignTarget(e.target, scope, e.loc)}` : `${this.assignTarget(e.target, scope, e.loc)}++`;
      case "array":
        return `[${e.items.map(i => (i.spread ? "..." : "") + this.expr(i.value, scope)).join(", ")}]`;
      case "object":
        return `({ ${e.props.map(p => {
          if (p.spread) return `...${this.expr(p.value, scope)}`;
          if (p.computedKey) return `[${this.expr(p.computedKey, scope)}]: ${this.expr(p.value, scope)}`;
          return `${JSON.stringify(p.key)}: ${this.expr(p.value, scope)}`;
        }).join(", ")} })`;
      case "arrow": {
        const inner = new Scope(scope, "function");
        const params = this.genParams(e.params, inner);
        const isAsync = e.async || (Array.isArray(e.body) ? containsAwait(e.body) : exprHasAwait(e.body));
        if (Array.isArray(e.body)) return `${isAsync ? "async " : ""}(${params}) => {\n${indent(this.stmts(e.body, inner))}\n}`;
        return `${isAsync ? "async " : ""}(${params}) => (${this.expr(e.body, inner)})`;
      }
      case "range":
        return `$$.range(${e.args.map(a => this.expr(a, scope)).join(", ")})`;
    }
  }

  private checkBinary(e: Extract<Expr, { k: "binary" }>, scope: Scope): void {
    if (!["==", "!=", "<", ">", "<=", ">="].includes(e.op)) return;
    const l = this.inferType(e.left, scope);
    const r = this.inferType(e.right, scope);
    if (!l || !r || l.array || r.array || l.nullable || r.nullable) return;
    const isNum = (t: TypeRef): boolean => t.base === "num" || t.base === "int";
    if ((isNum(l) && r.base === "str") || (l.base === "str" && isNum(r))) {
      this.fail("E0401", `Cannot compare ${typeName(l)} and ${typeName(r)} with '${e.op}'`, e.loc, "Convert one side first, e.g. Number(value) or String(value)");
    }
  }

  inferType(e: Expr, scope: Scope): TypeRef | undefined {
    switch (e.k) {
      case "lit":
        if (typeof e.value === "string") return T("str");
        if (typeof e.value === "number") return T("num");
        if (typeof e.value === "boolean") return T("bool");
        return undefined;
      case "tpl":
        return T("str");
      case "id": {
        const b = scope.lookup(e.name);
        return b?.type;
      }
      case "binary": {
        if (["==", "!=", "<", ">", "<=", ">="].includes(e.op)) return T("bool");
        if (e.op === "+") {
          const l = this.inferType(e.left, scope);
          const r = this.inferType(e.right, scope);
          if ((l?.base === "str" && !l.array) || (r?.base === "str" && !r.array)) return T("str");
          if (l && r && (l.base === "num" || l.base === "int") && (r.base === "num" || r.base === "int") && !l.array && !r.array) return T("num");
          return undefined;
        }
        if (["-", "*", "/", "%", "**"].includes(e.op)) return T("num");
        return undefined;
      }
      case "unary":
        if (e.op === "!") return T("bool");
        if (e.op === "-" || e.op === "+") return T("num");
        if (e.op === "typeof") return T("str");
        return undefined;
      case "cond": {
        const a = this.inferType(e.then, scope);
        const b = this.inferType(e.else, scope);
        return a && b && typeName(a) === typeName(b) ? a : undefined;
      }
      case "array": {
        if (!e.items.length) return undefined;
        const first = this.inferType(e.items[0].value, scope);
        if (!first || e.items.some(i => i.spread || typeName(this.inferType(i.value, scope) ?? T("any")) !== typeName(first))) return T("any", 1);
        return { ...first, array: first.array + 1 };
      }
      case "object":
        return T("obj");
      case "call": {
        const b = this.calleeBinding(e.callee, scope);
        if (b?.fn?.returnType && b.fn.returnType.base !== "void") return b.fn.returnType;
        if (e.callee.k === "member" && ["toUpperCase", "toLowerCase", "trim", "join", "toFixed", "padStart", "padEnd", "slice", "replace", "toString"].includes(e.callee.prop)) {
          const ot = this.inferType(e.callee.object, scope);
          if (e.callee.prop === "slice" && ot?.array) return ot;
          if (e.callee.prop !== "slice" || ot?.base === "str") return T("str");
        }
        return undefined;
      }
      case "member":
        if (e.prop === "length") return T("num");
        return undefined;
      default:
        return undefined;
    }
  }

  private checkAssignable(target: TypeRef, value: Expr, scope: Scope, loc: Loc, what: string): void {
    if (value.k === "lit" && value.value === null) {
      if (!target.nullable && target.base !== "obj" && target.base !== "any" && target.array === 0) {
        this.diagnostics.warn("W0401", `Assigning null to non-nullable ${typeName(target)} ${what}`, loc, `Declare it as '${typeName(target)}?' to allow null`);
      }
      return;
    }
    const actual = this.inferType(value, scope);
    if (!actual) return;
    if (target.base === "ui" || target.base === "void") return;
    if (!sameKind(target, actual)) {
      this.fail("E0403", `Type mismatch: cannot assign ${typeName(actual)} to ${typeName(target)} ${what}`, loc);
    }
  }
}

function defaultFor(t?: TypeRef): string {
  if (!t) return "null";
  if (t.nullable) return "null";
  if (t.array) return "[]";
  switch (t.base) {
    case "str": return "\"\"";
    case "num":
    case "int": return "0";
    case "bool": return "false";
    default: return "null";
  }
}

function isLiteralObject(e: Expr): e is Extract<Expr, { k: "object" }> {
  return e.k === "object" && e.props.every(p => !p.spread && !p.computedKey && p.value.k === "lit");
}

function kebabCss(name: string): string {
  return name.replace(/^(Webkit|Moz|Ms)/, m => "-" + m.toLowerCase()).replace(/[A-Z]/g, m => "-" + m.toLowerCase());
}

function literalObjectToCss(e: Extract<Expr, { k: "object" }>): string {
  return e.props
    .filter(p => p.value.k === "lit" && p.value.value !== null && p.value.value !== false)
    .map(p => `${kebabCss(p.key)}: ${String((p.value as { value: unknown }).value)}`)
    .join("; ");
}

function exprHasAwait(e: Expr): boolean {
  switch (e.k) {
    case "unary": return e.op === "await" || exprHasAwait(e.arg);
    case "binary": return exprHasAwait(e.left) || exprHasAwait(e.right);
    case "assign": return exprHasAwait(e.value);
    case "cond": return exprHasAwait(e.test) || exprHasAwait(e.then) || exprHasAwait(e.else);
    case "call": return exprHasAwait(e.callee) || e.args.some(a => exprHasAwait(a.value));
    case "member": return exprHasAwait(e.object);
    case "index": return exprHasAwait(e.object) || exprHasAwait(e.index);
    case "array": return e.items.some(i => exprHasAwait(i.value));
    case "object": return e.props.some(p => exprHasAwait(p.value));
    case "tpl": return e.parts.some(p => typeof p !== "string" && exprHasAwait(p));
    default: return false;
  }
}

export function containsAwait(stmts: Stmt[]): boolean {
  return stmts.some(s => {
    switch (s.k) {
      case "expr": return exprHasAwait(s.expr);
      case "var": return !!s.decl.init && exprHasAwait(s.decl.init);
      case "if": return exprHasAwait(s.test) || containsAwait(s.then) || (!!s.else && containsAwait(s.else));
      case "for": return exprHasAwait(s.iter) || containsAwait(s.body);
      case "while": return exprHasAwait(s.test) || containsAwait(s.body);
      case "return": return !!s.value && exprHasAwait(s.value);
      default: return false;
    }
  });
}

function indent(code: string): string {
  return code.split("\n").map(l => (l ? "  " + l : l)).join("\n");
}

function parseInlineExpr(src: string, loc: Loc): Expr {
  const parser = Parser.fromTokens(tokenize(src, loc.file, loc), loc.file);
  return parser.parseExpr();
}

export function compileModule(file: SinthFile, imports: ResolvedImport[], opts: CodegenOptions): ModuleOutput {
  return new ModuleCompiler(file, imports, opts).compile();
}

export { isStatementExpr };
