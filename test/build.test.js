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
    "pages/index.sinth": 'title = "Home"\nvar str[] items = ["a", "b"]\nconst num year = 2026\nMain {\n  Heading(level: 1) { "Hi " + year }\n  for item, i in items { Paragraph { (i + 1) + ". " + item } }\n}\n',
  });
  const page = out.pages[0];
  assert.equal(page.interactive, false);
  assert.equal(page.js, undefined);
  const html = text("index.html");
  assert.match(html, /<h1>Hi 2026<\/h1><p>1\. a<\/p><p>2\. b<\/p>/);
  assert.doesNotMatch(html, /<script/);
});

test("interactive pages load a module script and prerender initial state", async () => {
  const { out, text } = await build({ "pages/index.sinth": "var num n = 41\nMain { Button(onClick: n += 1) { \"n=\" + (n + 1) } }\n" });
  assert.equal(out.pages[0].interactive, true);
  const html = text("index.html");
  assert.match(html, /<script type="module" src="\/_sinth\/index-[A-Z0-9]+\.js"><\/script>/);
  assert.match(html, /<button type="button">n=42<\/button>/);
});

test("metadata produces SEO tags and escapes values", async () => {
  const { text } = await build({ "pages/index.sinth": 'title = "A <b> & \\"c\\""\ndescr = "Desc"\nogImage = "https://x.dev/i.png"\nMain { "x" }\n' });
  const html = text("index.html");
  assert.match(html, /<title>A &lt;b&gt; &amp; "c"<\/title>/);
  assert.match(html, /<meta property="og:title" content="A &lt;b&gt; &amp; &quot;c&quot;">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
});

test("prerendered text is HTML-escaped", async () => {
  const { text } = await build({ "pages/index.sinth": 'var str evil = "<img src=x onerror=alert(1)>"\nMain { Paragraph { evil } Link(href: "javascript:alert(1)") { "x" } }\n' });
  const html = text("index.html");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
});

test("routes map to clean output paths", async () => {
  const { out } = await build({
    "pages/index.sinth": "Main { \"home\" }\n",
    "pages/about.sinth": "Main { \"about\" }\n",
    "pages/blog/index.sinth": "Main { \"blog\" }\n",
    "pages/_draft.sinth": "Main { \"draft\" }\n",
    "pages/Widget.sinth": "component Widget { Div { \"w\" } }\n",
  });
  assert.deepEqual(out.pages.map(p => [p.page.route, p.page.outFile]), [["/", "index.html"], ["/about", "about.html"], ["/blog", "blog/index.html"]]);
});

test("security headers and CSP are emitted", async () => {
  const { text } = await build({ "pages/index.sinth": "Main { \"x\" }\n" });
  const headers = text("_headers");
  assert.match(headers, /Content-Security-Policy: default-src 'self'; script-src 'self';/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /\/_sinth\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
});

test("sitemap and robots are generated when site is configured", async () => {
  const p = project({ "sinth.config.json": '{ "site": "https://example.com" }', "pages/index.sinth": "Main { \"x\" }\n", "pages/404.sinth": "Main { \"nf\" }\n" });
  const out = await buildProject(p, { write: false });
  const sitemap = Buffer.from(out.files.get("sitemap.xml").contents).toString();
  assert.match(sitemap, /<loc>https:\/\/example\.com\/<\/loc>/);
  assert.doesNotMatch(sitemap, /404/);
});

test("public and static directories are copied", async () => {
  const p = project({ "pages/index.sinth": "Main { \"x\" }\n", "public/robots.txt": "ok", "assets/logo.svg": "<svg/>" });
  const out = await buildProject(p, { write: false });
  assert.ok(out.files.has("robots.txt"));
  assert.ok(out.files.has("assets/logo.svg"));
});

test("refuses to wipe a foreign output directory", async () => {
  const p = project({ "pages/index.sinth": "Main { \"x\" }\n", "dist/important.txt": "keep me" });
  await assert.rejects(buildProject(p, { write: true }), err => err.code === "E0801");
  assert.ok(fs.existsSync(path.join(p.root, "dist/important.txt")));
});

test("missing npm packages produce an install hint", async () => {
  const p = project({ "pages/index.sinth": 'import confetti from "definitely-not-installed-pkg"\nMain { Button(onClick: confetti()) { "x" } }\n' });
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

test("every .sinth file in pages/ is a page without the 'page' keyword", async () => {
  const { out, text } = await build({
    "pages/index.sinth": 'title = "Home"\nvar num n = 1\nMain { Button(onClick: n += 1) { "n=" + n } }\n',
    "pages/about.sinth": 'Main { Heading { "About" } }\n',
    "pages/blog/index.sinth": '-- a comment first\nMain { "Blog" }\n',
    "pages/empty.sinth": "",
    "pages/legacy.sinth": 'Main { "Old style" }\n',
    "pages/_draft.sinth": 'Main { "Draft" }\n',
    "pages/_partials/Hero.sinth": 'export component Hero { Heading { "Hero" } }\n',
    "pages/widgets.sinth": 'export component Widget { Span { "w" } }\n',
  });
  assert.deepEqual(out.pages.map(p => p.page.route).sort(), ["/", "/about", "/blog", "/empty", "/legacy"]);
  assert.match(text("index.html"), /<title>Home<\/title>/);
  assert.match(text("about.html"), /<h1>About<\/h1>|<h2>About<\/h2>|About/);
  assert.equal(text("_draft.html"), undefined);
  assert.equal(text("widgets.html"), undefined);
});

test("pages can import component files from pages/ but not other pages", async () => {
  const { text } = await build({
    "pages/index.sinth": 'import { Hero } from "./_partials/Hero.sinth"\nMain { Hero() }\n',
    "pages/_partials/Hero.sinth": 'export component Hero { Heading { "Hero" } }\n',
  });
  assert.match(text("index.html"), /Hero/);
  await assert.rejects(build({
    "pages/index.sinth": 'import { X } from "./about.sinth"\nMain { "x" }\n',
    "pages/about.sinth": 'export component X { "x" }\nMain { "About" }\n',
  }), err => err.code === "E0608");
});

test("without a pages folder, root files with markup are pages", async () => {
  const { out } = await build({
    "index.sinth": 'Main { "Root" }\n',
    "shared.sinth": 'export component Box { Div { $slot } }\n',
    "components/Card.sinth": 'Main { "not a page" }\n',
  });
  assert.deepEqual(out.pages.map(p => p.page.route), ["/"]);
});

test("an empty project explains how to add a page", async () => {
  await assert.rejects(build({ "sinth.config.json": "{}" }), err => err.code === "E0802" && /pages\/index\.sinth/.test(err.diagnostic.hint));
});

const POSTS = JSON.stringify([
  { slug: "hello-world", title: "Hello <World>", body: "First post" },
  { slug: "second", title: "Second", body: "Another one" },
]);

test("dynamic routes generate one page per path with params, metadata and runtime access", async () => {
  const { out, text } = await build({
    "content/posts.json": POSTS,
    "pages/blog/[slug].sinth": [
      'import posts from "../../content/posts.json"',
      "paths = posts.map((p) => p.slug)",
      "const post = posts.find((p) => p.slug == slug)",
      'title = post.title + " | Blog"',
      "descr = post.body",
      "var num likes = 0",
      'Main { Heading(level: 1) { post.title } Paragraph { post.body } Button(onClick: likes += 1) { "Like " + slug } }',
    ].join("\n"),
    "pages/[lang]/[page].sinth": 'paths = [{ lang: "en", page: "about" }, { lang: "de", page: "about" }]\ntitle = lang + "/" + page\nMain { f"{lang} {page}" }\n',
  });
  const routes = out.pages.map(p => p.page.route).sort();
  assert.deepEqual(routes, ["/blog/hello-world", "/blog/second", "/de/about", "/en/about"]);
  const html = text("blog/hello-world.html");
  assert.match(html, /<title>Hello &lt;World&gt; \| Blog<\/title>/);
  assert.match(html, /<meta name="description" content="First post">/);
  assert.match(html, /<h1>Hello &lt;World&gt;<\/h1>/);
  assert.match(html, /<script type="application\/json" id="sinth-params">\{"slug":"hello-world"\}<\/script>/);
  assert.match(text("blog/second.html"), /Like second/);
  assert.match(text("de/about.html"), /<title>de\/about<\/title>/);
  assert.equal(out.pages.find(p => p.page.route === "/de/about").interactive, false);
  const js = [...out.files.entries()].filter(([k]) => k.endsWith(".js")).map(([, f]) => Buffer.from(f.contents).toString()).join("\n");
  assert.match(js, /sinth-params/);
});

test("dynamic route errors are reported clearly", async () => {
  await assert.rejects(build({ "pages/[id].sinth": 'Main { id }\n' }), e => e.code === "E0710");
  await assert.rejects(build({ "pages/[id].sinth": 'paths = 5\nMain { id }\n' }), e => e.code === "E0711");
  await assert.rejects(build({ "pages/[id].sinth": 'paths = ["a/b"]\nMain { id }\n' }), e => e.code === "E0712");
  await assert.rejects(build({ "pages/[id].sinth": 'paths = ["a", "a"]\nMain { id }\n' }), e => e.code === "E0712");
  await assert.rejects(build({ "pages/[a].sinth": 'paths = [{ b: "x" }]\nMain { a }\n' }), e => e.code === "E0712");
  await assert.rejects(build({ "pages/x.sinth": 'paths = ["a"]\nMain { "x" }\n' }), e => e.code === "E0713");
  await assert.rejects(build({ "pages/[a-b].sinth": 'paths = ["a"]\nMain { "x" }\n' }), e => e.code === "E0714");
  await assert.rejects(build({ "pages/index.sinth": 'title = localStorage.getItem("t")\nMain { "x" }\n' }), e => e.code === "E0700");
});

test("metadata can be computed from constants", async () => {
  const { text } = await build({ "pages/index.sinth": 'const str site = "Acme"\ntitle = "Home | " + site\nMain { "x" }\n' });
  assert.match(text("index.html"), /<title>Home \| Acme<\/title>/);
});

test("the removed 'page' keyword is a compile error with a fix", async () => {
  const err = await build({ "pages/index.sinth": '-- home\npage\n\nMain { "x" }\n' }).then(() => null, e => e);
  assert.equal(err?.code, "E0104");
  assert.equal(err.loc.line, 2);
  assert.match(err.diagnostic.hint, /Delete this line/);
  const { text } = await build({ "pages/index.sinth": 'var num page = 2\nMain { "p" + page }\n' });
  assert.match(text("index.html"), /p2/);
});
