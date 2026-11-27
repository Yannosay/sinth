"use strict";
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { version } = require(path.join(root, "package.json"));
const runtime = fs.readFileSync(path.join(root, "dist/runtime/index.js"), "utf-8");
const ui = fs.readFileSync(path.join(root, "lib/ui/index.sinth"), "utf-8");

const contents = `
import { compileFiles as compile } from "./src/browser/compile";
export { SinthError, formatDiagnostic } from "./src/compiler/diagnostics";
export const version = ${JSON.stringify(version)};
export const runtimeSource = ${JSON.stringify(runtime)};
export function compileFiles(files, options = {}) {
  return compile(files, { ...options, builtins: { "sinth:ui": ${JSON.stringify(ui)}, ...options.builtins } });
}
`;

esbuild.buildSync({
  stdin: { contents, resolveDir: root, loader: "ts", sourcefile: "sinth-browser.ts" },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
  outfile: path.join(root, "dist/browser/sinth.js"),
  logLevel: "warning",
});
