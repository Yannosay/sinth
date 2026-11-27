/**
 * The playground preview runs in a sandboxed iframe (opaque origin, no access to the site).
 * Compiled modules arrive by postMessage, are turned into blob URLs inside the frame and the
 * page is booted with the real Sinth runtime.
 */

export interface PreviewPayload {
  type: 'run'
  runtime: string
  modules: { id: string; js: string }[]
  entry: string
  css: string
  body: string
  externalScripts: string[]
  externalStyles: string[]
}

export interface PreviewMessage {
  source: 'sinth-preview'
  type: 'ready' | 'console' | 'error'
  data?: { level?: string; text: string }
}

const RUNNER = `
const send = (type, data) => parent.postMessage({ source: "sinth-preview", type, data }, "*");
const format = v => {
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
};
for (const level of ["log", "info", "warn", "error"]) {
  const original = console[level];
  console[level] = (...args) => {
    send("console", { level, text: args.map(format).join(" ") });
    original.apply(console, args);
  };
}
const report = err => send("error", { text: String((err && err.stack) || (err && err.message) || err) });
addEventListener("error", e => report(e.error || e.message));
addEventListener("unhandledrejection", e => report(e.reason));
globalThis.__sinth_error__ = report;
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("a[href]");
  if (a && !a.getAttribute("href").startsWith("#")) {
    e.preventDefault();
    console.info("Navigation to " + a.getAttribute("href") + " is disabled in the playground");
  }
});
const loadScript = src => new Promise(resolve => {
  const s = document.createElement("script");
  s.src = src;
  s.onload = s.onerror = resolve;
  document.head.appendChild(s);
});
addEventListener("message", async e => {
  const p = e.data;
  if (!p || p.type !== "run") return;
  document.getElementById("sinth-css").textContent = p.css;
  for (const href of p.externalStyles) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
  for (const src of p.externalScripts) await loadScript(src);
  const blob = code => URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  const urls = { "sinth-runtime": blob(p.runtime) };
  const rewrite = code => code.replace(/(\\bfrom\\s*|\\bimport\\s*)(["'])([^"']+)\\2/g, (m, kw, q, spec) => (urls[spec] ? kw + q + urls[spec] + q : m));
  for (const m of p.modules) urls[m.id] = blob(rewrite(m.js));
  document.body.innerHTML = p.body;
  const boot = blob('import * as page from "' + urls[p.entry] + '"; import { boot } from "' + urls["sinth-runtime"] + '"; boot({ render: page.render, state: page.state, restore: page.restore, dev: true });');
  try {
    await import(boot);
  } catch (err) {
    report(err);
  }
});
send("ready");
`

export function previewDocument(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html{color-scheme:light}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}</style>
<style id="sinth-css"></style><script type="module">${RUNNER}</script></head><body></body></html>`
}

/** The <body> contents of a prerendered document. */
export function bodyOf(html: string): string {
  const start = html.indexOf('<body')
  const open = start === -1 ? -1 : html.indexOf('>', start)
  const end = html.lastIndexOf('</body>')
  return open === -1 || end === -1 ? '' : html.slice(open + 1, end)
}
