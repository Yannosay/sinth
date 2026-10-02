"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const languageClient_1 = require("./languageClient");
let diagnosticsProvider;
let outputChannel;
let diagnosticCollection;
function activate(context) {
    outputChannel = vscode.window.createOutputChannel('Sinth');
    outputChannel.appendLine('Sinth Language Extension activating...');
    diagnosticsProvider = new languageClient_1.SinthDiagnosticsProvider();
    diagnosticCollection = vscode.languages.createDiagnosticCollection('sinth');
    context.subscriptions.push(diagnosticCollection);
    // Register commands
    const compileCommand = vscode.commands.registerCommand('sinth.compile', compileCurrentFile);
    const checkCommand = vscode.commands.registerCommand('sinth.check', checkProject);
    const devCommand = vscode.commands.registerCommand('sinth.dev', startDevServer);
    const checkFileCommand = vscode.commands.registerCommand('sinth.checkFile', checkCurrentFile);
    context.subscriptions.push(compileCommand, checkCommand, devCommand, checkFileCommand);
    // Enable diagnostics on save/change
    const config = vscode.workspace.getConfiguration('sinth');
    if (config.get('enableDiagnostics', true)) {
        const onSave = vscode.workspace.onDidSaveTextDocument(onDocumentSave);
        const onChange = vscode.workspace.onDidChangeTextDocument(onDocumentChange);
        context.subscriptions.push(onSave, onChange);
    }
    // Enable completion
    if (config.get('enableCompletion', true)) {
        const completionProvider = vscode.languages.registerCompletionItemProvider('sinth', {
            provideCompletionItems: (doc, pos) => diagnosticsProvider.provideCompletionItems(doc, pos)
        }, '.', ':', '(', '"', '\'', '`');
        context.subscriptions.push(completionProvider);
    }
    // Watch for config changes
    const configWatcher = vscode.workspace.createFileSystemWatcher('**/sinth.config.json');
    configWatcher.onDidChange(() => {
        outputChannel.appendLine('Config changed, reloading...');
    });
    context.subscriptions.push(configWatcher);
    outputChannel.appendLine('Sinth Language Extension activated!');
}
async function onDocumentSave(document) {
    if (document.languageId === 'sinth') {
        await checkFile(document);
    }
}
async function onDocumentChange(event) {
    if (event.document.languageId === 'sinth') {
        // Debounced check on change
        setTimeout(() => checkFile(event.document), 500);
    }
}
async function checkFile(document) {
    const diagnostics = await diagnosticsProvider.checkFile(document);
    diagnosticCollection.set(document.uri, diagnostics);
}
async function checkCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'sinth') {
        vscode.window.showErrorMessage('No Sinth file active');
        return;
    }
    await checkFile(editor.document);
    vscode.window.showInformationMessage('Type check complete');
}
async function compileCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'sinth') {
        vscode.window.showErrorMessage('No Sinth file active');
        return;
    }
    const filePath = editor.document.uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const cwd = workspaceFolder?.uri.fsPath || path.dirname(filePath);
    const terminal = vscode.window.createTerminal('Sinth Compile');
    terminal.show();
    terminal.sendText(`sinth build "${filePath}"`, true);
}
async function checkProject() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }
    const terminal = vscode.window.createTerminal('Sinth Check');
    terminal.show();
    for (const folder of workspaceFolders) {
        terminal.sendText(`sinth check`, true);
    }
}
async function startDevServer() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }
    const folder = workspaceFolders[0];
    const terminal = vscode.window.createTerminal('Sinth Dev');
    terminal.show();
    terminal.sendText(`cd "${folder.uri.fsPath}" && sinth dev`, true);
}
function deactivate() {
    return undefined;
}
//# sourceMappingURL=extension.js.map