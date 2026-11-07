import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { analyzeSource, formatSinth, parseParams } from "../../analysis";

const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
const pagePath = path.join(root, "pages", "index.sinth");

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function waitFor<T>(fn: () => T | undefined | Promise<T | undefined>, timeout = 30000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error("Timed out");
    await sleep(200);
  }
}

function labels(list: vscode.CompletionList): string[] {
  return list.items.map(i => (typeof i.label === "string" ? i.label : i.label.label));
}

suite("Sinth extension", () => {
  suiteSetup(async () => {
    const doc = await vscode.workspace.openTextDocument(pagePath);
    await vscode.window.showTextDocument(doc);
    await waitFor(() => vscode.extensions.getExtension("YannosayProductions.sinth-vscode")?.isActive);
  });

  test("assigns the sinth language", async () => {
    const doc = await vscode.workspace.openTextDocument(pagePath);
    assert.strictEqual(doc.languageId, "sinth");
  });

  test("parses component signatures", () => {
    const syms = analyzeSource("component Card(str title, bind value, num n = 2, str? sub) {\n}\nfunction add(num a, num b) -> num {}\nvar num count = 0");
    const card = syms.find(s => s.name === "Card");
    assert.ok(card);
    assert.deepStrictEqual(card.params.map(p => [p.name, p.optional, p.bindable]), [["title", false, false], ["value", false, true], ["n", true, false], ["sub", true, false]]);
    assert.strictEqual(syms.find(s => s.name === "add")?.returnType, "num");
    assert.strictEqual(syms.find(s => s.name === "count")?.kind, "var");
    assert.strictEqual(parseParams("str a = \"x, y\", num b").length, 2);
  });

  test("formats by brace depth", () => {
    assert.strictEqual(formatSinth("Main {\nDiv {\n\"x\"\n}\n}\n"), "Main {\n  Div {\n    \"x\"\n  }\n}\n");
  });

  test("completes elements, workspace components and sinth:ui", async () => {
    const doc = await vscode.workspace.openTextDocument(pagePath);
    const target = doc.getText().split(/\r?\n/).findIndex((l, i) => i > 8 && l.trim() === "");
    const list = await waitFor(async () => {
      const l = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, new vscode.Position(target, 2));
      return labels(l).includes("Card") ? l : undefined;
    });
    const names = labels(list);
    for (const expected of ["Paragraph", "Heading", "Card", "Modal", "computed", "onMount"]) assert.ok(names.includes(expected), `missing ${expected}`);
  });

  test("completes component parameters inside the attribute list", async () => {
    const doc = await vscode.workspace.openTextDocument(pagePath);
    const offset = doc.getText().indexOf("Card(") + "Card(".length;
    const list = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, doc.positionAt(offset));
    const names = labels(list);
    assert.ok(names.includes("accent"), names.slice(0, 20).join(","));
    assert.ok(names.includes("onClick"));
  });

  test("completes event modifiers", async () => {
    const doc = await vscode.workspace.openTextDocument({ language: "sinth", content: "page\nMain {\n  Button(onClick." });
    const list = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, new vscode.Position(2, 17));
    assert.ok(labels(list).includes("prevent"));
  });

  test("shows hover documentation", async () => {
    const doc = await vscode.workspace.openTextDocument(pagePath);
    const offset = doc.getText().indexOf("Paragraph") + 2;
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, doc.positionAt(offset));
    const text = hovers.map(h => h.contents.map(c => (typeof c === "string" ? c : (c as vscode.MarkdownString).value)).join("\n")).join("\n");
    assert.match(text, /<p>/);
  });

  test("goes to component definitions", async () => {
    const doc = await vscode.workspace.openTextDocument(pagePath);
    const offset = doc.getText().indexOf("Card(") + 1;
    const locs = await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeDefinitionProvider", doc.uri, doc.positionAt(offset));
    assert.ok(locs.length > 0);
    assert.ok(locs[0].uri.fsPath.endsWith(path.join("components", "Card.sinth")));
  });

  test("reports compiler diagnostics", async () => {
    const doc = await vscode.workspace.openTextDocument(pagePath);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("sinth.check");
    let diags: vscode.Diagnostic[];
    try {
      diags = await waitFor(() => {
        const d = vscode.languages.getDiagnostics(doc.uri);
        return d.length ? d : undefined;
      }, 30000);
    } catch {
      const logLines = await vscode.commands.executeCommand<string[]>("sinth.internal.log");
      const all = vscode.languages.getDiagnostics().map(([u, d]) => `${u.toString()}: ${d.length}`);
      throw new Error(["No diagnostics.", ...logLines, "All: " + all.join(", "), "Doc: " + doc.uri.toString()].join("\n"));
    }
    assert.ok(diags.some(d => /Unknown name 'cuont'/.test(d.message)), diags.map(d => d.message).join("\n"));
    assert.strictEqual(diags[0].source, "sinth");
  });
});
