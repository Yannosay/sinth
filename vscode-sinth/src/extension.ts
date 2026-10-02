import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SinthDiagnosticsProvider } from './languageClient';

let diagnosticsProvider: SinthDiagnosticsProvider;
let outputChannel: vscode.OutputChannel;
let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Sinth');
  outputChannel.appendLine('Sinth Language Extension activating...');

  diagnosticsProvider = new SinthDiagnosticsProvider();
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
    const completionProvider = vscode.languages.registerCompletionItemProvider(
      'sinth',
      {
        provideCompletionItems: (doc, pos) => diagnosticsProvider.provideCompletionItems(doc, pos)
      },
      '.', ':', '(', '"', '\'', '`'
    );
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

async function onDocumentSave(document: vscode.TextDocument) {
  if (document.languageId === 'sinth') {
    await checkFile(document);
  }
}

async function onDocumentChange(event: vscode.TextDocumentChangeEvent) {
  if (event.document.languageId === 'sinth') {
    // Debounced check on change
    setTimeout(() => checkFile(event.document), 500);
  }
}

async function checkFile(document: vscode.TextDocument) {
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

export function deactivate(): Thenable<void> | undefined {
  return undefined;
}