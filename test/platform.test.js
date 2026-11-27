"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { project, makeProject } = require("./helpers");
const { buildProject } = require("../dist/project/build");
const { stripBase } = require("../dist/server/static");
const { FunctionsHost } = require("../dist/server/functions");

test("public/ keeps dotfiles like .nojekyll and .well-known but skips OS junk", async () => {
  const p = project({
    "pages/index.sinth": "Main { \"x\" }\n",
    "public/.nojekyll": "",
    "public/.well-known/security.txt": "Contact: x",
    "public/.DS_Store": "junk",
    "public/img/Thumbs.db": "junk",
  });
  const out = await buildProject(p, { write: false });
  assert.ok(out.files.has(".nojekyll"));
  assert.ok(out.files.has(".well-known/security.txt"));
  assert.ok(!out.files.has(".DS_Store"));
  assert.ok(!out.files.has("img/Thumbs.db"));
});

test("a fully static site can be rebuilt into its own output folder", async () => {
  const p = project({ "pages/index.sinth": "Main { \"x\" }\n", "sinth.config.json": '{ "router": false }' });
  await buildProject(p, { write: true });
  assert.ok(!fs.existsSync(path.join(p.root, "dist/_sinth")));
  await buildProject(p, { write: true });
  assert.ok(fs.existsSync(path.join(p.root, "dist/index.html")));
});

test("custom elements get a standalone file each and an index that registers all", async () => {
  const p = project({
    "pages/index.sinth": "Main { \"x\" }\n",
    "components/Counter.sinth": "component Counter(num start = 0) as <x-counter> {\n  var num n = start\n  Button(onClick: n += 1) { \"n \" + n }\n}\n",
    "components/Hello.sinth": "component Hello(str name = \"you\") as <x-hello> {\n  Span { \"Hi \" + name }\n}\n",
  });
  const out = await buildProject(p, { write: false });
  for (const f of ["elements/x-counter.js", "elements/x-hello.js", "elements/index.js"]) assert.ok(out.files.has(f), f);
  const index = Buffer.from(out.files.get("elements/index.js").contents).toString();
  assert.match(index, /x-counter/);
  assert.match(index, /x-hello/);
});

test("a project with only custom elements builds without pages", async () => {
  const p = project({ "components/Badge.sinth": "component Badge(str label = \"new\") as <x-badge> {\n  Span { label }\n}\n" });
  const out = await buildProject(p, { write: false });
  assert.equal(out.pages.length, 0);
  assert.ok(out.files.has("elements/x-badge.js"));
});

test("custom elements are served by the dev build", async () => {
  const p = project({
    "pages/index.sinth": "Main { \"x\" }\n",
    "components/Badge.sinth": "component Badge(str label = \"new\") as <x-badge> {\n  Span { label }\n}\n",
  }, "development");
  const out = await buildProject(p, { write: false });
  assert.ok(out.files.has("elements/x-badge.js"));
});

test("stripBase maps request paths under a subfolder", () => {
  assert.equal(stripBase("/docs/about", "/docs/"), "/about");
  assert.equal(stripBase("/docs", "/docs/"), "/");
  assert.equal(stripBase("/docs/", "/docs/"), "/");
  assert.equal(stripBase("/other", "/docs/"), null);
  assert.equal(stripBase("/x", "/"), "/x");
});

function functionsProject(files) {
  return makeProject({ "pages/index.sinth": "Main { \"x\" }\n", ...files });
}

const assets = async () => new Response("static", { status: 200, headers: { "content-type": "text/plain" } });

test("functions/ routes handle requests with params, methods and catch-alls", async () => {
  const root = functionsProject({
    "functions/api/hello.ts": "export const onRequestGet = () => Response.json({ hello: 'world' });\nexport const onRequestPost = async ({ request }: { request: Request }) => Response.json(await request.json());\n",
    "functions/api/users/[id].js": "export function onRequest({ params }) { return new Response('user ' + params.id); }\n",
    "functions/api/users/me.js": "export function onRequest() { return new Response('me'); }\n",
    "functions/files/[[path]].js": "export function onRequest({ params }) { return new Response(params.path.join('|')); }\n",
    "functions/api/index.js": "export function onRequest({ env }) { return new Response(env.SECRET); }\n",
    ".dev.vars": "SECRET=\"s3cret\"\n",
  });
  const host = new FunctionsHost(root);
  const call = async (url, init) => {
    const res = await host.handle(new Request("http://localhost" + url, init), assets);
    return res && { status: res.status, body: await res.text() };
  };
  assert.deepEqual(await call("/api/hello"), { status: 200, body: '{"hello":"world"}' });
  assert.deepEqual(await call("/api/hello", { method: "POST", body: '{"a":1}', headers: { "content-type": "application/json" } }), { status: 200, body: '{"a":1}' });
  assert.deepEqual(await call("/api/users/42"), { status: 200, body: "user 42" });
  assert.deepEqual(await call("/api/users/me"), { status: 200, body: "me" });
  assert.deepEqual(await call("/files/a/b/c"), { status: 200, body: "a|b|c" });
  assert.deepEqual(await call("/api"), { status: 200, body: "s3cret" });
  assert.equal(await call("/about"), null);
  assert.equal(await call("/api/hello", { method: "DELETE" }), null);
});

test("functions/_middleware runs before routes and can fall through to static files", async () => {
  const root = functionsProject({
    "functions/_middleware.js": "export async function onRequest({ next, data }) { data.user = 'ada'; const res = await next(); const out = new Response(res.body, res); out.headers.set('x-mw', '1'); return out; }\n",
    "functions/api/me.js": "export const onRequest = ({ data }) => new Response(data.user);\n",
  });
  const host = new FunctionsHost(root);
  const api = await host.handle(new Request("http://localhost/api/me"), assets);
  assert.equal(await api.text(), "ada");
  assert.equal(api.headers.get("x-mw"), "1");
  const page = await host.handle(new Request("http://localhost/about"), assets);
  assert.equal(await page.text(), "static");
  assert.equal(page.headers.get("x-mw"), "1");
});

test("functions that do not return a Response report a clear error", async () => {
  const root = functionsProject({ "functions/api/bad.js": "export function onRequest() { return 'nope'; }\n" });
  const host = new FunctionsHost(root);
  await assert.rejects(host.handle(new Request("http://localhost/api/bad"), assets), /must return a Response/);
});

test("compileFiles compiles in-memory sources with imports and reports errors", () => {
  const { compileFiles } = require("../dist/index");
  const fs = require("fs");
  const ui = fs.readFileSync(path.join(__dirname, "../lib/ui/index.sinth"), "utf-8");
  const result = compileFiles({
    "/pages/index.sinth": 'import { Card } from "sinth:ui"\nimport { Hi } from "../components/Hi.sinth"\ntitle = "T"\nvar num n = 1\nMain { Card(title: "c") { Hi(name: "Ada") } Button(onClick: n += 1) { "n" + n } }\n',
    "/components/Hi.sinth": 'component Hi(str name) {\n  P(class: "hi") { "Hello " + name }\n  style { .hi { color: "red" } }\n}\n',
  }, { builtins: { "sinth:ui": ui } });
  assert.deepEqual(result.modules.map(m => m.id), ["sinth:ui", "/components/Hi.sinth", "/pages/index.sinth"]);
  assert.match(result.html, /<title>T<\/title>/);
  assert.match(result.html, /Hello Ada/);
  assert.match(result.css, /color: red/);
  assert.throws(() => compileFiles({ "/pages/index.sinth": "Main { P { nope } }" }), err => err.code === "E0302");
});
