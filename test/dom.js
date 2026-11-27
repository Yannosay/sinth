"use strict";
const path = require("path");
const esbuild = require("esbuild");
const { JSDOM } = require("jsdom");
const { project } = require("./helpers");

/** Builds a page in development mode and boots it in jsdom. */
async function run(source, extra = {}) {
  const p = project({ "pages/index.sinth": source, ...extra }, "development");
  const file = path.join(p.root, "pages/index.sinth");
  p.compile(file);
  const result = await esbuild.build({
    stdin: { contents: `import * as page from ${JSON.stringify(file)}; import { boot } from "sinth-runtime"; boot({ render: page.render, state: page.state, restore: page.restore });`, resolveDir: p.root },
    bundle: true, format: "iife", write: false, logLevel: "silent",
    plugins: [{
      name: "sinth",
      setup(b) {
        b.onResolve({ filter: /^sinth-runtime$/ }, () => ({ path: path.join(__dirname, "..", "dist", "runtime", "index.js") }));
        b.onResolve({ filter: /^sinth-css:/ }, () => ({ path: "x", namespace: "empty" }));
        b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
        b.onLoad({ filter: /\.sinth$/ }, a => ({ contents: p.compile(a.path).js, loader: "js", resolveDir: path.dirname(a.path) }));
      },
    }],
  });
  const dom = new JSDOM("<!DOCTYPE html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true });
  dom.window.eval(result.outputFiles[0].text);
  await new Promise(r => setTimeout(r, 0));
  const doc = dom.window.document;
  return { window: dom.window, doc, $: s => doc.querySelector(s), text: s => doc.querySelector(s)?.textContent, flush: () => new Promise(r => setTimeout(r, 0)) };
}

module.exports = { run };
