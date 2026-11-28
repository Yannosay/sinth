"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("zlib");
const { desktopFiles, placeholderIcon, DESKTOP_DEV_PORT } = require("../dist/cli/desktop");
const { run } = require("./dom");
const { compilePage } = require("./helpers");

test("sinth desktop init writes a least-privilege Tauri project", () => {
  const files = desktopFiles({ name: "Order Desk", identifier: "com.acme.orders", version: "1.2.3", frontendDist: "../dist", sinthVersion: "5.4.0" });
  const conf = JSON.parse(files["tauri.conf.json"]);
  assert.equal(conf.identifier, "com.acme.orders");
  assert.equal(conf.version, "1.2.3");
  assert.equal(conf.build.frontendDist, "../dist");
  assert.equal(conf.build.devUrl, `http://127.0.0.1:${DESKTOP_DEV_PORT}`);
  assert.match(conf.build.beforeDevCommand, /@yannosay\/sinth@\^5\.4\.0 dev --port 1420 --strict-port$/);
  assert.match(conf.app.security.csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(conf.app.security.csp, /unsafe-eval/);
  const caps = JSON.parse(files["capabilities/default.json"]);
  assert.ok(caps.permissions.includes("fs:allow-read-text-file"));
  assert.ok(!caps.permissions.some(p => typeof p !== "string" || /fs:(default|scope|allow-.*-recursive)/.test(p)), "no static file scopes");
  assert.match(files["Cargo.toml"], /^name = "order_desk"$/m);
  assert.match(files["src/main.rs"], /tauri_plugin_dialog::init\(\)/);
});

test("the placeholder app icon is a valid 1024 px PNG", () => {
  const png = placeholderIcon();
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  const idat = png.indexOf("IDAT");
  const len = png.readUInt32BE(idat - 4);
  assert.equal(zlib.inflateSync(png.subarray(idat + 4, idat + 4 + len)).length, 1024 * (1 + 1024 * 4));
});

test("sinth:desktop compiles and falls back to web APIs in a browser", async () => {
  assert.ok(compilePage(`import { isDesktop, pickFile, saveFile, notify, confirmDialog, setTitle, openExternal } from "sinth:desktop"\nMain { Paragraph { isDesktop() ? "app" : "web" } }`).js);
  const app = await run(`import { isDesktop, setTitle } from "sinth:desktop"
Main {
  Paragraph(id: "mode") { isDesktop() ? "app" : "web" }
  Button(id: "t", onClick: setTitle("Renamed")) { "x" }
}`);
  assert.equal(app.text("#mode"), "web");
  app.$("#t").click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(app.doc.title, "Renamed");
});
