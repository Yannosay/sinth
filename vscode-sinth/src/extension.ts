import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { analyzeSource, enclosingCall, formatSinth, ParamInfo, SymbolInfo } from "./analysis";
import { COMMON_ATTRS, DIRECTIVES, ELEMENTS, EVENT_MODIFIERS, EVENTS, KEYWORD_DOCS, META_KEYS, SINTH_UI, TYPES } from "./data";

const SELECTOR: vscode.DocumentSelector = { language: "sinth" };
const DOCS_URL = "https://github.com/Yannosay/sinth/blob/main/DOCS.md";

interface IndexedSymbol extends SymbolInfo {
  uri: vscode.Uri;
}

class WorkspaceIndex {
  private readonly files = new Map<string, IndexedSymbol[]>();

  async rebuild(): Promise<void> {
    this.files.clear();
    const uris = await vscode.workspace.findFiles("**/*.sinth", "**/{node_modules,dist,.git}/**", 5000);
    await Promise.all(uris.map(u => this.update(u)));
  }

  async update(uri: vscode.Uri, text?: string): Promise<void> {
    try {
      const source = text ?? Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      this.files.set(uri.toString(), analyzeSource(source).map(s => ({ ...s, uri })));
    } catch {
      this.files.delete(uri.toString());
    }
  }

  remove(uri: vscode.Uri): void {
    this.files.delete(uri.toString());
  }

  components(): IndexedSymbol[] {
    const out: IndexedSymbol[] = [];
    for (const list of this.files.values()) out.push(...list.filter(s => s.kind === "component"));
    return out;
  }

  inFile(uri: vscode.Uri): IndexedSymbol[] {
    return this.files.get(uri.toString()) ?? [];
  }

  findComponent(name: string): IndexedSymbol | undefined {
    return this.components().find(c => c.name === name);
  }
}

const index = new WorkspaceIndex();
let output: vscode.OutputChannel;
const recentLog: string[] = [];

function log(line: string): void {
  recentLog.push(line);
  if (recentLog.length > 50) recentLog.shift();
  output.appendLine(line);
}

function paramDoc(p: ParamInfo): string {
  return `${p.bindable ? "bind " : ""}${p.type ? p.type + " " : ""}${p.name}${p.defaultValue !== undefined ? " = " + p.defaultValue : ""}`;
}

function importedNames(text: string): Map<string, string> {
  const names = new Map<string, string>();
  const re = /import\s+(?:\{([^}]*)\}|([A-Za-z_]\w*)|\*\s+as\s+(\w+))?\s*(?:from\s+)?"([^"]+)"/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1]) for (const part of m[1].split(",")) {
      const [orig, alias] = part.split(/\s+as\s+/).map(s => s.trim());
      if (orig) names.set(alias ?? orig, m[4]);
    }
    if (m[2]) names.set(m[2], m[4]);
    if (m[3]) names.set(m[3], m[4]);
  }
  return names;
}

function relativeImport(from: vscode.Uri, to: vscode.Uri): string {
  let rel = path.relative(path.dirname(from.fsPath), to.fsPath).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function importEdit(doc: vscode.TextDocument, name: string, source: string): vscode.TextEdit {
  const text = doc.getText();
  const existing = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).exec(text);
  if (existing) {
    const start = doc.positionAt(existing.index + existing[0].indexOf("{") + 1);
    const end = doc.positionAt(existing.index + existing[0].indexOf("}"));
    const names = existing[1].split(",").map(s => s.trim()).filter(Boolean);
    names.push(name);
    return vscode.TextEdit.replace(new vscode.Range(start, end), " " + names.join(", ") + " ");
  }
  let line = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(page\b|import\b)/.test(lines[i])) line = i + 1;
    else if (lines[i].trim() && !lines[i].trim().startsWith("--")) break;
  }
  const prefix = line > 0 && /^\s*page\b/.test(lines[line - 1]) ? "\n" : "";
  return vscode.TextEdit.insert(new vscode.Position(line, 0), `${prefix}import { ${name} } from "${source}"\n`);
}

function isEmpty(doc: vscode.TextDocument): boolean {
  return doc.getText().trim().length === 0;
}

const completionProvider: vscode.CompletionItemProvider = {
  provideCompletionItems(doc, position) {
    const lineText = doc.lineAt(position.line).text;
    const before = lineText.slice(0, position.character);
    const items: vscode.CompletionItem[] = [];
    const K = vscode.CompletionItemKind;

    if (isEmpty(doc)) {
      const page = new vscode.CompletionItem("page", K.Snippet);
      page.insertText = new vscode.SnippetString('page\n\ntitle = "${1:Title}"\n\nMain {\n  Heading(level: 1) { "${1:Title}" }\n  $0\n}\n');
      page.documentation = "New page";
      items.push(page);
    }

    const importPath = before.match(/(?:import\s+(?:css\s+)?|from\s+)"([^"]*)$/);
    if (importPath) {
      const lib = new vscode.CompletionItem("sinth:ui", K.Module);
      lib.detail = "Built-in component library";
      items.push(lib);
      for (const comp of index.components()) {
        if (comp.uri.toString() === doc.uri.toString()) continue;
        const rel = relativeImport(doc.uri, comp.uri);
        const it = new vscode.CompletionItem(rel, K.File);
        it.detail = comp.name;
        if (!items.some(i => i.label === rel)) items.push(it);
      }
      return items;
    }

    const mod = before.match(/\bon[A-Z]\w*(?:\.\w+)*\.(\w*)$/);
    if (mod) {
      for (const [m, docText] of Object.entries(EVENT_MODIFIERS)) {
        const it = new vscode.CompletionItem(m, K.EnumMember);
        it.documentation = docText;
        items.push(it);
      }
      return items;
    }

    const textBefore = doc.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 40), 0), position));
    const call = enclosingCall(textBefore);
    if (call && /^[A-Z]/.test(call.name)) {
      const already = new Set(Array.from(call.argText.matchAll(/(?:^|[,\n(]\s*)([A-Za-z][\w-]*)(?:\.\w+)*\s*:/g)).map(m => m[1]));
      const user = index.findComponent(call.name);
      const ui = SINTH_UI[call.name];
      if (user) {
        user.params.forEach((p, i) => {
          if (already.has(p.name)) return;
          const it = new vscode.CompletionItem({ label: p.name, description: paramDoc(p) }, K.Field);
          it.insertText = new vscode.SnippetString(`${p.name}: $0`);
          it.sortText = (p.optional ? "1" : "0") + String(i).padStart(3, "0");
          it.detail = p.optional ? "optional" : "required";
          items.push(it);
        });
      } else if (ui && importedNames(doc.getText()).get(call.name) === "sinth:ui") {
        ui.params.forEach((p, i) => {
          if (already.has(p)) return;
          const it = new vscode.CompletionItem({ label: p, description: "sinth:ui" }, K.Field);
          it.insertText = new vscode.SnippetString(`${p}: $0`);
          it.sortText = "0" + String(i).padStart(3, "0");
          items.push(it);
        });
      }
      for (const [d, docText] of Object.entries(DIRECTIVES)) {
        if (already.has(d)) continue;
        const it = new vscode.CompletionItem(d, K.Property);
        it.insertText = new vscode.SnippetString(`${d}: $0`);
        it.documentation = docText;
        it.sortText = "2" + d;
        items.push(it);
      }
      for (const e of EVENTS) {
        const it = new vscode.CompletionItem(e, K.Event);
        it.insertText = new vscode.SnippetString(`${e}: $0`);
        it.sortText = "3" + e;
        items.push(it);
      }
      for (const a of COMMON_ATTRS) {
        if (already.has(a)) continue;
        const it = new vscode.CompletionItem(a, K.Field);
        it.insertText = new vscode.SnippetString(`${a}: $0`);
        it.sortText = "4" + a;
        items.push(it);
      }
      return items;
    }

    const imported = importedNames(doc.getText());
    for (const e of ELEMENTS) {
      const it = new vscode.CompletionItem({ label: e.name, description: `<${e.tag}>` }, K.Class);
      it.insertText = new vscode.SnippetString(e.name === "Heading" ? "Heading(level: ${1|1,2,3,4,5,6|}) { $0 }" : `${e.name} { $0 }`);
      it.documentation = e.note;
      it.sortText = "5" + e.name;
      items.push(it);
    }
    for (const comp of index.components()) {
      const local = comp.uri.toString() === doc.uri.toString();
      const it = new vscode.CompletionItem({ label: comp.name, description: local ? "this file" : vscode.workspace.asRelativePath(comp.uri) }, K.Module);
      const required = comp.params.filter(p => !p.optional);
      it.insertText = new vscode.SnippetString(required.length
        ? `${comp.name}(${required.map((p, i) => `${p.name}: \${${i + 1}}`).join(", ")}) { $0 }`
        : `${comp.name} { $0 }`);
      it.detail = comp.signature;
      it.sortText = "4" + comp.name;
      if (!local && !imported.has(comp.name)) it.additionalTextEdits = [importEdit(doc, comp.name, relativeImport(doc.uri, comp.uri))];
      items.push(it);
    }
    for (const [name, info] of Object.entries(SINTH_UI)) {
      if (index.findComponent(name)) continue;
      const it = new vscode.CompletionItem({ label: name, description: "sinth:ui" }, K.Module);
      it.documentation = new vscode.MarkdownString(info.doc);
      it.insertText = new vscode.SnippetString(`${name} { $0 }`);
      it.sortText = "6" + name;
      if (!imported.has(name)) it.additionalTextEdits = [importEdit(doc, name, "sinth:ui")];
      items.push(it);
    }
    for (const sym of index.inFile(doc.uri)) {
      if (sym.kind === "component") continue;
      const it = new vscode.CompletionItem({ label: sym.name, description: sym.varType ?? sym.returnType ?? "" }, sym.kind === "function" ? K.Function : K.Variable);
      it.detail = sym.signature;
      it.sortText = "1" + sym.name;
      items.push(it);
    }
    for (const [k, d] of Object.entries(KEYWORD_DOCS)) {
      const it = new vscode.CompletionItem(k, K.Keyword);
      it.documentation = new vscode.MarkdownString(d);
      it.sortText = "7" + k;
      items.push(it);
    }
    for (const t of TYPES) {
      const it = new vscode.CompletionItem(t, K.TypeParameter);
      it.sortText = "8" + t;
      items.push(it);
    }
    if (/^\s*\w*$/.test(before) && /^\s*page\b/m.test(doc.getText())) {
      for (const [k, d] of Object.entries(META_KEYS)) {
        const it = new vscode.CompletionItem({ label: k, description: "metadata" }, K.Property);
        it.insertText = new vscode.SnippetString(`${k} = "$0"`);
        it.documentation = d;
        it.sortText = "9" + k;
        items.push(it);
      }
    }
    return items;
  },
};

const hoverProvider: vscode.HoverProvider = {
  provideHover(doc, position) {
    const range = doc.getWordRangeAtPosition(position, /\$?[A-Za-z_][\w$]*/);
    if (!range) return undefined;
    const word = doc.getText(range);
    const md = new vscode.MarkdownString();
    const user = index.findComponent(word);
    const local = index.inFile(doc.uri).find(s => s.name === word && s.kind !== "component");
    const element = ELEMENTS.find(e => e.name === word);
    if (user && /^[A-Z]/.test(word)) {
      md.appendCodeblock(user.signature, "sinth");
      md.appendMarkdown(`\n\nDefined in \`${vscode.workspace.asRelativePath(user.uri)}\``);
      if (user.params.length) md.appendMarkdown("\n\n" + user.params.map(p => `- \`${p.name}\`${p.optional ? "" : " (required)"}${p.bindable ? " · two-way" : ""}`).join("\n"));
    } else if (local) {
      md.appendCodeblock(local.signature, "sinth");
    } else if (SINTH_UI[word] && importedNames(doc.getText()).get(word) === "sinth:ui") {
      md.appendMarkdown(`**${word}** · sinth:ui\n\n${SINTH_UI[word].doc}\n\nParameters: ${SINTH_UI[word].params.map(p => "`" + p + "`").join(", ")}`);
    } else if (element) {
      md.appendMarkdown(`**${word}** renders \`<${element.tag}>\`${element.note ? "\n\n" + element.note : ""}`);
    } else if (KEYWORD_DOCS[word]) {
      md.appendMarkdown(`**${word}**\n\n${KEYWORD_DOCS[word]}`);
    } else if (DIRECTIVES[word] && /^\s*:/.test(doc.lineAt(position.line).text.slice(range.end.character))) {
      md.appendMarkdown(`**${word}:** ${DIRECTIVES[word]}`);
    } else if (META_KEYS[word] && /^\s*=/.test(doc.lineAt(position.line).text.slice(range.end.character))) {
      md.appendMarkdown(`**${word}** (page metadata)\n\n${META_KEYS[word]}`);
    } else if (EVENT_MODIFIERS[word] && doc.getText(new vscode.Range(range.start.translate(0, -1), range.start)) === ".") {
      md.appendMarkdown(`**.${word}** ${EVENT_MODIFIERS[word]}`);
    } else return undefined;
    return new vscode.Hover(md, range);
  },
};

const definitionProvider: vscode.DefinitionProvider = {
  provideDefinition(doc, position) {
    const range = doc.getWordRangeAtPosition(position, /[A-Za-z_][\w$]*/);
    if (!range) return undefined;
    const word = doc.getText(range);
    const local = index.inFile(doc.uri).find(s => s.name === word);
    const target = local ?? index.components().find(c => c.name === word);
    if (!target) return undefined;
    return new vscode.Location(target.uri, new vscode.Position(target.line, target.character));
  },
};

const signatureProvider: vscode.SignatureHelpProvider = {
  provideSignatureHelp(doc, position) {
    const textBefore = doc.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 20), 0), position));
    const call = enclosingCall(textBefore);
    if (!call) return undefined;
    const name = call.name.replace(/^\$/, "");
    const sym = index.inFile(doc.uri).find(s => s.name === name && s.kind === "function") ?? (/^[A-Z]/.test(name) ? index.findComponent(name) : undefined);
    if (!sym || !sym.params.length) return undefined;
    const sig = new vscode.SignatureInformation(sym.signature);
    sig.parameters = sym.params.map(p => new vscode.ParameterInformation(paramDoc(p)));
    const help = new vscode.SignatureHelp();
    help.signatures = [sig];
    help.activeSignature = 0;
    help.activeParameter = Math.min(sym.params.length - 1, (call.argText.match(/,/g) ?? []).length);
    return help;
  },
};

const symbolProvider: vscode.DocumentSymbolProvider = {
  provideDocumentSymbols(doc) {
    return analyzeSource(doc.getText()).map(s => {
      const pos = new vscode.Position(s.line, s.character);
      const kind = s.kind === "component" ? vscode.SymbolKind.Class : s.kind === "function" ? vscode.SymbolKind.Function : vscode.SymbolKind.Variable;
      return new vscode.DocumentSymbol(s.name, s.signature, kind, new vscode.Range(pos, pos), new vscode.Range(pos, pos));
    });
  },
};

const formatter: vscode.DocumentFormattingEditProvider = {
  provideDocumentFormattingEdits(doc, options) {
    const text = doc.getText();
    const formatted = formatSinth(text, options.insertSpaces ? " ".repeat(options.tabSize) : "\t");
    if (formatted === text) return [];
    return [vscode.TextEdit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), formatted)];
  },
};

function projectRootFor(file: string): string | undefined {
  let dir = path.dirname(file);
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file))?.uri.fsPath;
  for (;;) {
    if (fs.existsSync(path.join(dir, "sinth.config.json")) || fs.existsSync(path.join(dir, "package.json")) || fs.existsSync(path.join(dir, "pages"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir || (folder && !parent.startsWith(folder))) return folder ?? dir;
    dir = parent;
  }
}

function compilerCommand(root: string): { cmd: string; args: string[]; shell: boolean } | undefined {
  const configured = vscode.workspace.getConfiguration("sinth").get<string>("compilerPath", "").trim();
  if (configured) {
    const resolved = path.isAbsolute(configured) ? configured : path.join(root, configured);
    if (/\.(c?js|mjs)$/.test(resolved)) return { cmd: "node", args: [resolved], shell: false };
    return { cmd: configured, args: [], shell: process.platform === "win32" };
  }
  const local = path.join(root, "node_modules", "@yannosay", "sinth", "bin", "sinth.js");
  if (fs.existsSync(local)) return { cmd: "node", args: [local], shell: false };
  return { cmd: "sinth", args: [], shell: process.platform === "win32" };
}

function terminalPrefix(root: string): string {
  const configured = vscode.workspace.getConfiguration("sinth").get<string>("compilerPath", "").trim();
  if (configured) return /\.(c?js|mjs)$/.test(configured) ? `node "${configured}"` : configured;
  return fs.existsSync(path.join(root, "node_modules", "@yannosay", "sinth")) ? "npx sinth" : "sinth";
}

interface CheckDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  hint?: string;
  loc?: { file: string; line: number; col: number; length?: number };
}

class Diagnostics {
  readonly collection = vscode.languages.createDiagnosticCollection("sinth");
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly running = new Map<string, cp.ChildProcess>();
  private warnedMissing = false;

  schedule(doc: vscode.TextDocument, delay = 300): void {
    if (doc.languageId !== "sinth" || doc.uri.scheme !== "file") return;
    if (!vscode.workspace.getConfiguration("sinth").get<boolean>("diagnostics.enabled", true)) return;
    const root = projectRootFor(doc.uri.fsPath);
    if (!root) return;
    clearTimeout(this.timers.get(root));
    this.timers.set(root, setTimeout(() => this.run(root), delay));
  }

  run(root: string): void {
    const command = compilerCommand(root);
    if (!command) return;
    this.running.get(root)?.kill();
    log(`check: ${command.cmd} ${[...command.args, "check", "--json", "--root", root].join(" ")}`);
    const args = [...command.args, "check", "--json", "--root", root];
    const child = cp.spawn(command.cmd, command.shell ? args.map(a => (/\s/.test(a) ? `"${a}"` : a)) : args, {
      cwd: root, shell: command.shell, env: { ...process.env, NO_COLOR: "1", SINTH_NO_UPDATE_CHECK: "1" }, windowsHide: true,
    });
    this.running.set(root, child);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", d => (stdout += d));
    child.stderr?.on("data", d => (stderr += d));
    child.on("error", err => this.missingCompiler(String(err)));
    child.on("close", () => {
      if (this.running.get(root) !== child) return;
      this.running.delete(root);
      const start = stdout.indexOf("{");
      if (start === -1) {
        if (/not recognized|not found|ENOENT|Unknown option|Cannot find module/.test(stderr + stdout)) this.missingCompiler(stderr || stdout);
        else if (stderr.trim()) log(stderr.trim());
        return;
      }
      try {
        const parsed = JSON.parse(stdout.slice(start)) as { errors: CheckDiagnostic[]; warnings: CheckDiagnostic[] };
        log(`check: ${parsed.errors.length} error(s), ${parsed.warnings.length} warning(s)`);
        this.apply(root, [...parsed.errors, ...parsed.warnings]);
      } catch (err) {
        log(`Could not read sinth check output: ${String(err)}`);
      }
    });
  }

  private apply(root: string, diags: CheckDiagnostic[]): void {
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const d of diags) {
      if (!d.loc) continue;
      const line = Math.max(0, d.loc.line - 1);
      const col = Math.max(0, d.loc.col - 1);
      const diag = new vscode.Diagnostic(
        new vscode.Range(line, col, line, col + Math.max(1, d.loc.length ?? 1)),
        d.hint ? `${d.message}\n${d.hint}` : d.message,
        d.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
      );
      diag.code = { value: d.code, target: vscode.Uri.parse(DOCS_URL + "#34-error-reference") };
      diag.source = "sinth";
      const key = vscode.Uri.file(d.loc.file).toString();
      byFile.set(key, [...(byFile.get(key) ?? []), diag]);
    }
    this.collection.forEach(uri => {
      if (uri.fsPath.startsWith(root) && !byFile.has(uri.toString())) this.collection.delete(uri);
    });
    for (const [key, list] of byFile) {
      const uri = vscode.Uri.parse(key);
      const docForRange = vscode.workspace.textDocuments.find(td => td.uri.toString() === key);
      if (docForRange) {
        for (const d of list) {
          const word = docForRange.getWordRangeAtPosition(d.range.start, /\$?[A-Za-z_][\w$]*/);
          if (word && d.range.isSingleLine && d.range.end.character - d.range.start.character <= 1) d.range = word;
        }
      }
      this.collection.set(uri, list);
    }
  }

  private missingCompiler(detail: string): void {
    log(`Sinth compiler not found: ${detail}`);
    if (this.warnedMissing) return;
    this.warnedMissing = true;
    void vscode.window.showWarningMessage(
      "Sinth diagnostics need the Sinth 5 compiler. Install it in your project or globally.",
      "Install in project", "Open docs",
    ).then(choice => {
      if (choice === "Install in project") runInTerminal("npm install -D @yannosay/sinth@latest", "Sinth");
      if (choice === "Open docs") void vscode.env.openExternal(vscode.Uri.parse(DOCS_URL));
    });
  }
}

function runInTerminal(command: string, name: string, cwd?: string): void {
  const existing = vscode.window.terminals.find(t => t.name === name);
  if (existing) existing.dispose();
  const term = vscode.window.createTerminal({ name, cwd });
  term.show();
  term.sendText(command);
}

function activeRoot(): string | undefined {
  const file = vscode.window.activeTextEditor?.document.uri;
  if (file?.scheme === "file") return projectRootFor(file.fsPath);
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function createFile(kind: "page" | "component"): Promise<void> {
  const root = activeRoot();
  if (!root) {
    void vscode.window.showErrorMessage("Open a folder first.");
    return;
  }
  const name = await vscode.window.showInputBox({
    prompt: kind === "page" ? "Page path, e.g. about or blog/first-post" : "Component name, e.g. ProductCard",
    validateInput: v => (kind === "page" ? (/^[a-z0-9][a-z0-9/_-]*$/i.test(v) && !v.includes("..") ? undefined : "Use letters, numbers, - and /") : /^[A-Z][A-Za-z0-9]*$/.test(v) ? undefined : "Use PascalCase, e.g. ProductCard"),
  });
  if (!name) return;
  const file = kind === "page" ? path.join(root, "pages", name + ".sinth") : path.join(root, "components", name + ".sinth");
  if (fs.existsSync(file)) {
    void vscode.window.showErrorMessage(`${path.relative(root, file)} already exists.`);
    return;
  }
  const title = path.basename(name).replace(/[-_]+/g, " ").replace(/\b\w/g, m => m.toUpperCase());
  const cls = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const content = kind === "page"
    ? `page\n\ntitle = "${title}"\n\nMain {\n  Heading(level: 1) { "${title}" }\n}\n`
    : `component ${name}(str title = "${name}") {\n  Div(class: "${cls}") {\n    Heading(level: 3) { title }\n    $slot\n  }\n\n  style {\n    .${cls} {\n      padding: "1rem"\n    }\n  }\n}\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  await vscode.window.showTextDocument(vscode.Uri.file(file));
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("Sinth");
  const diagnostics = new Diagnostics();
  context.subscriptions.push(output, diagnostics.collection);

  void index.rebuild();
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.sinth");
  watcher.onDidCreate(u => void index.update(u));
  watcher.onDidChange(u => void index.update(u));
  watcher.onDidDelete(u => index.remove(u));
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(SELECTOR, completionProvider, "(", ",", ".", "\"", " ", ":"),
    vscode.languages.registerHoverProvider(SELECTOR, hoverProvider),
    vscode.languages.registerDefinitionProvider(SELECTOR, definitionProvider),
    vscode.languages.registerSignatureHelpProvider(SELECTOR, signatureProvider, "(", ","),
    vscode.languages.registerDocumentSymbolProvider(SELECTOR, symbolProvider),
    vscode.languages.registerDocumentFormattingEditProvider(SELECTOR, formatter),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.languageId === "sinth") void index.update(e.document.uri, e.document.getText());
    }),
    vscode.workspace.onDidSaveTextDocument(doc => diagnostics.schedule(doc, 50)),
    vscode.workspace.onDidOpenTextDocument(doc => diagnostics.schedule(doc)),
  );
  for (const doc of vscode.workspace.textDocuments) diagnostics.schedule(doc);

  const terminalCommand = (cmd: string, name: string) => (): void => {
    const root = activeRoot();
    if (!root) {
      void vscode.window.showErrorMessage("Open a Sinth project folder first.");
      return;
    }
    runInTerminal(`${terminalPrefix(root)} ${cmd}`, name, root);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("sinth.dev", terminalCommand("dev --open", "Sinth dev")),
    vscode.commands.registerCommand("sinth.build", terminalCommand("build", "Sinth build")),
    vscode.commands.registerCommand("sinth.preview", terminalCommand("preview --open", "Sinth preview")),
    vscode.commands.registerCommand("sinth.deploy", terminalCommand("deploy", "Sinth deploy")),
    vscode.commands.registerCommand("sinth.check", () => {
      const root = activeRoot();
      if (root) diagnostics.run(root);
      void vscode.commands.executeCommand("workbench.actions.view.problems");
    }),
    vscode.commands.registerCommand("sinth.newPage", () => createFile("page")),
    vscode.commands.registerCommand("sinth.newComponent", () => createFile("component")),
    vscode.commands.registerCommand("sinth.internal.log", () => recentLog.slice()),
    vscode.commands.registerCommand("sinth.openDocs", () => vscode.env.openExternal(vscode.Uri.parse(DOCS_URL))),
  );
}

export function deactivate(): void {
  return;
}
