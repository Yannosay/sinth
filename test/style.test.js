"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { compileStyle } = require("../dist/compiler/style");

const loc = { file: "t.sinth", line: 1, col: 1 };
const css = (raw, scope, lang = "sinth") => compileStyle(raw, lang, { scope, varPrefix: "--v-", loc, sinthSyntax: true }).css;

test("camelCase properties and quoted values", () => {
  assert.equal(css('p { fontSize: "2rem"\n  WebkitUserSelect: "none" }'), "p {\n  font-size: 2rem;\n  -webkit-user-select: none;\n}");
});

test("element names, pseudo shorthands and nesting", () => {
  const out = css('Paragraph {\n  color: "red"\n  onHover { color: "blue" }\n  before { content: "\'→\'" }\n  & + & { marginTop: 0 }\n}');
  assert.match(out, /^p \{\n  color: red;/);
  assert.match(out, /p:hover \{\n  color: blue;/);
  assert.match(out, /p::before \{\n  content: '→';/);
  assert.match(out, /p \+ p \{/);
});

test("media() and shorthand media blocks", () => {
  const out = css('main {\n  padding: "2rem"\n  media(maxWidth: "600px") { padding: "1rem" }\n  dark { color: "white" }\n}');
  assert.match(out, /@media \(max-width: 600px\) \{\n  main \{\n    padding: 1rem;/);
  assert.match(out, /@media \(prefers-color-scheme: dark\)/);
});

test("comments are stripped but custom properties survive", () => {
  const out = css(':root {\n  -- a comment\n  --brand: "#7c3aed"\n  --[ block ]--\n}');
  assert.equal(out, ":root {\n  --brand: #7c3aed;\n}");
});

test("scoping appends the scope class before pseudo-elements", () => {
  const out = css(".card .title::after, a:hover, html, body > main, :global(.x) { color: red }", "s-1");
  assert.match(out, /\.card \.title\.s-1::after/);
  assert.match(out, /a:hover\.s-1/);
  assert.match(out, /^html,|,\nhtml,/m);
  assert.match(out, /body > main\.s-1/);
  assert.match(out, /^\.x \{|\n\.x \{|, \.x|\.x$/m);
});

test("keyframes are not scoped", () => {
  const out = css("@keyframes spin { from { transform: \"rotate(0)\" } to { transform: \"rotate(360deg)\" } }", "s-1");
  assert.doesNotMatch(out, /s-1/);
  assert.match(out, /@keyframes spin/);
});

test("plain CSS passes through unchanged in css mode", () => {
  const out = css(".a{color:red;background:url(http://x/y.png)}", undefined, "css");
  assert.equal(out, ".a {\n  color: red;\n  background: url(http://x/y.png);\n}");
});

test("reactive values are extracted", () => {
  const res = compileStyle(".a { width: (size * 2) + \"px\"; color: tone }", "sinth", { reactiveNames: new Set(["size", "tone"]), varPrefix: "--v-", loc, sinthSyntax: true });
  assert.equal(res.expressions.length, 2);
  assert.match(res.css, /width: var\(--v-0\)/);
});
