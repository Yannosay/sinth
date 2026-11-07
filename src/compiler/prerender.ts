import { Attr, ComponentDecl, ElementNode, Expr, FunctionDecl, MetaEntry, Node, SinthFile, Stmt, VarDecl } from "./ast";
import { attrNameToHtml, BOOLEAN_ATTRS, ELEMENTS, INLINE_STYLE_PROPS, VOID_TAGS } from "./elements";
import { escapeAttr, escapeHtml, hashString } from "./html";
import { tokenize } from "./lexer";
import { Parser } from "./parser";
import { compileStyle } from "./style";
import { ResolvedImport } from "./codegen";

const UNKNOWN: unique symbol = Symbol("unknown");
type Value = unknown;

class Cell {
  constructor(public value: Value) {}
}

class Env {
  private readonly vars = new Map<string, Cell>();

  constructor(readonly parent: Env | null) {}

  define(name: string, value: Value): void {
    this.vars.set(name, new Cell(value));
  }

  find(name: string): Cell | undefined {
    return this.vars.get(name) ?? this.parent?.find(name);
  }
}

class ReturnSignal {
  constructor(readonly value: Value) {}
}

class BreakSignal {}
class ContinueSignal {}

const BLOCKED_PROPS = new Set(["constructor", "__proto__", "prototype", "__defineGetter__", "__defineSetter__"]);
const MAX_STEPS = 2_000_000;

export interface PrerenderHost {
  getFile(path: string): SinthFile;
  getImports(file: SinthFile): ResolvedImport[];
}

interface ComponentRef {
  decl: ComponentDecl;
  file: SinthFile;
}

interface RenderScope {
  env: Env;
  file: SinthFile;
  scopeClass?: string;
  compName?: string;
  slots?: Record<string, (() => string) | undefined>;
}

export class Prerenderer {
  complete = true;
  private steps = 0;
  private readonly moduleEnvs = new Map<string, Env>();
  private readonly componentTables = new Map<string, Map<string, ComponentRef>>();
  private depth = 0;

  constructor(private readonly host: PrerenderHost) {}

  renderPage(file: SinthFile, params?: Record<string, string>): string {
    const env = this.moduleEnv(file, params);
    return this.renderNodes(file.body, { env: new Env(env), file });
  }

  /** Evaluates metadata in the page's module scope. Values that need the browser come back as `undefined` with `known: false`. */
  evalMeta(file: SinthFile, params?: Record<string, string>): { key: string; value: Value; known: boolean; loc: MetaEntry["loc"] }[] {
    const env = this.moduleEnv(file, params);
    return file.meta.filter(m => m.key !== "paths").map(m => {
      let value: Value;
      try {
        value = this.eval(m.value, env, file);
      } catch {
        value = UNKNOWN;
      }
      return { key: m.key, value: value === UNKNOWN ? undefined : value, known: value !== UNKNOWN, loc: m.loc };
    });
  }

  /** Evaluates `paths` for a dynamic route. Route params are unknown at this point. */
  evalPaths(file: SinthFile, paramNames: string[]): { value: Value; known: boolean } {
    const entry = file.meta.find(m => m.key === "paths");
    if (!entry) return { value: undefined, known: true };
    const unknownParams: Record<string, string> = {};
    const env = this.moduleEnv(file, unknownParams, paramNames);
    let value: Value;
    try {
      value = this.eval(entry.value, env, file);
    } catch {
      value = UNKNOWN;
    }
    return { value: value === UNKNOWN ? undefined : value, known: value !== UNKNOWN };
  }

  private tick(): void {
    if (++this.steps > MAX_STEPS) throw new Error("Prerender step limit exceeded");
  }

  private moduleEnv(file: SinthFile, params?: Record<string, string>, unknownParams: string[] = []): Env {
    const cached = this.moduleEnvs.get(file.path);
    if (cached) return cached;
    const env = new Env(null);
    this.moduleEnvs.set(file.path, env);
    for (const name of unknownParams) env.define(name, UNKNOWN);
    if (params) for (const [k, v] of Object.entries(params)) env.define(k, v);
    for (const imp of this.host.getImports(file)) {
      const d = imp.decl;
      if (imp.kind === "json") {
        if (d.defaultName) env.define(d.defaultName, imp.json);
        for (const s of d.named) env.define(s.alias, (imp.json as Record<string, unknown>)?.[s.name]);
      } else if (imp.kind === "sinth" && imp.exports) {
        const other = this.host.getFile(imp.specifier);
        const otherEnv = this.moduleEnv(other);
        for (const s of d.named) {
          const cell = otherEnv.find(s.name);
          if (cell) env.define(s.alias, cell.value);
        }
      } else {
        for (const name of [d.defaultName, d.namespace, ...d.named.map(s => s.alias)]) if (name) env.define(name, UNKNOWN);
      }
    }
    for (const ext of file.externs) env.define(ext.name, UNKNOWN);
    for (const f of file.functions) env.define(f.name, this.makeFunction(f, env, file));
    if (file.scripts.length) this.complete = false;
    for (const v of file.vars) {
      try {
        this.declare(v, env, file);
      } catch {
        env.define(v.name, UNKNOWN);
      }
    }
    return env;
  }

  private declare(v: VarDecl, env: Env, file: SinthFile): void {
    if (v.kind === "computed" && v.init) {
      const init = v.init;
      env.define(v.name, UNKNOWN);
      const cell = env.find(v.name) as Cell;
      Object.defineProperty(cell, "value", { get: () => this.eval(init, env, file), configurable: true });
      return;
    }
    env.define(v.name, v.init ? this.eval(v.init, env, file) : defaultValue(v));
  }

  private makeFunction(f: FunctionDecl, env: Env, file: SinthFile): Value {
    if (f.view) return UNKNOWN;
    return (...args: Value[]): Value => {
      const local = new Env(env);
      f.params.forEach((p, i) => {
        let v = args[i];
        if (v === undefined && p.defaultValue) v = this.eval(p.defaultValue, local, file);
        local.define(p.name, v);
      });
      try {
        this.execAll(f.body, local, file);
      } catch (sig) {
        if (sig instanceof ReturnSignal) return sig.value;
        throw sig;
      }
      return undefined;
    };
  }

  private execAll(stmts: Stmt[], env: Env, file: SinthFile): void {
    for (const s of stmts) this.exec(s, env, file);
  }

  private exec(s: Stmt, env: Env, file: SinthFile): void {
    this.tick();
    switch (s.k) {
      case "expr":
        this.eval(s.expr, env, file);
        return;
      case "var":
        this.declare(s.decl, env, file);
        return;
      case "if": {
        const t = this.eval(s.test, env, file);
        if (t === UNKNOWN) throw new ReturnSignal(UNKNOWN);
        if (t) this.execAll(s.then, new Env(env), file);
        else if (s.else) this.execAll(s.else, new Env(env), file);
        return;
      }
      case "for": {
        const list = this.eval(s.iter, env, file);
        if (list === UNKNOWN) throw new ReturnSignal(UNKNOWN);
        for (const [item, index, key] of iterate(list)) {
          const inner = new Env(env);
          [item, index, key].slice(0, s.names.length).forEach((v, i) => inner.define(s.names[i], v));
          if (s.filter && !this.eval(s.filter, inner, file)) continue;
          try {
            this.execAll(s.body, inner, file);
          } catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (sig instanceof ContinueSignal) continue;
            throw sig;
          }
        }
        return;
      }
      case "while": {
        for (;;) {
          const t = this.eval(s.test, env, file);
          if (t === UNKNOWN) throw new ReturnSignal(UNKNOWN);
          if (!t) break;
          try {
            this.execAll(s.body, new Env(env), file);
          } catch (sig) {
            if (sig instanceof BreakSignal) break;
            if (sig instanceof ContinueSignal) continue;
            throw sig;
          }
        }
        return;
      }
      case "return":
        throw new ReturnSignal(s.value ? this.eval(s.value, env, file) : undefined);
      case "break":
        throw new BreakSignal();
      case "continue":
        throw new ContinueSignal();
    }
  }

  eval(e: Expr, env: Env, file: SinthFile): Value {
    this.tick();
    switch (e.k) {
      case "lit":
        return e.value;
      case "tpl": {
        let out = "";
        for (const p of e.parts) {
          if (typeof p === "string") out += p;
          else {
            const v = this.eval(p, env, file);
            if (v === UNKNOWN) return UNKNOWN;
            out += toText(v);
          }
        }
        return out;
      }
      case "id": {
        const cell = env.find(e.name);
        if (cell) return cell.value;
        return SAFE_GLOBALS[e.name] ?? UNKNOWN;
      }
      case "member": {
        const obj = this.eval(e.object, env, file);
        if (obj === UNKNOWN) return UNKNOWN;
        if (obj === null || obj === undefined) return e.optional ? undefined : UNKNOWN;
        return getProp(obj, e.prop);
      }
      case "index": {
        const obj = this.eval(e.object, env, file);
        const key = this.eval(e.index, env, file);
        if (obj === UNKNOWN || key === UNKNOWN) return UNKNOWN;
        if (obj === null || obj === undefined) return e.optional ? undefined : UNKNOWN;
        return getProp(obj, String(key));
      }
      case "call": {
        let thisArg: Value;
        let fn: Value;
        if (e.callee.k === "member") {
          thisArg = this.eval(e.callee.object, env, file);
          if (thisArg === UNKNOWN) return UNKNOWN;
          if (thisArg === null || thisArg === undefined) return e.optional || e.callee.optional ? undefined : UNKNOWN;
          fn = getProp(thisArg, e.callee.prop);
        } else {
          fn = this.eval(e.callee, env, file);
        }
        if (typeof fn !== "function") return UNKNOWN;
        const args: Value[] = [];
        for (const a of e.args) {
          const v = this.eval(a.value, env, file);
          if (v === UNKNOWN) return UNKNOWN;
          if (a.spread && Array.isArray(v)) args.push(...v);
          else args.push(v);
        }
        if (!isSafeCallable(fn, thisArg)) return UNKNOWN;
        try {
          const result = (fn as (...a: Value[]) => Value).apply(thisArg, args);
          return result instanceof Promise ? UNKNOWN : result;
        } catch (err) {
          if (err instanceof ReturnSignal) return err.value;
          return UNKNOWN;
        }
      }
      case "new": {
        if (e.callee.k === "id" && e.callee.name === "Date") {
          const args = e.args.map(a => this.eval(a.value, env, file));
          if (args.includes(UNKNOWN)) return UNKNOWN;
          return new Date(...(args as [number]));
        }
        return UNKNOWN;
      }
      case "unary": {
        if (e.op === "await") return UNKNOWN;
        const v = this.eval(e.arg, env, file);
        if (v === UNKNOWN) return UNKNOWN;
        switch (e.op) {
          case "!": return !v;
          case "-": return -(v as number);
          case "+": return +(v as number);
          case "~": return ~(v as number);
          case "typeof": return typeof v;
        }
        return UNKNOWN;
      }
      case "binary": {
        const l = this.eval(e.left, env, file);
        if (l === UNKNOWN) return UNKNOWN;
        if (e.op === "&&") return l ? this.eval(e.right, env, file) : l;
        if (e.op === "||") return l ? l : this.eval(e.right, env, file);
        if (e.op === "??") return l ?? this.eval(e.right, env, file);
        const r = this.eval(e.right, env, file);
        if (r === UNKNOWN) return UNKNOWN;
        return binary(e.op, l, r);
      }
      case "cond": {
        const t = this.eval(e.test, env, file);
        if (t === UNKNOWN) return UNKNOWN;
        return t ? this.eval(e.then, env, file) : this.eval(e.else, env, file);
      }
      case "assign": {
        const value = this.eval(e.value, env, file);
        if (e.target.k === "id") {
          const cell = env.find(e.target.name);
          if (!cell) return UNKNOWN;
          const cur = cell.value;
          cell.value = e.op === "=" ? value : value === UNKNOWN || cur === UNKNOWN ? UNKNOWN : binary(e.op.slice(0, -1) as "+", cur, value);
          return cell.value;
        }
        if (e.target.k === "member" || e.target.k === "index") {
          const obj = this.eval(e.target.object, env, file);
          const key = e.target.k === "member" ? e.target.prop : this.eval(e.target.index, env, file);
          if (obj && typeof obj === "object" && key !== UNKNOWN && !BLOCKED_PROPS.has(String(key))) {
            const rec = obj as Record<string, Value>;
            rec[String(key)] = e.op === "=" ? value : binary(e.op.slice(0, -1) as "+", rec[String(key)], value);
            return rec[String(key)];
          }
        }
        return UNKNOWN;
      }
      case "update": {
        if (e.target.k !== "id") return UNKNOWN;
        const cell = env.find(e.target.name);
        if (!cell || typeof cell.value !== "number") return UNKNOWN;
        const old = cell.value;
        cell.value = old + 1;
        return e.prefix ? cell.value : old;
      }
      case "array": {
        const out: Value[] = [];
        for (const i of e.items) {
          const v = this.eval(i.value, env, file);
          if (v === UNKNOWN) return UNKNOWN;
          if (i.spread && Array.isArray(v)) out.push(...v);
          else out.push(v);
        }
        return out;
      }
      case "object": {
        const out: Record<string, Value> = {};
        for (const p of e.props) {
          const v = this.eval(p.value, env, file);
          if (v === UNKNOWN) return UNKNOWN;
          if (p.spread) Object.assign(out, v);
          else {
            const key = p.computedKey ? String(this.eval(p.computedKey, env, file)) : p.key;
            if (!BLOCKED_PROPS.has(key)) out[key] = v;
          }
        }
        return out;
      }
      case "arrow": {
        const body = e.body;
        const params = e.params;
        if (e.async) return UNKNOWN;
        return (...args: Value[]): Value => {
          const local = new Env(env);
          params.forEach((p, i) => local.define(p.name, args[i] === undefined && p.defaultValue ? this.eval(p.defaultValue, local, file) : args[i]));
          if (!Array.isArray(body)) return this.eval(body, local, file);
          try {
            this.execAll(body, local, file);
          } catch (sig) {
            if (sig instanceof ReturnSignal) return sig.value;
            throw sig;
          }
          return undefined;
        };
      }
      case "range":
        return UNKNOWN;
    }
  }

  private components(file: SinthFile): Map<string, ComponentRef> {
    const cached = this.componentTables.get(file.path);
    if (cached) return cached;
    const table = new Map<string, ComponentRef>();
    this.componentTables.set(file.path, table);
    for (const imp of this.host.getImports(file)) {
      if (imp.kind !== "sinth" || !imp.exports) continue;
      const other = this.host.getFile(imp.specifier);
      const d = imp.decl;
      const byName = (n: string): ComponentRef | undefined => {
        const decl = other.components.find(c => c.name === n);
        return decl ? { decl, file: other } : undefined;
      };
      if (d.sideEffect || (!d.named.length && !d.defaultName && !d.namespace)) {
        for (const c of other.components) table.set(c.name, { decl: c, file: other });
      }
      if (d.defaultName && imp.exports.defaultComponent) {
        const ref = byName(imp.exports.defaultComponent);
        if (ref) table.set(d.defaultName, ref);
      }
      if (d.namespace) for (const c of other.components) table.set(`${d.namespace}.${c.name}`, { decl: c, file: other });
      for (const s of d.named) {
        const ref = byName(s.name);
        if (ref) table.set(s.alias, ref);
      }
    }
    for (const c of file.components) table.set(c.name, { decl: c, file });
    return table;
  }

  private renderNodes(nodes: Node[], scope: RenderScope): string {
    let html = "";
    for (const n of nodes) html += this.renderNode(n, scope);
    return html;
  }

  private renderNode(node: Node, scope: RenderScope): string {
    this.tick();
    switch (node.k) {
      case "text": {
        if (node.expr.k === "call" && node.expr.callee.k === "id") {
          const fn = scope.file.functions.find(f => f.name === (node.expr as { callee: { name: string } }).callee.name && f.view);
          if (fn && fn.view) return this.renderUiFunction(fn, node.expr.args.map(a => this.eval(a.value, scope.env, scope.file)), scope);
        }
        const v = this.eval(node.expr, scope.env, scope.file);
        if (v === UNKNOWN) {
          this.complete = false;
          return "";
        }
        return escapeHtml(toText(v));
      }
      case "element":
        return this.renderElement(node, scope);
      case "if": {
        for (const br of node.branches) {
          const t = br.test ? this.eval(br.test, scope.env, scope.file) : true;
          if (t === UNKNOWN) {
            this.complete = false;
            return "";
          }
          if (t) return this.renderNodes(br.body, { ...scope, env: new Env(scope.env) });
        }
        return "";
      }
      case "for": {
        const list = this.eval(node.iter, scope.env, scope.file);
        if (list === UNKNOWN) {
          this.complete = false;
          return "";
        }
        let html = "";
        let count = 0;
        for (const [item, index, key] of iterate(list)) {
          const env = new Env(scope.env);
          [item, count, key].slice(0, node.names.length).forEach((v, i) => env.define(node.names[i], v));
          void index;
          if (node.filter) {
            const keep = this.eval(node.filter, env, scope.file);
            if (keep === UNKNOWN) this.complete = false;
            if (!keep || keep === UNKNOWN) continue;
          }
          count++;
          html += this.renderNodes(node.body, { ...scope, env });
        }
        if (count === 0 && node.empty) html += this.renderNodes(node.empty, scope);
        return html;
      }
      case "slot": {
        const fill = scope.slots?.[node.name];
        return fill ? fill() : this.renderNodes(node.fallback, scope);
      }
      case "stmt":
        try {
          this.exec(node.stmt, scope.env, scope.file);
        } catch {
          this.complete = false;
        }
        return "";
      case "var":
        this.declare(node.decl, scope.env, scope.file);
        return "";
    }
  }

  private renderUiFunction(fn: FunctionDecl, args: Value[], scope: RenderScope): string {
    const env = new Env(this.moduleEnv(scope.file));
    fn.params.forEach((p, i) => env.define(p.name, args[i] === undefined && p.defaultValue ? this.eval(p.defaultValue, env, scope.file) : args[i]));
    for (const s of fn.body) if (s.k === "var") this.declare(s.decl, env, scope.file);
    return this.renderNodes(fn.view ?? [], { ...scope, env });
  }

  private attrValue(a: Attr, scope: RenderScope): Value {
    if (a.value === null) return true;
    return this.eval(a.value, scope.env, scope.file);
  }

  private renderElement(node: ElementNode, scope: RenderScope): string {
    const comp = scope.compName === node.name && ELEMENTS[node.name] ? undefined : this.components(scope.file).get(node.name);
    if (comp) return this.renderComponent(node, comp, scope);
    if (node.name === "Fragment") return this.renderNodes(node.children, scope);
    if (node.name === "RawHTML" || node.name === "Html") {
      const c = node.attrs.find(a => a.name === "content" || a.name === "html");
      const v = c ? this.attrValue(c, scope) : "";
      if (v === UNKNOWN) {
        this.complete = false;
        return "";
      }
      return toText(v);
    }
    const info = ELEMENTS[node.name];
    if (!info) return "";
    let tag = info.tag;
    const attrs = new Map<string, string>(Object.entries(info.attrs ?? {}));
    const classes: string[] = [];
    if (info.className) classes.push(info.className);
    if (scope.scopeClass) classes.push(scope.scopeClass);
    const styles: string[] = [];
    let inner: string | undefined;
    for (const a of node.attrs) {
      if (a.handler || a.name === "ref" || a.name === "key" || a.name === "...") continue;
      if (a.name === "level" && node.name === "Heading") {
        const lv = this.attrValue(a, scope);
        if (typeof lv === "number") tag = `h${Math.min(6, Math.max(1, lv))}`;
        continue;
      }
      const v = this.attrValue(a, scope);
      if (v === UNKNOWN) {
        this.complete = false;
        continue;
      }
      switch (a.name) {
        case "class":
          classes.push(classValue(v));
          continue;
        case "style":
          if (v && typeof v === "object") {
            for (const [k, sv] of Object.entries(v as Record<string, Value>)) if (sv !== null && sv !== undefined && sv !== false) styles.push(`${kebab(k)}: ${String(sv)}`);
          } else if (typeof v === "string") styles.push(v);
          continue;
        case "model":
        case "bind":
          if (attrs.get("type") === "checkbox" || node.name === "Checkbox") {
            if (v === true) attrs.set("checked", "");
          } else if (tag === "textarea") inner = escapeHtml(toText(v));
          else if (tag !== "select") attrs.set("value", toText(v));
          continue;
        case "hide":
          if (v) styles.push("display: none");
          continue;
        case "show":
          if (!v) styles.push("display: none");
          continue;
        case "delay":
          styles.push("display: none");
          continue;
        case "html":
          inner = toText(v);
          continue;
        default:
          break;
      }
      if (INLINE_STYLE_PROPS.has(a.name) && !((a.name === "width" || a.name === "height") && ["img", "video", "canvas", "iframe", "svg", "input", "rect", "embed", "object", "source"].includes(tag))) {
        if (v !== null && v !== undefined && v !== false) styles.push(`${kebab(a.name)}: ${String(v)}`);
        continue;
      }
      if (v === null || v === undefined || v === false) continue;
      const name = attrNameToHtml(a.name);
      if (/^on/i.test(name)) continue;
      const str = v === true ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      attrs.set(name, /^(href|src|action|formaction|poster)$/.test(name) && /^\s*(javascript|vbscript):/i.test(str) ? "about:blank#blocked" : str);
    }
    const cls = classes.filter(Boolean).join(" ");
    if (cls) attrs.set("class", cls);
    if (styles.length) attrs.set("style", [attrs.get("style"), ...styles].filter(Boolean).join("; "));
    const attrStr = [...attrs].map(([k, v]) => (v === "" && BOOLEAN_ATTRS.has(k) ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`)).join("");
    if (VOID_TAGS.has(tag)) return `<${tag}${attrStr}>`;
    const children = inner ?? this.renderNodes(node.children, scope);
    return `<${tag}${attrStr}>${children}</${tag}>`;
  }

  private renderComponent(node: ElementNode, ref: ComponentRef, scope: RenderScope): string {
    if (++this.depth > 64) {
      this.depth--;
      throw new Error(`Component nesting is deeper than 64 levels at '${node.name}' (recursive component without a stop condition?)`);
    }
    try {
      const decl = ref.decl;
      const moduleEnv = this.moduleEnv(ref.file);
      const env = new Env(moduleEnv);
      const fallthrough: Attr[] = [];
      for (const p of decl.params) {
        const a = node.attrs.find(x => x.name === p.name);
        if (a && !a.handler) env.define(p.name, this.attrValue(a, scope));
        else if (a?.handler) env.define(p.name, UNKNOWN);
        else env.define(p.name, p.defaultValue ? this.eval(p.defaultValue, env, ref.file) : undefined);
      }
      for (const a of node.attrs) if (!decl.params.some(p => p.name === a.name) && !a.handler) fallthrough.push(a);
      for (const v of decl.vars) this.declare(v, env, ref.file);
      if (decl.scripts.length) this.complete = false;
      const slots: Record<string, (() => string) | undefined> = {};
      if (node.children.length) slots.default = () => this.renderNodes(node.children, scope);
      for (const sf of node.slots) slots[sf.name] = () => this.renderNodes(sf.children, scope);
      const scopeClass = `s-${hashString(ref.file.path.replace(/\\/g, "/") + "#" + decl.name).slice(0, 7)}`;
      const inner: RenderScope = { env, file: ref.file, scopeClass, slots, compName: decl.name };
      let html = this.renderNodes(decl.body, inner);
      const vars = this.styleVars(decl, ref.file, env);
      const extraClass = fallthrough.filter(a => a.name === "class").map(a => classValue(this.attrValue(a, scope))).join(" ");
      const extraAttrs = fallthrough
        .filter(a => a.name !== "class" && a.name !== "style" && a.name !== "model" && a.name !== "bind" && a.name !== "ref")
        .map(a => [attrNameToHtml(a.name), this.attrValue(a, scope)] as const)
        .filter(([, v]) => v !== UNKNOWN && v !== null && v !== undefined && v !== false);
      if (vars || extraClass || extraAttrs.length) {
        html = html.replace(/^<([a-zA-Z][\w-]*)((?:\s[^>]*)?)>/, (_m, tag: string, rest: string) => {
          let attrs = rest;
          if (extraClass) attrs = /\sclass="/.test(attrs) ? attrs.replace(/\sclass="([^"]*)"/, (_c, c: string) => ` class="${c} ${escapeAttr(extraClass)}"`) : `${attrs} class="${escapeAttr(extraClass)}"`;
          if (vars) attrs = /\sstyle="/.test(attrs) ? attrs.replace(/\sstyle="([^"]*)"/, (_c, c: string) => ` style="${c}; ${escapeAttr(vars)}"`) : `${attrs} style="${escapeAttr(vars)}"`;
          for (const [k, v] of extraAttrs) if (!new RegExp(`\\s${k}=`).test(attrs)) attrs += v === true ? ` ${k}` : ` ${k}="${escapeAttr(String(v))}"`;
          return `<${tag}${attrs}>`;
        });
      }
      return html;
    } finally {
      this.depth--;
    }
  }

  private styleVars(decl: ComponentDecl, file: SinthFile, env: Env): string {
    const names = new Set([...decl.params.map(p => p.name), ...decl.vars.map(v => v.name)]);
    const parts: string[] = [];
    for (const s of decl.styles) {
      if (s.global) continue;
      const varPrefix = `--sv-${hashString(file.path + decl.name).slice(0, 5)}-`;
      try {
        const res = compileStyle(s.raw, s.lang === "scss" ? "css" : s.lang, { reactiveNames: names, varPrefix, loc: s.loc, sinthSyntax: s.lang === "sinth" });
        for (const e of res.expressions) {
          const expr = Parser.fromTokens(tokenize(e.source, file.path, s.loc), file.path).parseExpr();
          const v = this.eval(expr, env, file);
          if (v !== UNKNOWN && v !== null && v !== undefined) parts.push(`${e.cssVar}: ${toText(v)}`);
        }
      } catch {
        continue;
      }
    }
    return parts.join("; ");
  }
}

function defaultValue(v: VarDecl): Value {
  const t = v.type;
  if (!t || t.nullable) return null;
  if (t.array) return [];
  if (t.base === "str") return "";
  if (t.base === "num" || t.base === "int") return 0;
  if (t.base === "bool") return false;
  return null;
}

function binary(op: string, l: Value, r: Value): Value {
  const a = l as number;
  const b = r as number;
  switch (op) {
    case "+": return (l as string) + (r as string);
    case "-": return a - b;
    case "*": return a * b;
    case "/": return a / b;
    case "%": return a % b;
    case "**": return a ** b;
    case "==": return l === r;
    case "!=": return l !== r;
    case "<": return a < b;
    case ">": return a > b;
    case "<=": return a <= b;
    case ">=": return a >= b;
    default: return UNKNOWN;
  }
}

function getProp(obj: Value, prop: string): Value {
  if (BLOCKED_PROPS.has(prop)) return UNKNOWN;
  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    const v = (Object(obj) as Record<string, Value>)[prop];
    return v === undefined ? undefined : v;
  }
  if (obj && (typeof obj === "object" || typeof obj === "function")) return (obj as Record<string, Value>)[prop];
  return UNKNOWN;
}

const SAFE_GLOBALS: Record<string, Value> = {
  Math, JSON, Number, String, Boolean, Array, Object, Date, parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, Infinity, NaN,
  range: (a: number, b?: number, step = 1): number[] => {
    const s = b === undefined ? 0 : a;
    const e = b === undefined ? a : b;
    const out: number[] = [];
    if (step > 0) for (let i = s; i < e && out.length < 100000; i += step) out.push(i);
    else if (step < 0) for (let i = s; i > e && out.length < 100000; i += step) out.push(i);
    return out;
  },
};

const UNSAFE_FUNCTIONS = new Set<unknown>([Function, Object.defineProperty, Object.defineProperties, Object.setPrototypeOf, Object.assign]);

function isSafeCallable(fn: unknown, thisArg: unknown): boolean {
  if (UNSAFE_FUNCTIONS.has(fn)) return false;
  if (fn === Function.prototype.call || fn === Function.prototype.apply || fn === Function.prototype.bind) return false;
  void thisArg;
  return true;
}

function iterate(value: Value): [Value, number, Value][] {
  if (value === null || value === undefined || value === false) return [];
  if (typeof value === "number") return Array.from({ length: Math.max(0, Math.floor(value)) }, (_, i) => [i, i, i]);
  if (Array.isArray(value)) return value.map((v, i) => [v, i, i]);
  if (value instanceof Map) return Array.from(value.entries()).map(([k, v], i) => [v, i, k]);
  if (typeof value === "string") return Array.from(value).map((v, i) => [v, i, i]);
  if (typeof value === "object") return Object.entries(value as Record<string, Value>).map(([k, v], i) => [v, i, k]);
  return [];
}

export function toText(value: Value): string {
  if (value === null || value === undefined || value === false || value === UNKNOWN) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(toText).join(", ");
  if (value instanceof Date) return value.toLocaleString("en-US");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

function classValue(value: Value): string {
  if (!value || value === UNKNOWN) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(classValue).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.entries(value as Record<string, Value>).filter(([, on]) => !!on).map(([k]) => k).join(" ");
  return String(value);
}

function kebab(name: string): string {
  if (name.startsWith("--")) return name;
  return name.replace(/^(Webkit|Moz|Ms)/, m => "-" + m.toLowerCase()).replace(/[A-Z]/g, m => "-" + m.toLowerCase());
}

export interface PrerenderResult {
  html: string;
  complete: boolean;
  meta: { key: string; value: unknown; known: boolean; loc: MetaEntry["loc"] }[];
}

export function prerenderPage(file: SinthFile, host: PrerenderHost, params?: Record<string, string>): PrerenderResult {
  const p = new Prerenderer(host);
  let html: string | undefined;
  try {
    html = p.renderPage(file, params);
  } catch {
    html = undefined;
  }
  const complete = html !== undefined && p.complete;
  return { html: html ?? "", complete, meta: p.evalMeta(file, params) };
}

export function evaluatePaths(file: SinthFile, host: PrerenderHost, paramNames: string[]): { value: unknown; known: boolean } {
  return new Prerenderer(host).evalPaths(file, paramNames);
}
