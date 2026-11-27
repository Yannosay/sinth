/// <reference lib="webworker" />
import { compileFiles, formatDiagnostic, runtimeSource, version, type Diagnostic } from 'sinth-compiler'

export interface CompileRequest {
  id: number
  source: string
}

export type CompileResponse =
  | { id: number; ok: true; modules: { id: string; js: string }[]; entry: string; css: string; html: string; externalScripts: string[]; externalStyles: string[]; warnings: string[] }
  | { id: number; ok: false; error: string; line?: number }

const ENTRY = '/pages/index.sinth'

self.postMessage({ ready: true, version, runtime: runtimeSource })

self.onmessage = (event: MessageEvent<CompileRequest>) => {
  const { id, source } = event.data
  try {
    const result = compileFiles({ [ENTRY]: source }, { entry: ENTRY, dev: true })
    const response: CompileResponse = {
      id,
      ok: true,
      modules: result.modules.map(m => ({ id: m.id, js: m.js })),
      entry: result.entry,
      css: result.css,
      html: result.html,
      externalScripts: result.externalScripts,
      externalStyles: result.externalStyles,
      warnings: result.warnings.map((w: Diagnostic) => formatDiagnostic(w).replaceAll(ENTRY, 'index.sinth'))
    }
    self.postMessage(response)
  } catch (err) {
    const diagnostic = (err as { diagnostic?: Diagnostic }).diagnostic
    const response: CompileResponse = diagnostic
      ? { id, ok: false, error: formatDiagnostic(diagnostic).replaceAll(ENTRY, 'index.sinth'), line: diagnostic.loc?.line }
      : { id, ok: false, error: String((err as Error).stack ?? err) }
    self.postMessage(response)
  }
}
