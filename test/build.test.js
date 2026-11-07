"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { build, project, makeProject, expectError } = require("./helpers");
const { decodePath, safeJoin } = require("../dist/server/static");
const { loadConfig } = require("../dist/project/config");
const { buildProject } = require("../dist/project/build");

test("static pages ship without JavaScript and are fully prerendered", async () => {
  const { out, text } = await build({
    "pages/index.sinth": 'page\ntitle = "Home"\nvar str[] items = ["a", "b"]\nconst num year = 2026\nMain {\n  Heading(level: 1) { "Hi " + year }\n  for item, i in items { Paragraph { (i + 1) + ". " + item } }\n}\n',
  });
  const page = out.pages[0];
  assert.equal(page.interactive, false);
  assert.equal(page.js, undefined);
  const html = text("index.html");
  assert.match(html, /<h1>Hi 2026<\/h1><p>1\. a<\/p><p>2\. b<\/p>/);
  assert.doesNotMatch(html, /<script/);
});

test("interactive pages load a module script and prerender initial state", async () => {
  const { out, text } = await build({ "pages/index.sinth": "page\nvar num n = 41\nMain { Button(onClick: n += 1) { \"n=\" + (n + 1) } }\n" });
  assert.equal(out.pages[0].interactive, true);
  const html = text("index.html");
  assert.match(html, /<script type="module" src="\/_sinth\/index-[A-Z0-9]+\.js"><\/script>/);
  assert.match(html, /<button type="button">n=42<\/button>/);
});

test("metadata produces SEO tags and escapes values", async () => {
  const { text } = await build({ "pages/index.sinth": 'page\ntitle = "A <b> & \\"c\\""\ndescr = "Desc"\nogImage = "https://x.dev/i.png"\nMain { "x" }\n' });
  const html = text("index.html");
  assert.match(html, /<title>A &lt;b&gt; &amp; "c"<\/title>/);
  assert.match(html, /<meta property="og:title" content="A &lt;b&gt; &amp; &quot;c&quot;">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
});

test("prerendered text is HTML-escaped", async () => {
  const { text } = await build({ "pages/index.sinth": 'page\nvar str evil = "<img src=x onerror=alert(1)>"\nMain { Paragraph { evil } Link(href: "javascript:alert(1)") { "x" } }\n' });
  const html = text("index.html");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
});

test("routes map to clean output paths", async () => {
  const { out } = await build({
    "pages/index.sinth": "page\nMain { \"home\" }\n",
    "pages/about.sinth": "page\nMain { \"about\" }\n",
    "pages/blog/index.sinth": "page\nMain { \"blog\" }\n",
    "pages/_draft.sinth": "page\nMain { \"draft\" }\n",
    "pages/Widget.sinth": "component Widget { Div { \"w\" } }\n",
  });
  assert.deepEqual(out.pages.map(p => [p.page.route, p.page.outFile]), [["/", "index.html"], ["/about", "about.html"], ["/blog", "blog/index.html"]]);
});

test("security headers and CSP are emitted", async () => {
  const { text } = await build({ "pages/index.sinth": "page\nMain { \"x\" }\n" });
  const headers = text("_headers");
  assert.match(headers, /Content-Security-Policy: default-src 'self'; script-src 'self';/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /\/_sinth\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
});

test("sitemap and robots are generated when site is configured", async () => {
  const p = project({ "sinth.config.json": '{ "site": "https://example.com" }', "pages/index.sinth": "page\nMain { \"x\" }\n", "pages/404.sinth": "page\nMain { \"nf\" }\n" });
  const out = await buildProject(p, { write: false });
  const sitemap = Buffer.from(out.files.get("sitemap.xml").contents).toString();
  assert.match(sitemap, /<loc>https:\/\/example\.com\/<\/loc>/);
  assert.doesNotMatch(sitemap, /404/);
});

test("public and static directories are copied", async () => {
  const p = project({ "pages/index.sinth": "page\nMain { \"x\" }\n", "public/robots.txt": "ok", "assets/logo.svg": "<svg/>" });
  const out = await buildProject(p, { write: false });
  assert.ok(out.files.has("robots.txt"));
  assert.ok(out.files.has("assets/logo.svg"));
});

test("refuses to wipe a foreign output directory", async () => {
  const p = project({ "pages/index.sinth": "page\nMain { \"x\" }\n", "dist/important.txt": "keep me" });
  await assert.rejects(buildProject(p, { write: true }), err => err.code === "E0801");
  assert.ok(fs.existsSync(path.join(p.root, "dist/important.txt")));
});

test("missing npm packages produce an install hint", async () => {
  const p = project({ "pages/index.sinth": 'page\nimport confetti from "definitely-not-installed-pkg"\nMain { Button(onClick: confetti()) { "x" } }\n' });
  await assert.rejects(buildProject(p, { write: false }), err => /npm install definitely-not-installed-pkg/.test(err.diagnostic.hint));
});

test("config validation reports bad types", () => {
  const root = makeProject({ "sinth.config.json": '{ "port": "abc" }' });
  expectError(() => loadConfig(root, "production"), "E0900");
});

test("dev server path handling rejects traversal", () => {
  assert.equal(decodePath("/../etc/passwd"), "/etc/passwd");
  assert.equal(decodePath("/%2e%2e/%2e%2e/secret"), "/secret");
  assert.equal(decodePath("/%E0%A4%A"), null);
  assert.equal(decodePath("/a%00b"), null);
  assert.equal(decodePath("/assets/logo.png?x=1"), "/assets/logo.png");
  assert.equal(safeJoin("/srv/site", "/../../etc/passwd"), null);
});
