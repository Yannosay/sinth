import * as vscode from 'vscode';
export interface SinthDiagnostic {
    message: string;
    severity: vscode.DiagnosticSeverity;
    range: vscode.Range;
    source: string;
}
export declare class SinthDiagnosticsProvider {
    private diagnostics;
    private completionCache;
    checkFile(document: vscode.TextDocument): Promise<vscode.Diagnostic[]>;
    private runSinthCheck;
    private parseDiagnostics;
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]>;
    clearCache(): void;
}
//# sourceMappingURL=languageClient.d.ts.map