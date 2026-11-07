"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadConfig } = require("../dist/project/config");
const { Project } = require("../dist/project/project");
const { buildProject } = require("../dist/project/build");

function makeProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sinth-test-"));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return root;
}

function project(files, mode = "production") {
  const root = makeProject(files);
  const { config } = loadConfig(root, mode);
  config.minify = false;
  return new Project(root, config, mode === "development");
}

function compilePage(source, extra = {}) {
  const p = project({ "pages/index.sinth": source, ...extra });
  return p.compile(path.join(p.root, "pages/index.sinth"));
}

async function build(files) {
  const p = project(files);
  const out = await buildProject(p, { write: false });
  const text = rel => {
    const f = out.files.get(rel);
    return f ? Buffer.from(f.contents).toString("utf-8") : undefined;
  };
  return { p, out, text };
}

function expectError(fn, code) {
  try {
    fn();
  } catch (err) {
    if (code && err.code !== code) throw new Error(`Expected ${code}, got ${err.code}: ${err.message}`);
    return err;
  }
  throw new Error(`Expected error ${code ?? ""} but none was thrown`);
}

module.exports = { makeProject, project, compilePage, build, expectError };
