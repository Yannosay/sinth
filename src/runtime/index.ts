type Getter<T = unknown> = () => T;
type Cleanup = () => void;
type Render = (parent: ParentNode) => void;

interface Owner {
  parent: Owner | null;
  effects: (() => void)[];
  children: Owner[];
  cleanups: Cleanup[];
  disposed: boolean;
  paused: boolean;
}

export interface LoopContext {
  item: unknown;
  index: number;
  key: unknown;
}

export interface Props {
  [name: string]: unknown;
}

export type Slots = Record<string, Render | undefined>;
export type Component = (parent: ParentNode, props: Props, slots: Slots, fallthrough?: (el: Element) => void) => void;

const SVG_NS = "http://www.w3.org/2000/svg";
const BLOCKED_URL = /^\s*(javascript|vbscript|data:(?!image\/(png|gif|jpe?g|webp|avif|svg\+xml)|video\/|audio\/))/i;

let rootOwner: Owner = createOwner(null);
let current: Owner = rootOwner;
let updating = false;
let rerun = false;
let scheduled = false;
let devMode = false;

function createOwner(parent: Owner | null): Owner {
  const owner: Owner = { parent, effects: [], children: [], cleanups: [], disposed: false, paused: false };
  if (parent) parent.children.push(owner);
  return owner;
}

function disposeOwner(owner: Owner): void {
  if (owner.disposed) return;
  owner.disposed = true;
  for (const child of owner.children.slice()) disposeOwner(child);
  for (const fn of owner.cleanups) {
    try {
      fn();
    } catch (err) {
      reportError(err);
    }
  }
  owner.children.length = 0;
  owner.effects.length = 0;
  owner.cleanups.length = 0;
  const parent = owner.parent;
  if (parent) {
    const i = parent.children.indexOf(owner);
    if (i !== -1) parent.children.splice(i, 1);
  }
}

function withOwner<T>(owner: Owner, fn: () => T): T {
  const prev = current;
  current = owner;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

function reportError(err: unknown): void {
  console.error("[sinth]", err);
  const hook = (globalThis as { __sinth_error__?: (e: unknown) => void }).__sinth_error__;
  if (hook) hook(err);
}

function effect(fn: () => void): void {
  const owner = current;
  const guarded = (): void => {
    try {
      fn();
    } catch (err) {
      reportError(err);
    }
  };
  owner.effects.push(guarded);
  guarded();
}

function runOwner(owner: Owner): void {
  if (owner.disposed || owner.paused) return;
  const effects = owner.effects.slice();
  for (const fn of effects) {
    if (owner.disposed) return;
    fn();
  }
  for (const child of owner.children.slice()) runOwner(child);
}

export function update(): void {
  if (updating) {
    rerun = true;
    return;
  }
  updating = true;
  try {
    let passes = 0;
    do {
      rerun = false;
      runOwner(rootOwner);
      if (++passes > 50) {
        console.warn("[sinth] Updates keep changing state (possible infinite loop). Stopped after 50 passes.");
        break;
      }
    } while (rerun);
  } finally {
    updating = false;
  }
}

export function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    update();
  });
}

function settle(result: unknown): void {
  if (result && typeof (result as Promise<unknown>).then === "function") {
    (result as Promise<unknown>).then(schedule, (err: unknown) => {
      reportError(err);
      schedule();
    });
  }
}

export function toText(value: unknown): string {
  if (value === null || value === undefined || value === false) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(toText).join(", ");
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function el(tag: string): HTMLElement {
  return document.createElement(tag);
}

export function svg(tag: string): Element {
  return document.createElementNS(SVG_NS, tag);
}

const templateCache = new Map<string, HTMLTemplateElement>();

export function tpl(html: string, svgContext = false): DocumentFragment {
  let t = templateCache.get(html);
  if (!t) {
    t = document.createElement("template");
    t.innerHTML = svgContext ? `<svg>${html}</svg>` : html;
    templateCache.set(html, t);
  }
  const clone = t.content.cloneNode(true) as DocumentFragment;
  if (svgContext) {
    const frag = document.createDocumentFragment();
    const wrapper = clone.firstChild as Element;
    while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
    return frag;
  }
  return clone;
}

export function text(parent: ParentNode, get: Getter): void {
  const node = document.createTextNode("");
  parent.appendChild(node);
  let last: string | undefined;
  effect(() => {
    const value = toText(get());
    if (value !== last) {
      last = value;
      node.data = value;
    }
  });
}

export function sanitizeUrl(value: string): string {
  if (BLOCKED_URL.test(value)) {
    if (devMode) console.warn(`[sinth] Blocked unsafe URL: ${value.slice(0, 64)}`);
    return "about:blank#blocked";
  }
  return value;
}

const URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster", "cite", "background", "xlink:href", "data"]);

function setAttr(node: Element, name: string, value: unknown): void {
  if (value === null || value === undefined || value === false) {
    node.removeAttribute(name);
    return;
  }
  if (value === true) {
    node.setAttribute(name, "");
    return;
  }
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  node.setAttribute(name, URL_ATTRS.has(name) ? sanitizeUrl(str) : str);
}

export function attr(node: Element, name: string, get: Getter): void {
  if (/^on/i.test(name)) throw new Error(`[sinth] Refusing to bind event attribute '${name}' as a string`);
  let last: unknown = {};
  effect(() => {
    const value = get();
    if (value !== last) {
      last = value;
      setAttr(node, name, value);
    }
  });
}

export function prop(node: Element, name: string, get: Getter): void {
  const target = node as unknown as Record<string, unknown>;
  effect(() => {
    const value = get();
    if (target[name] !== value) target[name] = value;
  });
}

export function classValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(classValue).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).filter(([, on]) => !!on).map(([k]) => k).join(" ");
  }
  return String(value);
}

export function cls(node: Element, get: Getter): void {
  let applied: string[] = [];
  effect(() => {
    const next = classValue(get()).split(/\s+/).filter(Boolean);
    for (const c of applied) if (!next.includes(c)) node.classList.remove(c);
    for (const c of next) if (!applied.includes(c)) node.classList.add(c);
    applied = next;
  });
}

function kebab(name: string): string {
  if (name.startsWith("--")) return name;
  return name.replace(/^(Webkit|Moz|Ms)/, m => "-" + m.toLowerCase()).replace(/[A-Z]/g, m => "-" + m.toLowerCase());
}

function styleText(value: unknown): string {
  if (value === null || value === undefined || value === false) return "";
  if (typeof value === "number") return String(value);
  return String(value);
}

export function style(node: HTMLElement | SVGElement, get: Getter): void {
  let applied = new Set<string>();
  effect(() => {
    const value = get();
    if (typeof value === "string" || value === null || value === undefined) {
      const css = value ?? "";
      if (node.style.cssText !== css) node.style.cssText = css;
      applied = new Set();
      return;
    }
    const next = new Set<string>();
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const name = kebab(k);
      next.add(name);
      const str = styleText(v);
      if (node.style.getPropertyValue(name) !== str) node.style.setProperty(name, str);
    }
    for (const name of applied) if (!next.has(name)) node.style.removeProperty(name);
    applied = next;
  });
}

export function styleProp(node: HTMLElement | SVGElement, name: string, get: Getter): void {
  const prop = kebab(name);
  effect(() => {
    const str = styleText(get());
    if (node.style.getPropertyValue(prop) !== str) {
      if (str) node.style.setProperty(prop, str);
      else node.style.removeProperty(prop);
    }
  });
}

export function cssVars(nodes: (Element | null)[], vars: Record<string, Getter>): void {
  for (const node of nodes) {
    if (!node || !("style" in node)) continue;
    for (const [name, get] of Object.entries(vars)) styleProp(node as HTMLElement, name, get);
  }
}

export function show(node: HTMLElement | SVGElement, get: Getter): void {
  let initial: string | null = null;
  effect(() => {
    const visible = !!get();
    if (initial === null) initial = node.style.display === "none" ? "" : node.style.display;
    const next = visible ? initial : "none";
    if (node.style.display !== next) node.style.display = next;
  });
}

const KEY_ALIASES: Record<string, string[]> = {
  enter: ["Enter"], esc: ["Escape"], escape: ["Escape"], space: [" ", "Spacebar"], tab: ["Tab"],
  up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"], delete: ["Delete", "Backspace"],
  backspace: ["Backspace"],
};

const LISTENER_OPTIONS = new Set(["capture", "passive", "once"]);

export function on(node: EventTarget, event: string, handler: (e: Event) => unknown, modifiers: string[] = []): void {
  const keys = modifiers.filter(m => KEY_ALIASES[m] || /^key[A-Z0-9]/.test(m));
  const systemKeys = modifiers.filter(m => m === "ctrl" || m === "shift" || m === "alt" || m === "meta");
  const listener = (e: Event): void => {
    if (modifiers.includes("self") && e.target !== e.currentTarget) return;
    if (keys.length) {
      const key = (e as KeyboardEvent).key;
      const ok = keys.some(k => (KEY_ALIASES[k] ? KEY_ALIASES[k].includes(key) : key.toLowerCase() === k.slice(3).toLowerCase()));
      if (!ok) return;
    }
    for (const sk of systemKeys) if (!(e as KeyboardEvent)[`${sk}Key` as "ctrlKey"]) return;
    if (modifiers.includes("prevent")) e.preventDefault();
    if (modifiers.includes("stop")) e.stopPropagation();
    let result: unknown;
    try {
      result = handler(e);
    } catch (err) {
      reportError(err);
    }
    update();
    settle(result);
  };
  const options: AddEventListenerOptions = {};
  for (const m of modifiers) if (LISTENER_OPTIONS.has(m)) options[m as "capture"] = true;
  node.addEventListener(event, listener, options);
  const owner = current;
  if (node === window || node === document) owner.cleanups.push(() => node.removeEventListener(event, listener, options));
}

export function model(node: HTMLElement, get: Getter, set: (v: unknown) => void, numeric = false): void {
  const input = node as HTMLInputElement;
  const tag = node.tagName;
  const type = (input.type || "").toLowerCase();
  if (type === "checkbox") {
    effect(() => {
      const v = get();
      const checked = Array.isArray(v) ? v.includes(input.value) : !!v;
      if (input.checked !== checked) input.checked = checked;
    });
    on(node, "change", () => {
      const v = get();
      if (Array.isArray(v)) {
        const next = v.filter(x => x !== input.value);
        if (input.checked) next.push(input.value);
        set(next);
      } else set(input.checked);
    });
    return;
  }
  if (type === "radio") {
    effect(() => {
      const checked = String(get()) === input.value;
      if (input.checked !== checked) input.checked = checked;
    });
    on(node, "change", () => {
      if (input.checked) set(numeric ? Number(input.value) : input.value);
    });
    return;
  }
  if (tag === "SELECT" && (node as HTMLSelectElement).multiple) {
    const select = node as HTMLSelectElement;
    effect(() => {
      const v = get();
      const values = Array.isArray(v) ? v.map(String) : [];
      for (const opt of Array.from(select.options)) opt.selected = values.includes(opt.value);
    });
    on(node, "change", () => set(Array.from(select.selectedOptions).map(o => (numeric ? Number(o.value) : o.value))));
    return;
  }
  const isNumber = numeric || type === "number" || type === "range";
  effect(() => {
    const v = get();
    const str = v === null || v === undefined ? "" : String(v);
    if (input.value !== str && !(isNumber && Number(input.value) === v && input.value !== "")) {
      input.value = str;
    }
  });
  const evt = tag === "SELECT" || type === "range" || type === "color" || type === "date" || type === "file" ? "change" : "input";
  on(node, evt, () => {
    if (!isNumber) {
      set(input.value);
      return;
    }
    if (input.value === "") return;
    const n = Number(input.value);
    if (!Number.isNaN(n)) set(n);
  });
  if (evt === "change" && type === "range") on(node, "input", () => set(Number(input.value)));
}

export function ref(node: Element, set: (el: Element | null) => void): void {
  set(node);
  current.cleanups.push(() => set(null));
}

function makeRange(parent: ParentNode, label: string): [Comment, Comment] {
  const start = document.createComment(devMode ? label : "");
  const end = document.createComment(devMode ? "/" + label : "");
  parent.appendChild(start);
  parent.appendChild(end);
  return [start, end];
}

function clearRange(start: Node, end: Node): void {
  const parent = end.parentNode;
  if (!parent) return;
  while (start.nextSibling && start.nextSibling !== end) parent.removeChild(start.nextSibling);
}

function takeRange(start: Node, end: Node): DocumentFragment {
  const frag = document.createDocumentFragment();
  while (start.nextSibling && start.nextSibling !== end) frag.appendChild(start.nextSibling);
  return frag;
}

function renderInto(owner: Owner, render: Render): DocumentFragment {
  const frag = document.createDocumentFragment();
  withOwner(owner, () => render(frag));
  return frag;
}

interface IfOptions {
  persist?: boolean;
  delay?: Getter<number>;
  transition?: string;
}

interface Branch {
  owner: Owner;
  saved: DocumentFragment | null;
}

export function when(parent: ParentNode, branches: [Getter | null, Render][], options: IfOptions = {}): void {
  const [start, end] = makeRange(parent, "if");
  const owner = current;
  let active = -2;
  let branch: Branch | null = null;
  const cache = new Map<number, Branch>();

  const remove = (b: Branch, index: number): void => {
    if (options.persist) {
      b.owner.paused = true;
      b.saved = takeRange(start, end);
      cache.set(index, b);
      return;
    }
    const delay = options.delay ? Number(options.delay()) : 0;
    if (delay > 0 || options.transition) {
      const leaving = Array.from(takeRange(start, end).childNodes);
      for (const n of leaving) {
        start.parentNode?.insertBefore(n, start);
        if (n instanceof Element && options.transition) n.classList.add(`${options.transition}-leave`);
      }
      setTimeout(() => {
        for (const n of leaving) n.parentNode?.removeChild(n);
        disposeOwner(b.owner);
      }, delay || 200);
      return;
    }
    clearRange(start, end);
    disposeOwner(b.owner);
  };

  effect(() => {
    let next = -1;
    for (let i = 0; i < branches.length; i++) {
      const test = branches[i][0];
      if (test === null || test()) {
        next = i;
        break;
      }
    }
    if (next === active) return;
    if (branch) remove(branch, active);
    active = next;
    branch = null;
    if (next === -1) return;
    const cached = cache.get(next);
    if (cached && cached.saved) {
      cached.owner.paused = false;
      end.parentNode?.insertBefore(cached.saved, end);
      cached.saved = null;
      cache.delete(next);
      branch = cached;
      return;
    }
    const childOwner = createOwner(owner);
    const frag = renderInto(childOwner, branches[next][1]);
    if (options.transition) {
      for (const n of Array.from(frag.childNodes)) {
        if (n instanceof Element) {
          n.classList.add(`${options.transition}-enter`);
          requestAnimationFrame(() => requestAnimationFrame(() => n.classList.remove(`${options.transition}-enter`)));
        }
      }
    }
    end.parentNode?.insertBefore(frag, end);
    branch = { owner: childOwner, saved: null };
  });
}

interface Row {
  ctx: LoopContext;
  owner: Owner;
  start: Comment;
  end: Comment;
}

export function iterate(value: unknown): LoopContext[] {
  if (value === null || value === undefined || value === false) return [];
  if (typeof value === "number") return range(value).map((n, i) => ({ item: n, index: i, key: i }));
  if (Array.isArray(value)) return value.map((item, index) => ({ item, index, key: index }));
  if (value instanceof Map) return Array.from(value.entries()).map(([key, item], index) => ({ item, index, key }));
  if (typeof (value as Iterable<unknown>)[Symbol.iterator] === "function" && typeof value !== "string") {
    return Array.from(value as Iterable<unknown>).map((item, index) => ({ item, index, key: index }));
  }
  if (typeof value === "string") return Array.from(value).map((item, index) => ({ item, index, key: index }));
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([key, item], index) => ({ item, index, key }));
  }
  return [];
}

export function each(
  parent: ParentNode,
  list: Getter,
  render: (parent: ParentNode, ctx: LoopContext) => void,
  keyOf?: (ctx: LoopContext) => unknown,
  filter?: (ctx: LoopContext) => unknown,
  empty?: Render,
): void {
  const [start, end] = makeRange(parent, "for");
  const owner = current;
  let rows = new Map<unknown, Row>();
  let emptyOwner: Owner | null = null;

  effect(() => {
    let entries = iterate(list());
    if (filter) entries = entries.filter(ctx => !!filter(ctx));
    const next = new Map<unknown, Row>();
    const order: Row[] = [];
    entries.forEach((ctx, position) => {
      ctx.index = position;
      let key = keyOf ? keyOf(ctx) : typeof ctx.item === "object" && ctx.item !== null ? ctx.item : ctx.key;
      if (next.has(key)) {
        if (devMode) console.warn("[sinth] Duplicate key in for loop:", key);
        key = { duplicate: key, position };
      }
      let row = rows.get(key);
      if (row) {
        row.ctx.item = ctx.item;
        row.ctx.index = ctx.index;
        row.ctx.key = ctx.key;
        rows.delete(key);
      } else {
        const childOwner = createOwner(owner);
        const rowStart = document.createComment("");
        const rowEnd = document.createComment("");
        const rowCtx: LoopContext = { item: ctx.item, index: ctx.index, key: ctx.key };
        const frag = document.createDocumentFragment();
        frag.appendChild(rowStart);
        withOwner(childOwner, () => render(frag, rowCtx));
        frag.appendChild(rowEnd);
        row = { ctx: rowCtx, owner: childOwner, start: rowStart, end: rowEnd };
        end.parentNode?.insertBefore(frag, end);
      }
      next.set(key, row);
      order.push(row);
    });
    for (const row of rows.values()) {
      clearRange(row.start, row.end);
      row.start.remove();
      row.end.remove();
      disposeOwner(row.owner);
    }
    rows = next;
    const host = end.parentNode;
    if (host) {
      let prev: Node = start;
      for (const row of order) {
        if (prev.nextSibling !== row.start) {
          const frag = document.createDocumentFragment();
          let n: Node | null = row.start;
          while (n) {
            const following: Node | null = n.nextSibling;
            frag.appendChild(n);
            if (n === row.end) break;
            n = following;
          }
          host.insertBefore(frag, prev.nextSibling);
        }
        prev = row.end;
      }
    }
    if (empty) {
      if (order.length === 0 && !emptyOwner) {
        emptyOwner = createOwner(owner);
        const frag = renderInto(emptyOwner, empty);
        end.parentNode?.insertBefore(frag, end);
      } else if (order.length > 0 && emptyOwner) {
        disposeOwner(emptyOwner);
        emptyOwner = null;
        let n = start.nextSibling;
        while (n && n !== end && !rowsHasStart(rows, n)) {
          const following = n.nextSibling;
          n.parentNode?.removeChild(n);
          n = following;
        }
      }
    }
  });
}

function rowsHasStart(rows: Map<unknown, Row>, node: Node): boolean {
  for (const row of rows.values()) if (row.start === node) return true;
  return false;
}

export function html(parent: ParentNode, get: Getter<unknown>): void {
  const [start, end] = makeRange(parent, "html");
  let last: string | undefined;
  effect(() => {
    const value = toText(get());
    if (value === last) return;
    last = value;
    clearRange(start, end);
    const t = document.createElement("template");
    t.innerHTML = value;
    end.parentNode?.insertBefore(t.content, end);
  });
}

export function component(parent: ParentNode, comp: Component, props: Props, slots: Slots, fallthrough?: (el: Element) => void): Element | null {
  const before = parent.lastChild;
  const owner = createOwner(current);
  withOwner(owner, () => comp(parent, props, slots, fallthrough));
  let n = before ? before.nextSibling : parent.firstChild;
  while (n && n.nodeType !== 1) n = n.nextSibling;
  return n as Element | null;
}

export function slot(parent: ParentNode, slots: Slots, name: string, fallback?: Render): void {
  const fill = slots[name];
  if (fill) fill(parent);
  else if (fallback) fallback(parent);
}

export function onMount(fn: () => unknown): void {
  queueMicrotask(() => {
    try {
      const cleanup = fn();
      if (typeof cleanup === "function") current.cleanups.push(cleanup as Cleanup);
      settle(cleanup);
    } catch (err) {
      reportError(err);
    }
    update();
  });
}

export function onDestroy(fn: Cleanup): void {
  current.cleanups.push(fn);
}

function snapshot(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return value;
  }
}

export function watch(get: Getter, fn: (value: unknown, previous: unknown) => unknown): void {
  let first = true;
  let last: unknown;
  let lastValue: unknown;
  effect(() => {
    const value = get();
    const snap = snapshot(value);
    if (first) {
      first = false;
      last = snap;
      lastValue = value;
      return;
    }
    if (Object.is(snap, last)) return;
    const prev = lastValue;
    last = snap;
    lastValue = value;
    settle(fn(value, prev));
    rerun = true;
  });
}

export function persisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function persist(key: string, get: Getter): void {
  let last: string | undefined;
  effect(() => {
    let raw: string;
    try {
      raw = JSON.stringify(get());
    } catch {
      return;
    }
    if (raw === last) return;
    last = raw;
    try {
      localStorage.setItem(key, raw);
    } catch {
      return;
    }
  });
}

const memoCache = new Map<string, Map<string, unknown>>();

export function memo<T>(site: string, fn: () => T, args: unknown[]): T {
  let cache = memoCache.get(site);
  if (!cache) {
    cache = new Map();
    memoCache.set(site, cache);
  }
  let key: string;
  try {
    key = JSON.stringify(args);
  } catch {
    return fn();
  }
  if (cache.has(key)) return cache.get(key) as T;
  const value = fn();
  cache.set(key, value);
  return value;
}

export function range(a: number, b?: number, step = 1): number[] {
  const startN = b === undefined ? 0 : a;
  const endN = b === undefined ? a : b;
  if (step === 0) throw new Error("range() step cannot be 0");
  const out: number[] = [];
  if (step > 0) for (let i = startN; i < endN; i += step) out.push(i);
  else for (let i = startN; i > endN; i += step) out.push(i);
  return out;
}

export function iter(value: unknown): [unknown, number, unknown][] {
  return iterate(value).map(ctx => [ctx.item, ctx.index, ctx.key]);
}

export function injectCss(id: string, css: string): void {
  if (typeof document === "undefined" || document.getElementById(id)) return;
  const tag = document.createElement("style");
  tag.id = id;
  tag.textContent = css;
  document.head.appendChild(tag);
}

export interface MountedApp {
  update(): void;
  dispose(): void;
}

export interface PageModule {
  render: Render;
  state?: () => Record<string, unknown>;
  restore?: (state: Record<string, unknown>) => void;
  dev?: boolean;
}

export function mount(target: Element, render: Render): MountedApp {
  const owner = createOwner(rootOwner);
  const frag = renderInto(owner, render);
  target.replaceChildren(frag);
  return {
    update,
    dispose: () => {
      disposeOwner(owner);
      target.replaceChildren();
    },
  };
}

interface HotGlobal {
  __sinth_app__?: { dispose(): void };
  __sinth_hmr_state__?: Record<string, unknown>;
  sinthRender?: () => void;
  sinth?: { update(): void; schedule(): void };
}

export function boot(page: PageModule): void {
  devMode = !!page.dev;
  const g = globalThis as unknown as HotGlobal;
  if (g.__sinth_hmr_state__ && page.restore) {
    page.restore(g.__sinth_hmr_state__);
    g.__sinth_hmr_state__ = undefined;
  }
  g.sinthRender = update;
  g.sinth = { update, schedule };
  const start = (): void => {
    const app = mount(document.body, page.render);
    g.__sinth_app__ = {
      dispose: () => {
        if (page.state) g.__sinth_hmr_state__ = page.state();
        app.dispose();
        rootOwner = createOwner(null);
        current = rootOwner;
      },
    };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

export function defineElement(tag: string, comp: Component, params: [string, string][], css?: [string, string]): void {
  if (typeof customElements === "undefined" || customElements.get(tag)) return;
  const kinds = new Map(params);
  const attrNames = params.map(([name]) => kebab(name));
  class SinthElement extends HTMLElement {
    private app: MountedApp | null = null;
    private readonly values: Record<string, unknown> = {};

    static get observedAttributes(): string[] {
      return attrNames;
    }

    connectedCallback(): void {
      if (css) injectCss(css[0], css[1]);
      if (this.app) return;
      for (const name of kinds.keys()) {
        const own = (this as unknown as Record<string, unknown>)[name];
        if (own !== undefined) this.values[name] = own;
        const attrValue = this.getAttribute(kebab(name));
        if (attrValue !== null) this.values[name] = coerce(attrValue, kinds.get(name));
        Object.defineProperty(this, name, {
          get: () => this.values[name],
          set: (v: unknown) => {
            this.values[name] = v;
            update();
          },
          configurable: true,
        });
      }
      const props: Props = {};
      for (const name of kinds.keys()) Object.defineProperty(props, name, { get: () => this.values[name], enumerable: true });
      const slots: Slots = {};
      const light = Array.from(this.childNodes);
      if (light.length) slots.default = (p: ParentNode): void => light.forEach(n => p.appendChild(n));
      this.app = mount(this, (p: ParentNode) => component(p, comp, props, slots));
    }

    disconnectedCallback(): void {
      this.app?.dispose();
      this.app = null;
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      const key = params.find(([n]) => kebab(n) === name)?.[0];
      if (!key) return;
      this.values[key] = value === null ? undefined : coerce(value, kinds.get(key));
      update();
    }
  }
  customElements.define(tag, SinthElement);
}

function coerce(value: string, kind: string | undefined): unknown {
  if (kind === "num" || kind === "int") return Number(value);
  if (kind === "bool") return value !== "false";
  if (kind === "obj" || (kind && kind.endsWith("[]"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

let routeParams: Record<string, string> | undefined;

/** Reads a route parameter of a dynamic page (`pages/blog/[slug].sinth`). */
export function param(name: string): string {
  if (!routeParams) {
    const node = typeof document !== "undefined" ? document.getElementById("sinth-params") : null;
    try {
      routeParams = node?.textContent ? (JSON.parse(node.textContent) as Record<string, string>) : {};
    } catch {
      routeParams = {};
    }
  }
  return routeParams[name] ?? "";
}
