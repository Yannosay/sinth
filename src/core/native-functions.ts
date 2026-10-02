export interface NativeFunction {
  name: string;
  params: string[];
  returnType: string;
  jsImpl: string;
}

export const NATIVE_FUNCTIONS: NativeFunction[] = [
  // Console
  { name: "console.log", params: ["...args: any"], returnType: "ui", jsImpl: "console.log(...args)" },
  { name: "console.error", params: ["...args: any"], returnType: "ui", jsImpl: "console.error(...args)" },
  { name: "console.warn", params: ["...args: any"], returnType: "ui", jsImpl: "console.warn(...args)" },
  { name: "console.info", params: ["...args: any"], returnType: "ui", jsImpl: "console.info(...args)" },
  { name: "console.debug", params: ["...args: any"], returnType: "ui", jsImpl: "console.debug(...args)" },
  { name: "console.table", params: ["data: any", "columns?: string[]"], returnType: "ui", jsImpl: "console.table(data, columns)" },
  { name: "console.time", params: ["label: str"], returnType: "ui", jsImpl: "console.time(label)" },
  { name: "console.timeEnd", params: ["label: str"], returnType: "ui", jsImpl: "console.timeEnd(label)" },
  { name: "console.trace", params: [], returnType: "ui", jsImpl: "console.trace()" },
  { name: "console.group", params: ["label?: str"], returnType: "ui", jsImpl: "console.group(label)" },
  { name: "console.groupEnd", params: [], returnType: "ui", jsImpl: "console.groupEnd()" },
  { name: "console.count", params: ["label?: str"], returnType: "ui", jsImpl: "console.count(label)" },
  { name: "console.assert", params: ["condition: bool", "...args: any"], returnType: "ui", jsImpl: "console.assert(condition, ...args)" },

  // Alert/Confirm/Prompt (browser globals)
  { name: "alert", params: ["message: str"], returnType: "ui", jsImpl: "alert(message)" },
  { name: "confirm", params: ["message: str"], returnType: "bool", jsImpl: "confirm(message)" },
  { name: "prompt", params: ["message: str", "default?: str"], returnType: "str", jsImpl: "prompt(message, default)" },

  // Timers
  { name: "setTimeout", params: ["callback: () => void", "delay: num", "...args: any"], returnType: "num", jsImpl: "setTimeout(callback, delay, ...args)" },
  { name: "setInterval", params: ["callback: () => void", "delay: num", "...args: any"], returnType: "num", jsImpl: "setInterval(callback, delay, ...args)" },
  { name: "clearTimeout", params: ["id: num"], returnType: "ui", jsImpl: "clearTimeout(id)" },
  { name: "clearInterval", params: ["id: num"], returnType: "ui", jsImpl: "clearInterval(id)" },
  { name: "requestAnimationFrame", params: ["callback: (time: num) => void"], returnType: "num", jsImpl: "requestAnimationFrame(callback)" },
  { name: "cancelAnimationFrame", params: ["id: num"], returnType: "ui", jsImpl: "cancelAnimationFrame(id)" },

  // Math
  { name: "Math.abs", params: ["x: num"], returnType: "num", jsImpl: "Math.abs(x)" },
  { name: "Math.min", params: ["...values: num"], returnType: "num", jsImpl: "Math.min(...values)" },
  { name: "Math.max", params: ["...values: num"], returnType: "num", jsImpl: "Math.max(...values)" },
  { name: "Math.floor", params: ["x: num"], returnType: "num", jsImpl: "Math.floor(x)" },
  { name: "Math.ceil", params: ["x: num"], returnType: "num", jsImpl: "Math.ceil(x)" },
  { name: "Math.round", params: ["x: num"], returnType: "num", jsImpl: "Math.round(x)" },
  { name: "Math.trunc", params: ["x: num"], returnType: "num", jsImpl: "Math.trunc(x)" },
  { name: "Math.sqrt", params: ["x: num"], returnType: "num", jsImpl: "Math.sqrt(x)" },
  { name: "Math.pow", params: ["base: num", "exponent: num"], returnType: "num", jsImpl: "Math.pow(base, exponent)" },
  { name: "Math.random", params: [], returnType: "num", jsImpl: "Math.random()" },
  { name: "Math.sin", params: ["x: num"], returnType: "num", jsImpl: "Math.sin(x)" },
  { name: "Math.cos", params: ["x: num"], returnType: "num", jsImpl: "Math.cos(x)" },
  { name: "Math.tan", params: ["x: num"], returnType: "num", jsImpl: "Math.tan(x)" },
  { name: "Math.asin", params: ["x: num"], returnType: "num", jsImpl: "Math.asin(x)" },
  { name: "Math.acos", params: ["x: num"], returnType: "num", jsImpl: "Math.acos(x)" },
  { name: "Math.atan", params: ["x: num"], returnType: "num", jsImpl: "Math.atan(x)" },
  { name: "Math.atan2", params: ["y: num", "x: num"], returnType: "num", jsImpl: "Math.atan2(y, x)" },
  { name: "Math.exp", params: ["x: num"], returnType: "num", jsImpl: "Math.exp(x)" },
  { name: "Math.log", params: ["x: num"], returnType: "num", jsImpl: "Math.log(x)" },
  { name: "Math.log10", params: ["x: num"], returnType: "num", jsImpl: "Math.log10(x)" },
  { name: "Math.log2", params: ["x: num"], returnType: "num", jsImpl: "Math.log2(x)" },
  { name: "Math.PI", params: [], returnType: "num", jsImpl: "Math.PI" },
  { name: "Math.E", params: [], returnType: "num", jsImpl: "Math.E" },

  // JSON
  { name: "JSON.stringify", params: ["value: any", "replacer?: any", "space?: str|num"], returnType: "str", jsImpl: "JSON.stringify(value, replacer, space)" },
  { name: "JSON.parse", params: ["text: str", "reviver?: (key: str, value: any) => any"], returnType: "obj", jsImpl: "JSON.parse(text, reviver)" },

  // String/Number/Boolean/Object/Array globals
  { name: "String", params: ["value: any"], returnType: "str", jsImpl: "String(value)" },
  { name: "Number", params: ["value: any"], returnType: "num", jsImpl: "Number(value)" },
  { name: "Boolean", params: ["value: any"], returnType: "bool", jsImpl: "Boolean(value)" },
  { name: "Object", params: ["value?: any"], returnType: "obj", jsImpl: "Object(value)" },
  { name: "Array", params: ["...items: any"], returnType: "arr", jsImpl: "[...items]" },
  { name: "parseInt", params: ["string: str", "radix?: num"], returnType: "num", jsImpl: "parseInt(string, radix)" },
  { name: "parseFloat", params: ["string: str"], returnType: "num", jsImpl: "parseFloat(string)" },
  { name: "isNaN", params: ["value: any"], returnType: "bool", jsImpl: "isNaN(value)" },
  { name: "isFinite", params: ["value: any"], returnType: "bool", jsImpl: "isFinite(value)" },
  { name: "encodeURI", params: ["uri: str"], returnType: "str", jsImpl: "encodeURI(uri)" },
  { name: "decodeURI", params: ["uri: str"], returnType: "str", jsImpl: "decodeURI(uri)" },
  { name: "encodeURIComponent", params: ["uri: str"], returnType: "str", jsImpl: "encodeURIComponent(uri)" },
  { name: "decodeURIComponent", params: ["uri: str"], returnType: "str", jsImpl: "decodeURIComponent(uri)" },

  // Date
  { name: "Date.now", params: [], returnType: "num", jsImpl: "Date.now()" },
  { name: "Date.parse", params: ["dateString: str"], returnType: "num", jsImpl: "Date.parse(dateString)" },
  { name: "Date.UTC", params: ["year: num", "month: num", "day?: num", "hours?: num", "minutes?: num", "seconds?: num", "ms?: num"], returnType: "num", jsImpl: "Date.UTC(year, month, day, hours, minutes, seconds, ms)" },

  // URL
  { name: "URL", params: ["url: str", "base?: str"], returnType: "obj", jsImpl: "new URL(url, base)" },
  { name: "URLSearchParams", params: ["init?: str|obj|string[][]"], returnType: "obj", jsImpl: "new URLSearchParams(init)" },

  // Fetch
  { name: "fetch", params: ["url: str", "options?: obj"], returnType: "obj", jsImpl: "fetch(url, options)" },

  // LocalStorage/SessionStorage
  { name: "localStorage.getItem", params: ["key: str"], returnType: "str", jsImpl: "localStorage.getItem(key)" },
  { name: "localStorage.setItem", params: ["key: str", "value: str"], returnType: "ui", jsImpl: "localStorage.setItem(key, value)" },
  { name: "localStorage.removeItem", params: ["key: str"], returnType: "ui", jsImpl: "localStorage.removeItem(key)" },
  { name: "localStorage.clear", params: [], returnType: "ui", jsImpl: "localStorage.clear()" },
  { name: "localStorage.key", params: ["index: num"], returnType: "str", jsImpl: "localStorage.key(index)" },
  { name: "sessionStorage.getItem", params: ["key: str"], returnType: "str", jsImpl: "sessionStorage.getItem(key)" },
  { name: "sessionStorage.setItem", params: ["key: str", "value: str"], returnType: "ui", jsImpl: "sessionStorage.setItem(key, value)" },
  { name: "sessionStorage.removeItem", params: ["key: str"], returnType: "ui", jsImpl: "sessionStorage.removeItem(key)" },
  { name: "sessionStorage.clear", params: [], returnType: "ui", jsImpl: "sessionStorage.clear()" },

  // Document/Window (limited safe subset)
  { name: "document.getElementById", params: ["id: str"], returnType: "obj", jsImpl: "document.getElementById(id)" },
  { name: "document.querySelector", params: ["selector: str"], returnType: "obj", jsImpl: "document.querySelector(selector)" },
  { name: "document.querySelectorAll", params: ["selector: str"], returnType: "arr", jsImpl: "document.querySelectorAll(selector)" },
  { name: "document.createElement", params: ["tagName: str"], returnType: "obj", jsImpl: "document.createElement(tagName)" },
  { name: "document.createTextNode", params: ["text: str"], returnType: "obj", jsImpl: "document.createTextNode(text)" },
  { name: "window.location.href", params: [], returnType: "str", jsImpl: "window.location.href" },
  { name: "window.location.reload", params: [], returnType: "ui", jsImpl: "window.location.reload()" },
  { name: "window.scrollTo", params: ["x: num", "y: num"], returnType: "ui", jsImpl: "window.scrollTo(x, y)" },
  { name: "window.scrollBy", params: ["x: num", "y: num"], returnType: "ui", jsImpl: "window.scrollBy(x, y)" },
];

export const NATIVE_CONSTANTS: Record<string, { type: string; value: string }> = {
  "Infinity": { type: "num", value: "Infinity" },
  "NaN": { type: "num", value: "NaN" },
  "undefined": { type: "any", value: "undefined" },
  "null": { type: "any", value: "null" },
};

export function getNativeFunction(name: string): NativeFunction | undefined {
  return NATIVE_FUNCTIONS.find(f => f.name === name);
}

export function isNativeFunction(name: string): boolean {
  return NATIVE_FUNCTIONS.some(f => f.name === name);
}

export function getNativeFunctionNames(): string[] {
  return NATIVE_FUNCTIONS.map(f => f.name);
}