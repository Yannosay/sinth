import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

export interface SinthDiagnostic {
  message: string;
  severity: vscode.DiagnosticSeverity;
  range: vscode.Range;
  source: string;
}

export class SinthDiagnosticsProvider {
  private diagnostics: Map<string, vscode.Diagnostic[]> = new Map();
  private completionCache: Map<string, vscode.CompletionItem[]> = new Map();

  public async checkFile(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
    const filePath = document.uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder?.uri.fsPath || path.dirname(filePath);

    try {
      const result = await this.runSinthCheck(filePath, cwd);
      return this.parseDiagnostics(result, document);
    } catch (error) {
      console.error('Error checking file:', error);
      return [];
    }
  }

  private async runSinthCheck(filePath: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('sinth', ['check', filePath], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          resolve(stderr || stdout);
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  private parseDiagnostics(output: string, document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Parse error format: "Error: message at file (line X, col Y)"
      const errorMatch = line.match(/Error: (.+) at (.+) \(line (\d+), col (\d+)\)/);
      if (errorMatch) {
        const [, message, file, lineStr, colStr] = errorMatch;
        const lineNum = parseInt(lineStr, 10) - 1;
        const colNum = parseInt(colStr, 10) - 1;

        const range = new vscode.Range(
          new vscode.Position(lineNum, Math.max(0, colNum)),
          new vscode.Position(lineNum, Math.max(0, colNum) + 1)
        );

        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'sinth';
        diagnostics.push(diagnostic);
      }

      // Parse warning format
      const warningMatch = line.match(/Warning: (.+) at (.+) \(line (\d+), col (\d+)\)/);
      if (warningMatch) {
        const [, message, file, lineStr, colStr] = warningMatch;
        const lineNum = parseInt(lineStr, 10) - 1;
        const colNum = parseInt(colStr, 10) - 1;

        const range = new vscode.Range(
          new vscode.Position(lineNum, Math.max(0, colNum)),
          new vscode.Position(lineNum, Math.max(0, colNum) + 1)
        );

        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'sinth';
        diagnostics.push(diagnostic);
      }
    }

    return diagnostics;
  }

  public async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const cacheKey = `${document.uri.fsPath}:${position.line}:${position.character}`;
    const cached = this.completionCache.get(cacheKey);
    if (cached) return cached;

    const items: vscode.CompletionItem[] = [];

    // Built-in components
    const builtinComponents = [
      'Main', 'Header', 'Footer', 'Nav', 'Section', 'Article', 'Aside', 'Div', 'Span',
      'Hero', 'Container', 'Grid', 'Flex', 'Stack', 'Row', 'Column', 'CardGrid',
      'Heading', 'SubHeading', 'Paragraph', 'Lead', 'Small', 'Strong', 'Em', 'Code', 'Pre',
      'Button', 'Link', 'NavLink', 'Input', 'Checkbox', 'Select', 'Textarea',
      'Form', 'Fieldset', 'Legend', 'Label', 'Option', 'Optgroup',
      'Img', 'Video', 'Audio', 'Picture', 'Figure', 'Figcaption',
      'Ul', 'Ol', 'Li', 'Table', 'Card', 'Modal'
    ];

    for (const comp of builtinComponents) {
      const item = new vscode.CompletionItem(comp, vscode.CompletionItemKind.Class);
      item.detail = 'Built-in component';
      item.documentation = new vscode.MarkdownString(`Built-in Sinth component: **${comp}**`);
      items.push(item);
    }

    // Types
    const types = ['str', 'num', 'int', 'bool', 'obj', 'arr', 'ui', 'void'];
    for (const type of types) {
      const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.Keyword);
      item.detail = 'Type';
      items.push(item);
    }

    // Keywords
    const keywords = ['page', 'component', 'function', 'var', 'const', 'if', 'else', 'for', 'in', 'return', 'import', 'export'];
    for (const kw of keywords) {
      const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
      items.push(item);
    }

    // Native functions
    const nativeFuncs = [
      'console.log', 'console.error', 'console.warn', 'console.table',
      'Math.abs', 'Math.min', 'Math.max', 'Math.sqrt', 'Math.pow', 'Math.random',
      'JSON.stringify', 'JSON.parse',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
      'fetch', 'localStorage.getItem', 'localStorage.setItem',
      'document.querySelector', 'document.getElementById'
    ];

    for (const func of nativeFuncs) {
      const item = new vscode.CompletionItem(func, vscode.CompletionItemKind.Function);
      item.detail = 'Native JS function';
      items.push(item);
    }

    this.completionCache.set(`${document.uri.fsPath}:${position.line}:${position.character}`, items);
    return items;
  }

  public clearCache() {
    this.diagnostics.clear();
    this.completionCache.clear();
  }
}