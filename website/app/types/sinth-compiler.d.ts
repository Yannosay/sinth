declare module 'sinth-compiler' {
  export interface Diagnostic {
    severity: 'error' | 'warning'
    code: string
    message: string
    loc?: { file: string; line: number; col: number; length?: number }
    hint?: string
  }
  export interface CompiledModule { id: string; js: string; deps: string[] }
  export interface CompileFilesResult {
    modules: CompiledModule[]
    entry: string
    css: string
    html: string
    externalScripts: string[]
    externalStyles: string[]
    warnings: Diagnostic[]
  }
  export function compileFiles(files: Record<string, string>, options?: { entry?: string; dev?: boolean }): CompileFilesResult
  export function formatDiagnostic(diagnostic: Diagnostic, color?: boolean): string
  export class SinthError extends Error { code: string; diagnostic: Diagnostic }
  export const runtimeSource: string
  export const version: string
}
