export const JS_GLOBALS: ReadonlySet<string> = new Set([
  "globalThis", "window", "document", "navigator", "location", "history", "screen", "console", "performance",
  "localStorage", "sessionStorage", "indexedDB", "crypto", "fetch", "Request", "Response", "Headers", "FormData",
  "URL", "URLSearchParams", "AbortController", "AbortSignal", "Blob", "File", "FileReader", "WebSocket", "EventSource",
  "Worker", "BroadcastChannel", "MessageChannel", "Notification", "IntersectionObserver", "ResizeObserver",
  "MutationObserver", "matchMedia", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
  "requestIdleCallback", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask",
  "structuredClone", "alert", "confirm", "prompt", "open", "close", "print", "scrollTo", "scrollBy", "atob", "btoa",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "escape", "unescape", "isNaN", "isFinite",
  "parseInt", "parseFloat", "Math", "JSON", "Date", "Number", "String", "Boolean", "BigInt", "Symbol", "Array", "Object",
  "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "Promise", "Proxy", "Reflect", "RegExp", "Error", "TypeError",
  "RangeError", "SyntaxError", "Intl", "ArrayBuffer", "DataView", "Uint8Array", "Int8Array", "Uint16Array",
  "Int16Array", "Uint32Array", "Int32Array", "Float32Array", "Float64Array", "Uint8ClampedArray", "TextEncoder",
  "TextDecoder", "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "EventTarget", "Element", "HTMLElement",
  "Node", "NodeList", "DOMParser", "XMLHttpRequest", "Image", "Audio", "Option", "CSS", "customElements",
  "visualViewport", "devicePixelRatio", "innerWidth", "innerHeight", "outerWidth", "outerHeight", "scrollX",
  "scrollY", "origin", "isSecureContext", "caches", "clipboard", "Infinity", "NaN", "undefined", "Clipboard",
  "AudioContext", "speechSynthesis", "SpeechSynthesisUtterance", "Intl", "sinthRender", "sinth",
]);

export const RUNTIME_GLOBALS: ReadonlyMap<string, string> = new Map([
  ["range", "$$.range"],
  ["sinthRender", "$$.update"],
  ["render", "$$.update"],
]);
