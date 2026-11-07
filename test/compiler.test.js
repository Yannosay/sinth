"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { tokenize } = require("../dist/compiler/lexer");
const { parseSinth } = require("../dist/compiler/parser");
const { compilePage, expectError } = require("./helpers");

test("lexer: comments, numbers, strings and custom-element keyword", () => {
  const toks = tokenize('-- line\n--[ block --[ nested ]-- ]--\nvar num x = 1_000.5e2 "a\\nb" custom-element', "t.sinth");
  const values = toks.map(t => t.value);
  assert.deepEqual(values.slice(0, 5), ["var", "num", "x", "=", "1000.5e2"]);
  assert.equal(toks[5].value, "a\nb");
  assert.equal(toks[6].value, "custom-element");
});

test("lexer: unterminated string reports a location", () => {
  const err = expectError(() => tokenize('page\nvar str s = "oops', "t.sinth"), "E0001");
  assert.equal(err.loc.line, 2);
});

test("parser: operator precedence follows math rules", () => {
  const out = compilePage("page\nvar num a = 2\nvar num b = 3\nMain { a + b * 4 - 6 / 2 % 4 }");
  assert.match(out.js, /\(\(a \+ \(b \* 4\)\) - \(\(6 \/ 2\) % 4\)\)/);
});

test("parser: f-strings and templates compile to template literals", () => {
  const out = compilePage('page\nvar str name = "x"\nMain { f"Hi {name}! {1 + 2}" }');
  assert.match(out.js, /`Hi \$\{\$\$\.toText\(name\)\}! \$\{\$\$\.toText\(\(1 \+ 2\)\)\}`/);
});

test("unknown names are compile errors with suggestions", () => {
  const err = expectError(() => compilePage("page\nvar num count = 0\nMain { cuont }"), "E0302");
  assert.match(err.diagnostic.hint, /count/);
});

test("missing function arguments are compile errors", () => {
  expectError(() => compilePage("page\nfunction add(num a, num b) -> num { return a + b }\nMain { add(1) }"), "E0315");
});

test("too many arguments are compile errors", () => {
  expectError(() => compilePage("page\nfunction one(num a) -> num { return a }\nMain { one(1, 2) }"), "E0314");
});

test("named arguments are reordered by parameter", () => {
  const out = compilePage('page\nfunction greet(str name, str greeting = "Hi") -> str { return greeting + name }\nMain { greet(greeting: "Yo", name: "A") }');
  assert.match(out.js, /greet\("A", "Yo"\)/);
});

test("type mismatch on assignment is an error", () => {
  expectError(() => compilePage('page\nvar num x = 1\nMain { Button(onClick: x = "a") { "go" } }'), "E0403");
  expectError(() => compilePage('page\nvar num x = "a"\nMain { x }'), "E0403");
});

test("comparing num and str is an error", () => {
  expectError(() => compilePage('page\nvar num x = 1\nMain { if x == "1" { "yes" } }'), "E0401");
});

test("parameters, constants and computed values are read-only", () => {
  expectError(() => compilePage("page\nconst num x = 1\nMain { Button(onClick: x = 2) { \"go\" } }"), "E0391");
  expectError(() => compilePage("page\nvar num a = 1\ncomputed num b = a * 2\nMain { Button(onClick: b = 2) { \"go\" } }"), "E0392");
  const comp = "component C(str t) {\n  Button(onClick: t = \"x\") { t }\n}\n";
  expectError(() => compilePage("page\nimport { C } from \"../components/C.sinth\"\nMain { C(t: \"a\") }", { "components/C.sinth": comp }), "E0390");
});

test("missing required component parameters are errors", () => {
  const comp = "component Card(str title) {\n  Div { title }\n}\n";
  expectError(() => compilePage('page\nimport { Card } from "../components/Card.sinth"\nMain { Card }', { "components/Card.sinth": comp }), "E0360");
});

test("unknown components are errors with suggestions", () => {
  const err = expectError(() => compilePage("page\nMain { Paragrph { \"x\" } }"), "E0301");
  assert.match(err.diagnostic.hint, /Paragraph/);
});

test("inline lowercase event attributes are rejected", () => {
  expectError(() => compilePage('page\nMain { Button(onclick: "alert(1)") { "x" } }'), "E0334");
});

test("event handlers never become HTML attributes", () => {
  const out = compilePage("page\nvar num n = 0\nMain { Button(onClick: n += 1) { \"x\" } }");
  assert.doesNotMatch(out.js, /setAttribute\("onclick"/);
  assert.match(out.js, /\$\$\.on\(\$\$e\d+, "click"/);
});

test("== compiles to strict equality", () => {
  const out = compilePage("page\nvar num a = 1\nMain { if a == 1 and not (a != 2) { \"y\" } }");
  assert.match(out.js, /\(a === 1\)/);
  assert.match(out.js, /\(a !== 2\)/);
});

test("reserved words cannot be variable names", () => {
  expectError(() => parseSinth("page\nvar str class = \"x\"", "t.sinth"), "E0102");
});

test("script blocks are syntax-checked with correct line numbers", () => {
  const err = expectError(() => compilePage("page\nMain { \"x\" }\nscript {\n  let a = ;\n}"), "E0500");
  assert.equal(err.loc.line, 4);
});

test("names declared in script blocks are visible to Sinth code", () => {
  const out = compilePage("page\nMain { Button(onClick: hello()) { \"x\" } }\nscript {\n  function hello() {}\n}");
  assert.match(out.js, /function hello\(\)/);
});

test("extern declares browser globals", () => {
  expectError(() => compilePage("page\nMain { Button(onClick: Chart.update()) { \"x\" } }"), "E0302");
  compilePage("page\nextern Chart\nMain { Button(onClick: Chart.update()) { \"x\" } }");
});

test("circular imports are detected", () => {
  const a = 'import "./B.sinth"\ncomponent A { Div { "a" } }\n';
  const b = 'import "./A.sinth"\ncomponent B { Div { "b" } }\n';
  expectError(() => compilePage('page\nimport "../components/A.sinth"\nMain { A }', { "components/A.sinth": a, "components/B.sinth": b }), "E0609");
});

test("importing a missing name lists available exports", () => {
  const comp = "component Card { Div { \"c\" } }\n";
  const err = expectError(() => compilePage('page\nimport { Crad } from "../components/Card.sinth"\nMain { Crad }', { "components/Card.sinth": comp }), "E0602");
  assert.match(err.diagnostic.hint, /Card/);
});

test("default imports pick the component named like the file", () => {
  const comp = "component Card { Div { \"c\" } }\ncomponent Other { Div { \"o\" } }\n";
  const out = compilePage('page\nimport Tile from "../components/Card.sinth"\nMain { Tile }', { "components/Card.sinth": comp });
  assert.match(out.js, /\$\$m1\.Card/);
});

test("namespace imports allow UI.Card style usage", () => {
  const comp = "component Card { Div { \"c\" } }\n";
  const out = compilePage('page\nimport * as UI from "../components/Card.sinth"\nMain { UI.Card }', { "components/Card.sinth": comp });
  assert.match(out.js, /\$\$m1\.Card/);
});

test("sinth:ui library resolves and exposes components", () => {
  const out = compilePage('page\nimport { Button, Card } from "sinth:ui"\nMain { Card(title: "t") { Button { "go" } } }');
  assert.match(out.js, /from ".*lib[\\/]+ui[\\/]+index\.sinth"/);
});

test("legacy `import SinthUI` still works", () => {
  compilePage("page\nimport SinthUI\nMain { Button { \"x\" } }");
});

test("json imports inline data", () => {
  const out = compilePage('page\nimport data from "./data.json"\nMain { data.name }', { "pages/data.json": "{\"name\":\"Sinth\"}" });
  assert.match(out.js, /const data = \{"name":"Sinth"\}/);
});

test("Heading level must be a literal from 1 to 6", () => {
  expectError(() => compilePage("page\nMain { Heading(level: 9) { \"x\" } }"), "E0320");
});

test("component styles are scoped and reactive values become custom properties", () => {
  const comp = 'component Box(str color = "red") {\n  Div(class: "box") { "x" }\n  style {\n    .box { backgroundColor: color; padding: "1rem"; onHover { opacity: 0.5 } }\n  }\n}\n';
  const out = compilePage('page\nimport { Box } from "../components/Box.sinth"\nMain { Box }', { "components/Box.sinth": comp });
  assert.equal(out.css, "");
  const { project } = require("./helpers");
  const p = project({ "components/Box.sinth": comp });
  const boxOut = p.compile(require("path").join(p.root, "components/Box.sinth"));
  assert.match(boxOut.css, /\.box\.s-[a-z0-9]+ \{\n  background-color: var\(--sv-/);
  assert.match(boxOut.css, /\.box:hover\.s-[a-z0-9]+/);
  assert.match(boxOut.js, /\$\$\.cssVars/);
});

test("string event handlers are compile errors with a fix hint", () => {
  const err = expectError(() => compilePage('page\nMain { Button(onClick: "save") { "x" } }'), "E0351");
  assert.match(err.diagnostic.hint, /onClick: save\(\)/);
});
