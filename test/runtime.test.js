"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const esbuild = require("esbuild");
const { JSDOM } = require("jsdom");
const { project } = require("./helpers");

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

test("counter updates only the bound text node", async () => {
  const app = await run('page\nvar num n = 0\nMain { Button(id: "b", onClick: n += 1) { "n=" + n } Paragraph(id: "p") { "static" } }');
  const p = app.$("#p");
  app.$("#b").click();
  app.$("#b").click();
  assert.equal(app.text("#b"), "n=2");
  assert.equal(app.$("#p"), p);
});

test("keyed lists keep DOM nodes when reordered", async () => {
  const app = await run('page\nvar obj[] items = [{ id: 1, t: "a" }, { id: 2, t: "b" }, { id: 3, t: "c" }]\nMain {\n  Ul(id: "l") { for it in items key it.id { Li { it.t } } }\n  Button(id: "rev", onClick: items = items.slice().reverse()) { "r" }\n  Button(id: "push", onClick: items.push({ id: 4, t: "d" })) { "p" }\n}');
  const before = [...app.doc.querySelectorAll("#l li")];
  app.$("#rev").click();
  const after = [...app.doc.querySelectorAll("#l li")];
  assert.deepEqual(after.map(li => li.textContent), ["c", "b", "a"]);
  assert.equal(after[0], before[2]);
  app.$("#push").click();
  assert.equal(app.doc.querySelectorAll("#l li").length, 4);
});

test("if/else switches branches and persist keeps state", async () => {
  const app = await run('page\nvar bool on = true\nMain {\n  if on persist { Input(id: "i") } else { Paragraph(id: "off") { "off" } }\n  Button(id: "t", onClick: on = not on) { "t" }\n}');
  const input = app.$("#i");
  input.value = "kept";
  app.$("#t").click();
  assert.equal(app.$("#i"), null);
  assert.equal(app.text("#off"), "off");
  app.$("#t").click();
  assert.equal(app.$("#i"), input);
  assert.equal(app.$("#i").value, "kept");
});

test("model binds text, numbers and checkboxes", async () => {
  const app = await run('page\nvar str s = "a"\nvar num n = 1\nvar bool c = false\nMain {\n  Input(id: "s", model: s)\n  Input(id: "n", type: "number", model: n)\n  Checkbox(id: "c", model: c)\n  Paragraph(id: "out") { s + "|" + (n + 1) + "|" + c }\n}');
  const s = app.$("#s");
  s.value = "hello";
  s.dispatchEvent(new app.window.Event("input"));
  const n = app.$("#n");
  n.value = "41";
  n.dispatchEvent(new app.window.Event("input"));
  app.$("#c").click();
  assert.equal(app.text("#out"), "hello|42|true");
});

test("components receive reactive props and slots", async () => {
  const comp = 'component Badge(str label, str tone = "info") {\n  Span(class: "badge " + tone) { label $slot }\n}\n';
  const app = await run('page\nimport { Badge } from "../components/Badge.sinth"\nvar str l = "one"\nMain {\n  Badge(label: l, id: "b") { "!" }\n  Button(id: "x", onClick: l = "two") { "x" }\n}', { "components/Badge.sinth": comp });
  assert.equal(app.text("#b"), "one!");
  assert.equal(app.$("#b").className.includes("info"), true);
  app.$("#x").click();
  assert.equal(app.text("#b"), "two!");
});

test("text is never interpreted as HTML", async () => {
  const app = await run('page\nvar str v = "<b id=\\"inj\\">x</b>"\nMain { Paragraph(id: "p") { v } }');
  assert.equal(app.$("#inj"), null);
  assert.equal(app.text("#p"), '<b id="inj">x</b>');
});

test("javascript: URLs are blocked at runtime", async () => {
  const app = await run('page\nvar str u = "javascript:alert(1)"\nMain { Link(id: "a", href: u) { "x" } }');
  assert.equal(app.$("#a").getAttribute("href"), "about:blank#blocked");
});

test("event modifiers and watchers", async () => {
  const app = await run('page\nvar num hits = 0\nvar str log = ""\nwatch hits { log = "changed:" + value }\nMain {\n  Div(id: "outer", onClick: hits += 10) { Button(id: "inner", onClick.stop: hits += 1) { "b" } }\n  Paragraph(id: "log") { log }\n}');
  app.$("#inner").click();
  assert.equal(app.text("#log"), "changed:1");
});

test("script blocks can mutate state and call sinthRender", async () => {
  const app = await run('page\nvar num n = 0\nMain { Paragraph(id: "p") { n } }\nscript {\n  n = 5\n  setTimeout(() => { n = 7; sinthRender() }, 30)\n}');
  assert.equal(app.text("#p"), "5");
  await new Promise(r => setTimeout(r, 60));
  assert.equal(app.text("#p"), "7");
});
