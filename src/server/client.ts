export const DEV_CLIENT = String.raw`
const OVERLAY_ID = "__sinth_overlay";
const state = { hashes: null, connected: false };

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function currentRoute() {
  let p = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function showOverlay(title, message, kind) {
  hideOverlay();
  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    ".backdrop{position:fixed;inset:0;z-index:2147483647;background:rgba(10,10,11,.86);backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#F5F5F6}" +
    ".panel{width:min(920px,100%);background:#141416;border:1px solid #2a2a2e;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden}" +
    ".head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #2a2a2e}" +
    ".badge{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:4px 8px;border-radius:6px;background:" + (kind === "runtime" ? "#3b2a10;color:#fbbf24" : "#3a1418;color:#f87171") + "}" +
    ".title{font-size:15px;font-weight:600;flex:1}" +
    "button{all:unset;cursor:pointer;color:#a1a1aa;font-size:13px;padding:6px 10px;border-radius:6px}button:hover{background:#232327;color:#F5F5F6}" +
    "pre{margin:0;padding:20px;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;color:#e4e4e7}" +
    ".foot{padding:12px 20px;border-top:1px solid #2a2a2e;font-size:12px;color:#71717a}" +
    "</style>" +
    "<div class='backdrop'><div class='panel' role='alertdialog' aria-modal='true'>" +
    "<div class='head'><span class='badge'>" + (kind === "runtime" ? "Runtime error" : "Compile error") + "</span><span class='title'>" + escapeHtml(title) + "</span><button type='button'>Dismiss (Esc)</button></div>" +
    "<pre>" + escapeHtml(message) + "</pre>" +
    "<div class='foot'>Fix the problem and save. The page updates automatically.</div>" +
    "</div></div>";
  root.querySelector("button").addEventListener("click", hideOverlay);
  document.documentElement.appendChild(host);
}

function hideOverlay() {
  const el = document.getElementById(OVERLAY_ID);
  if (el) el.remove();
}

addEventListener("keydown", e => { if (e.key === "Escape") hideOverlay(); });

globalThis.__sinth_error__ = err => {
  showOverlay(err && err.message ? err.message : String(err), err && err.stack ? err.stack : String(err), "runtime");
};
addEventListener("error", e => { if (e.error) globalThis.__sinth_error__(e.error); });
addEventListener("unhandledrejection", e => globalThis.__sinth_error__(e.reason));

function swapCss(href) {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  const base = href.split("?")[0];
  const old = links.find(l => l.getAttribute("href").split("?")[0] === base);
  const next = document.createElement("link");
  next.rel = "stylesheet";
  next.href = base + "?t=" + Date.now();
  next.onload = () => { if (old) old.remove(); };
  if (old) old.after(next); else document.head.appendChild(next);
}

async function hotSwap(js) {
  const app = globalThis.__sinth_app__;
  if (app) app.dispose();
  await import(js + "?t=" + Date.now());
}

function apply(pages) {
  const route = currentRoute();
  const me = pages.find(p => p.route === route);
  const prev = state.hashes && state.hashes.find(p => p.route === route);
  state.hashes = pages;
  if (!me || !prev) return;
  if (me.head !== prev.head || (!!me.js) !== (!!prev.js) || (!me.js && me.body !== prev.body)) {
    location.reload();
    return;
  }
  if (me.cssHash !== prev.cssHash && me.css) swapCss(me.css);
  if (me.jsHash !== prev.jsHash && me.js) hotSwap(me.js).catch(err => { console.error(err); location.reload(); });
}

function connect() {
  const es = new EventSource("/__sinth/events");
  es.onopen = () => {
    if (state.connected === "lost") location.reload();
    state.connected = true;
  };
  es.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === "error") showOverlay(msg.title, msg.message, "compile");
    else if (msg.type === "reload") location.reload();
    else if (msg.type === "update") {
      hideOverlay();
      if (msg.full) location.reload();
      else apply(msg.pages);
    } else if (msg.type === "init") {
      state.hashes = msg.pages;
      if (msg.error) showOverlay(msg.error.title, msg.error.message, "compile");
    }
  };
  es.onerror = () => {
    if (state.connected === true) state.connected = "lost";
  };
}
connect();
`;
