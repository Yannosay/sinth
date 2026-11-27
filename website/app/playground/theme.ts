import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/** Editor theme matching the site's colors. */
export const editorTheme = [
  EditorView.theme({
    '&': { color: '#e4e4ea', backgroundColor: '#0e0e13', height: '100%', fontSize: '13.5px' },
    '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: '#c4b5fd', padding: '12px 0' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: '#0e0e13', color: '#4b4b58', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(167, 139, 250, 0.05)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#a1a1aa' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(167, 139, 250, 0.28) !important' },
    '.cm-cursor': { borderLeftColor: '#c4b5fd' },
    '&.cm-focused': { outline: 'none' },
    '.cm-error-line': { backgroundColor: 'rgba(248, 113, 113, 0.12)' }
  }, { dark: true }),
  syntaxHighlighting(HighlightStyle.define([
    { tag: t.comment, color: '#6b6b78', fontStyle: 'italic' },
    { tag: t.keyword, color: '#c084fc' },
    { tag: [t.typeName, t.className], color: '#7dd3fc' },
    { tag: t.propertyName, color: '#fbbf24' },
    { tag: [t.string, t.special(t.string)], color: '#86efac' },
    { tag: t.number, color: '#fca5a5' },
    { tag: [t.atom, t.bool, t.null], color: '#fca5a5' },
    { tag: [t.macroName, t.meta], color: '#f0abfc' },
    { tag: t.variableName, color: '#e4e4ea' },
    { tag: [t.tagName], color: '#7dd3fc' },
    { tag: [t.attributeName], color: '#fbbf24' },
    { tag: [t.operator, t.punctuation], color: '#a1a1aa' }
  ]))
]
