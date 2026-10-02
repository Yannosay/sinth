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
exports.SinthDiagnosticsProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
class SinthDiagnosticsProvider {
    constructor() {
        this.diagnostics = new Map();
        this.completionCache = new Map();
    }
    async checkFile(document) {
        const filePath = document.uri.fsPath;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        const cwd = workspaceFolder?.uri.fsPath || path.dirname(filePath);
        try {
            const result = await this.runSinthCheck(filePath, cwd);
            return this.parseDiagnostics(result, document);
        }
        catch (error) {
            console.error('Error checking file:', error);
            return [];
        }
    }
    async runSinthCheck(filePath, cwd) {
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)('sinth', ['check', filePath], {
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
                }
                else {
                    resolve(stderr || stdout);
                }
            });
            child.on('error', (err) => {
                reject(err);
            });
        });
    }
    parseDiagnostics(output, document) {
        const diagnostics = [];
        const lines = output.split('\n');
        for (const line of lines) {
            // Parse error format: "Error: message at file (line X, col Y)"
            const errorMatch = line.match(/Error: (.+) at (.+) \(line (\d+), col (\d+)\)/);
            if (errorMatch) {
                const [, message, file, lineStr, colStr] = errorMatch;
                const lineNum = parseInt(lineStr, 10) - 1;
                const colNum = parseInt(colStr, 10) - 1;
                const range = new vscode.Range(new vscode.Position(lineNum, Math.max(0, colNum)), new vscode.Position(lineNum, Math.max(0, colNum) + 1));
                const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
                diagnostic.source = 'sinth';
                diagnostics.push(diagnostic);
            }
            // Parse warning format
            const warningMatch = line.match(/Warning: (.+) at (.+) \(line (\d+), col (\d+)\)/);
            if (warningMatch) {
                const [, message, file, lineStr, colStr] = warningMatch;
                const lineNum = parseInt(lineStr, 10) - 1;
                const colNum = parseInt(colStr, 10) - 1;
                const range = new vscode.Range(new vscode.Position(lineNum, Math.max(0, colNum)), new vscode.Position(lineNum, Math.max(0, colNum) + 1));
                const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
                diagnostic.source = 'sinth';
                diagnostics.push(diagnostic);
            }
        }
        return diagnostics;
    }
    async provideCompletionItems(document, position) {
        const cacheKey = `${document.uri.fsPath}:${position.line}:${position.character}`;
        const cached = this.completionCache.get(cacheKey);
        if (cached)
            return cached;
        const items = [];
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
    clearCache() {
        this.diagnostics.clear();
        this.completionCache.clear();
    }
}
exports.SinthDiagnosticsProvider = SinthDiagnosticsProvider;
//# sourceMappingURL=languageClient.js.map