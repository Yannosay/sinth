"use strict";
// Compiles every `sinth live` example in docs/ so the documentation cannot drift from the compiler.
const fs = require("fs");
const path = require("path");
const { compileFiles, formatDiagnostic } = require("../dist/index");

const docs = path.join(__dirname, "..", "docs");
const ui = fs.readFileSync(path.join(__dirname, "..", "lib", "ui", "index.sinth"), "utf-8");
const all = process.argv.includes("--all");
let checked = 0;
const failures = [];

for (const section of fs.readdirSync(docs, { withFileTypes: true })) {
  if (!section.isDirectory()) continue;
  for (const name of fs.readdirSync(path.join(docs, section.name))) {
    if (!name.endsWith(".md")) continue;
    const file = path.join(section.name, name);
    const text = fs.readFileSync(path.join(docs, file), "utf-8").replace(/\r\n/g, "\n");
    for (const m of text.matchAll(/```sinth( live)?\n([\s\S]*?)```/g)) {
      if (!m[1] && !all) continue;
      checked++;
      try {
        compileFiles({ "/pages/index.sinth": m[2] }, { builtins: { "sinth:ui": ui } });
      } catch (err) {
        const line = text.slice(0, m.index).split("\n").length;
        failures.push(`${file}:${line}\n${err.diagnostic ? formatDiagnostic(err.diagnostic) : err.stack}`);
      }
    }
  }
}

for (const f of failures) console.error(f + "\n");
console.log(`${checked - failures.length}/${checked} documentation examples compile`);
process.exit(failures.length ? 1 : 0);
