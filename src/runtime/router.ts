/**
 * Client-side navigation for multi-page Sinth sites.
 *
 * Same-origin links are fetched and swapped in place instead of triggering a full page load:
 * the head is reconciled (title, meta, stylesheets), the prerendered body is shown at once and
 * the next page's module boots on top of it. Anything unexpected falls back to a normal load.
 */

interface RouterGlobal {
  __sinth_router__?: boolean;
  __sinth_app__?: { dispose(keepState?: boolean): void };
}

interface HistoryState {
  sinth: true;
  scroll: number;
}

const ENTRY_ATTR = "data-sinth-entry";
const RELOAD_ATTR = "data-reload";
const PREFETCH_DELAY = 65;

const g = globalThis as unknown as RouterGlobal;
const cache = new Map<string, Promise<Response | null>>();
const executed = new Set<string>();
let token = 0;
let shown = "";

function pageKey(url: URL): string {
  return url.origin + url.pathname + url.search;
}

function eligible(a: HTMLAnchorElement, e?: MouseEvent): URL | null {
  if (e && (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return null;
  if (!a.href || a.hasAttribute("download") || a.hasAttribute(RELOAD_ATTR)) return null;
  if (a.target && a.target !== "_self") return null;
  if ((a.getAttribute("rel") ?? "").split(/\s+/).includes("external")) return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return null;
  const last = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
  if (/\.[a-z0-9]+$/i.test(last) && !/\.html?$/i.test(last)) return null;
  if (pageKey(url) === shown && url.hash) return null;
  return url;
}

function load(url: URL): Promise<Response | null> {
  const key = pageKey(url);
  let pending = cache.get(key);
  if (!pending) {
    pending = fetch(key, { headers: { Accept: "text/html" }, credentials: "same-origin" })
      .then(res => (res.headers.get("content-type") ?? "").includes("text/html") ? res : null)
      .catch(() => null);
    cache.set(key, pending);
    pending.then(res => { if (!res || !res.ok) cache.delete(key); });
  }
  return pending.then(res => res?.clone() ?? null);
}

function headKey(node: Element): string | null {
  switch (node.tagName) {
    case "TITLE": return null;
    case "META": return "meta:" + (node.getAttribute("name") ?? node.getAttribute("property") ?? node.getAttribute("http-equiv") ?? node.getAttribute("charset") ?? "");
    case "LINK": return "link:" + node.getAttribute("rel") + ":" + node.getAttribute("href");
    case "SCRIPT": return node.id ? "script#" + node.id : "script:" + (node.getAttribute("src") ?? node.textContent);
    case "STYLE": return "style:" + (node.id || node.textContent);
    case "BASE": return "base";
    default: return null;
  }
}

/** Brings the live head in line with the next document. New stylesheets load before the swap to avoid a flash of unstyled content. */
async function syncHead(next: Document): Promise<void> {
  document.title = next.title;
  const current = new Map<string, Element>();
  for (const node of Array.from(document.head.children)) {
    const key = headKey(node);
    if (key) current.set(key, node);
  }
  const loading: Promise<unknown>[] = [];
  const keep = new Set<Element>();
  for (const node of Array.from(next.head.children)) {
    const key = headKey(node);
    if (!key) continue;
    const existing = current.get(key);
    if (existing && (node.tagName !== "SCRIPT" || !node.id) && existing.outerHTML === node.outerHTML) {
      keep.add(existing);
      continue;
    }
    if (node.tagName === "SCRIPT" && (node as HTMLScriptElement).type === "module" && node.hasAttribute(ENTRY_ATTR)) continue;
    const clone = node.tagName === "SCRIPT" ? recreateScript(node as HTMLScriptElement) : document.importNode(node, true);
    if (clone instanceof HTMLLinkElement && clone.rel === "stylesheet") {
      loading.push(new Promise(resolve => { clone.onload = clone.onerror = resolve; }));
    }
    document.head.appendChild(clone);
    keep.add(clone);
  }
  await Promise.all(loading);
  for (const node of current.values()) {
    if (keep.has(node) || (node.tagName === "STYLE" && node.id.startsWith("sinth-"))) continue;
    if (node.tagName === "SCRIPT" && (node as HTMLScriptElement).src.includes("/__sinth/")) continue;
    node.remove();
  }
}

function recreateScript(source: HTMLScriptElement): HTMLScriptElement {
  const script = document.createElement("script");
  for (const { name, value } of Array.from(source.attributes)) script.setAttribute(name, value);
  script.textContent = source.textContent;
  return script;
}

function entryOf(doc: Document): string | null {
  const script = doc.querySelector<HTMLScriptElement>(`script[type="module"][${ENTRY_ATTR}]`);
  return script ? new URL(script.getAttribute("src") ?? "", location.href).href : null;
}

function scrollTo(url: URL, restore?: number): void {
  if (restore !== undefined) {
    window.scrollTo(0, restore);
    return;
  }
  const target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
  if (target) target.scrollIntoView();
  else window.scrollTo(0, 0);
}

function saveScroll(): void {
  history.replaceState({ ...(history.state as object | null), sinth: true, scroll: window.scrollY }, "");
}

async function navigate(url: URL, mode: "push" | "pop", restore?: number): Promise<void> {
  const id = ++token;
  const res = await load(url);
  if (id !== token) return;
  if (!res) {
    location.href = url.href;
    return;
  }
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  if (id !== token) return;
  const generator = doc.querySelector('meta[name="generator"]')?.getAttribute("content") ?? "";
  if (!generator.startsWith("Sinth") || doc.documentElement.hasAttribute(RELOAD_ATTR)) {
    location.href = url.href;
    return;
  }
  if (mode === "push") {
    saveScroll();
    history.pushState({ sinth: true, scroll: 0 } satisfies HistoryState, "", url.href);
  }
  await syncHead(doc);
  if (id !== token) return;
  g.__sinth_app__?.dispose(false);
  g.__sinth_app__ = undefined;
  document.documentElement.lang = doc.documentElement.lang;
  document.documentElement.className = doc.documentElement.className;
  document.body.className = doc.body.className;
  document.body.replaceChildren(...Array.from(doc.body.childNodes).map(n => document.importNode(n, true)));
  shown = pageKey(url);
  scrollTo(url, restore);
  const entry = entryOf(doc);
  if (entry) {
    const src = executed.has(entry) ? `${entry}${entry.includes("?") ? "&" : "?"}v=${id}` : entry;
    executed.add(entry);
    try {
      await import(/* @vite-ignore */ src);
    } catch {
      location.href = url.href;
      return;
    }
  }
  window.dispatchEvent(new CustomEvent("sinth:navigate", { detail: { url: url.href } }));
}

function start(): void {
  if (g.__sinth_router__ || typeof history === "undefined" || !window.fetch || !window.DOMParser) return;
  g.__sinth_router__ = true;
  shown = pageKey(new URL(location.href));
  const first = entryOf(document);
  if (first) executed.add(first);
  history.scrollRestoration = "manual";
  history.replaceState({ ...(history.state as object | null), sinth: true, scroll: window.scrollY }, "");

  document.addEventListener("click", e => {
    const a = (e.target as Element | null)?.closest?.("a");
    if (!(a instanceof HTMLAnchorElement)) return;
    const url = eligible(a, e);
    if (!url) return;
    e.preventDefault();
    void navigate(url, "push");
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const prefetch = (e: Event): void => {
    const a = (e.target as Element | null)?.closest?.("a");
    if (!(a instanceof HTMLAnchorElement)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const url = eligible(a);
      if (url && pageKey(url) !== shown) void load(url);
    }, PREFETCH_DELAY);
  };
  document.addEventListener("pointerover", prefetch, { passive: true });
  document.addEventListener("focusin", prefetch, { passive: true });
  document.addEventListener("touchstart", prefetch, { passive: true });

  window.addEventListener("popstate", e => {
    const url = new URL(location.href);
    if (pageKey(url) === shown) return;
    void navigate(url, "pop", (e.state as HistoryState | null)?.scroll ?? 0);
  });
  window.addEventListener("pagehide", saveScroll);
}

start();
