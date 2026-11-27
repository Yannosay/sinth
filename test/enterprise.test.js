"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { build, project, expectError } = require("./helpers");
const { run } = require("./dom");
const { buildProject } = require("../dist/project/build");
const { isUnsafeUrl } = require("../dist/compiler/html");
const { hostAllowed } = require("../dist/server/static");
const { matchRedirect, redirectsFile } = require("../dist/deploy/redirects");
const { parseEnvFile } = require("../dist/project/env");

test("unsafe URLs are blocked even when obfuscated with whitespace or control characters", () => {
  for (const url of ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "java\nscript:x", "\u0001javascript:x", "vbscript:x", "data:text/html,<script>x</script>"]) {
    assert.equal(isUnsafeUrl(url), true, JSON.stringify(url));
  }
  for (const url of ["/about", "https://example.com", "mailto:a@b.c", "javascript-guide.html", "data:image/png;base64,AAAA", "#top"]) {
    assert.equal(isUnsafeUrl(url), false, JSON.stringify(url));
  }
});

test("prerendered and runtime links neutralize obfuscated javascript: URLs", async () => {
  const { text } = await build({ "pages/index.sinth": 'const str u = "java\\tscript:alert(1)"\nMain { Link(href: u) { "x" } Link(href: "data:text/html,hi") { "y" } }' });
  const html = text("index.html");
  assert.equal((html.match(/about:blank#blocked/g) || []).length, 2);
  const app = await run('var str u = "/ok"\nMain { Link(id: "l", href: u) { "x" } Button(id: "b", onClick: u = "java\\nscript:alert(1)") { "go" } }');
  app.$("#b").click();
  assert.equal(app.$("#l").getAttribute("href"), "about:blank#blocked");
});

test("dev and preview servers only answer to local or allowed host names", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "app.localhost", "192.168.1.20:3000", undefined]) assert.equal(hostAllowed(host, []), true, host);
  assert.equal(hostAllowed("evil.example:3000", []), false);
  assert.equal(hostAllowed("demo.ngrok.app", [".ngrok.app"]), true);
  assert.equal(hostAllowed("anything.example", true), true);
});

test("redirects match exact paths, params and splats", () => {
  const rules = [
    { from: "/old", to: "/new", status: 301 },
    { from: "/blog/:slug", to: "/posts/:slug", status: 308 },
    { from: "/docs/*", to: "https://docs.example.com/:splat", status: 302 },
  ];
  assert.deepEqual(matchRedirect(rules, "/old", "?a=1"), { location: "/new?a=1", status: 301 });
  assert.deepEqual(matchRedirect(rules, "/old/"), { location: "/new", status: 301 });
  assert.deepEqual(matchRedirect(rules, "/blog/hello"), { location: "/posts/hello", status: 308 });
  assert.deepEqual(matchRedirect(rules, "/docs/a/b"), { location: "https://docs.example.com/a/b", status: 302 });
  assert.equal(matchRedirect(rules, "/blog/a/b"), null);
  assert.equal(redirectsFile(rules.slice(0, 1), "/site/"), "/site/old /site/new 301\n");
});

test("redirects and custom headers are written for each platform", async () => {
  const config = { redirects: { "/old": "/", "/blog/:slug": { to: "/posts/:slug", status: 302 } }, headers: { "/api/*": { "Access-Control-Allow-Origin": "*" } } };
  const files = { "pages/index.sinth": 'Main { "Home" }\n', "public/_headers": "/x\n  X-User: 1\n" };
  const cf = await build({ ...files, "sinth.config.json": JSON.stringify(config) });
  assert.equal(cf.text("_redirects"), "/old / 301\n/blog/:slug /posts/:slug 302\n");
  const headers = cf.text("_headers");
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /\/api\/\*\n {2}Access-Control-Allow-Origin: \*/);
  assert.match(headers, /X-User: 1/, "a _headers file from public/ is kept");

  const p = project({ ...files, "sinth.config.json": JSON.stringify({ ...config, platform: "vercel" }) });
  await buildProject(p, { write: true });
  const vercel = JSON.parse(fs.readFileSync(path.join(p.root, ".vercel/output/config.json"), "utf-8"));
  const fsIndex = vercel.routes.findIndex(r => r.handle === "filesystem");
  const redirect = vercel.routes.findIndex(r => r.status === 302);
  assert.ok(redirect !== -1 && redirect < fsIndex);
  assert.equal(vercel.routes[redirect].headers.Location, "/posts/$1");
  assert.ok("/blog/x".match(new RegExp(vercel.routes[redirect].src)));

  const gh = await build({ ...files, "sinth.config.json": JSON.stringify({ ...config, platform: "github-pages" }) });
  assert.match(gh.text("old/index.html"), /http-equiv="refresh" content="0; url=\/"/);
  assert.ok(gh.out.warnings.some(w => w.code === "W0811"));
});

test("redirects and headers are validated", () => {
  expectError(() => project({ "pages/index.sinth": "Main {}", "sinth.config.json": JSON.stringify({ redirects: { old: "/new" } }) }), "E0900");
  expectError(() => project({ "pages/index.sinth": "Main {}", "sinth.config.json": JSON.stringify({ redirects: { "/a": { to: "/b", status: 200 } } }) }), "E0900");
  expectError(() => project({ "pages/index.sinth": "Main {}", "sinth.config.json": JSON.stringify({ headers: { "/*": { "X-A": "a\r\nSet-Cookie: x" } } }) }), "E0900");
});

test("sinth:env exposes PUBLIC_ variables and rejects everything else at compile time", async () => {
  const env = { ".env": "PUBLIC_API=https://api.example.com\nSECRET=shh\n", ".env.production": "PUBLIC_NAME=\"Prod # site\" # comment\n" };
  const { text } = await build({ ...env, "pages/index.sinth": 'import { PUBLIC_API, PUBLIC_NAME } from "sinth:env"\ntitle = PUBLIC_NAME\nMain { P { PUBLIC_API } }' });
  const html = text("index.html");
  assert.match(html, /<title>Prod # site<\/title>/);
  assert.match(html, /https:\/\/api\.example\.com/);
  const secret = await build({ ...env, "pages/index.sinth": 'import { SECRET } from "sinth:env"\nMain { P { SECRET } }' }).catch(e => e);
  assert.equal(secret.code, "E0607");
  assert.match(secret.diagnostic.hint, /PUBLIC_/);
  const all = await build({ ...env, "pages/index.sinth": 'import env from "sinth:env"\nMain { P { JSON.stringify(env) } }' });
  assert.doesNotMatch(all.text("index.html"), /shh/);
});

test("dotenv files support quotes, export and comments", () => {
  const p = project({ "pages/index.sinth": "Main {}", ".env": 'export A=1\nB="two words"\nC=\'single\'\nD=plain # note\n# E=no\nF="line\\nbreak"\n' });
  assert.deepEqual(parseEnvFile(path.join(p.root, ".env")), { A: "1", B: "two words", C: "single", D: "plain", F: "line\nbreak" });
});

test("sites with a site URL get an llms.txt index for AI assistants", async () => {
  const { text } = await build({
    "sinth.config.json": JSON.stringify({ site: "https://example.com" }),
    "pages/index.sinth": 'title = "Acme"\ndescr = "Tools for builders."\nMain { "Home" }',
    "pages/docs.sinth": 'title = "Docs"\nMain { "Docs" }',
    "pages/404.sinth": 'Main { "Missing" }',
  });
  assert.equal(text("llms.txt"), "# Acme\n\n> Tools for builders.\n\n## Pages\n\n- [Acme](https://example.com/): Tools for builders.\n- [Docs](https://example.com/docs)\n");
});

test("sinth skill installs the bundled skill and an idempotent AGENTS.md section", () => {
  const { installSkill } = require("../dist/cli/skill");
  const p = project({ "pages/index.sinth": "Main {}", "AGENTS.md": "# Rules\n\nBe nice.\n\n## Sinth\n\nold\n\n## Other\n\nkeep\n" });
  installSkill(p.root, { claude: false, agents: false, global: false }, "0.0.0");
  installSkill(p.root, { claude: false, agents: false, global: false }, "0.0.0");
  assert.ok(fs.existsSync(path.join(p.root, ".agents/skills/sinth/SKILL.md")));
  assert.ok(fs.existsSync(path.join(p.root, ".agents/skills/sinth/references/language.md")));
  const agents = fs.readFileSync(path.join(p.root, "AGENTS.md"), "utf-8");
  assert.equal(agents.match(/## Sinth/g).length, 1);
  assert.match(agents, /Be nice\./);
  assert.match(agents, /## Other\n\nkeep/);
  assert.doesNotMatch(agents, /\nold\n/);
  fs.mkdirSync(path.join(p.root, ".claude"));
  installSkill(p.root, { claude: false, agents: false, global: false }, "0.0.0");
  assert.ok(fs.existsSync(path.join(p.root, ".claude/skills/sinth/SKILL.md")));
});
