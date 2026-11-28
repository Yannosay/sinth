// Native features for sinth:desktop. In an app built with `sinth desktop` the calls go to the Tauri
// plugins set up in src-tauri/; in a browser each one falls back to the closest web API, so the same
// pages work as a website and as a desktop app.

const tauri = () => globalThis.__TAURI_INTERNALS__;

export function isDesktop() {
  return !!tauri();
}

function invoke(cmd, args, options) {
  return tauri().invoke(cmd, args, options);
}

function basename(p) {
  return String(p).split(/[\\/]/).pop() || String(p);
}

// ".txt,.md,text/csv" -> one dialog filter with the extensions (MIME types only apply in browsers).
function filters(accept) {
  const extensions = String(accept || "").split(",").map(s => s.trim()).filter(s => s.startsWith(".")).map(s => s.slice(1));
  return extensions.length ? [{ name: extensions.map(e => e.toUpperCase()).join(", "), extensions }] : undefined;
}

function decode(bytes) {
  return new TextDecoder().decode(bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes));
}

/** Lets the user pick a text file. Resolves to { name, path, text }, or null when cancelled. */
export async function pickFile(accept) {
  if (isDesktop()) {
    const path = await invoke("plugin:dialog|open", { options: { multiple: false, directory: false, filters: filters(accept) } });
    if (!path) return null;
    const text = decode(await invoke("plugin:fs|read_text_file", { path }));
    return { name: basename(path), path, text };
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      file.text().then(text => resolve({ name: file.name, path: null, text }), reject);
    }, { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

/** Saves text to a file the user chooses. Resolves to true when saved, false when cancelled. */
export async function saveFile(name, contents) {
  if (isDesktop()) {
    const path = await invoke("plugin:dialog|save", { options: { defaultPath: name } });
    if (!path) return false;
    await invoke("plugin:fs|write_text_file", new TextEncoder().encode(String(contents)), {
      headers: { path: encodeURIComponent(path), options: JSON.stringify({}) },
    });
    return true;
  }
  const url = URL.createObjectURL(new Blob([String(contents)], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Shows a system notification. Resolves to false when the user has not allowed notifications. */
export async function notify(title, body) {
  // The notification plugin provides window.Notification inside the app, so one code path serves both.
  const N = globalThis.Notification;
  if (!N) return false;
  let permission = N.permission;
  if (permission === "default") permission = await N.requestPermission();
  if (permission !== "granted") return false;
  new N(String(title), body ? { body: String(body) } : undefined);
  return true;
}

/** Asks a yes/no question in a native dialog. Resolves to true for OK. */
export async function confirmDialog(message, title) {
  if (isDesktop()) {
    const result = await invoke("plugin:dialog|message", {
      message: String(message),
      title: title ? String(title) : undefined,
      kind: "warning",
      buttons: { OkCancelCustom: ["OK", "Cancel"] },
    });
    return result === "OK" || result === "Ok" || result === true;
  }
  return globalThis.confirm(title ? title + "\n\n" + message : String(message));
}

/** Sets the window title (the document title in a browser). */
export async function setTitle(title) {
  document.title = String(title);
  if (isDesktop()) await invoke("plugin:window|set_title", { label: "main", value: String(title) });
}

/** Opens an http(s) or mailto link in the default browser or mail app, never inside the app. */
export async function openExternal(url) {
  const href = String(url);
  if (!/^(https?:|mailto:)/i.test(href)) throw new Error("openExternal only opens http, https and mailto links");
  if (isDesktop()) return invoke("plugin:opener|open_url", { url: href });
  globalThis.open(href, "_blank", "noopener,noreferrer");
}
