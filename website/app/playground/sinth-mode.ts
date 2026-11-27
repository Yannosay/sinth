import { StreamLanguage, type StringStream } from '@codemirror/language'

const KEYWORDS = new Set([
  'import', 'from', 'as', 'extern', 'component', 'function', 'async', 'await', 'var', 'const', 'computed', 'persist',
  'bind', 'if', 'elif', 'else', 'for', 'in', 'key', 'while', 'try', 'catch', 'finally', 'throw', 'return', 'break',
  'continue', 'watch', 'onMount', 'onDestroy', 'style', 'script', 'global', 'and', 'or', 'not', 'new', 'typeof'
])
const TYPES = new Set(['str', 'num', 'int', 'bool', 'obj', 'any', 'ui', 'void', 'fn'])
const ATOMS = new Set(['true', 'false', 'null', 'undefined'])

interface State {
  blockComment: number
  quote: string | null
}

function readString(stream: StringStream, state: State): string {
  const quote = state.quote as string
  let escaped = false
  let ch: string | void
  while ((ch = stream.next()) !== undefined) {
    if (ch === quote && !escaped) {
      state.quote = null
      break
    }
    escaped = !escaped && ch === '\\'
  }
  return 'string'
}

/** CodeMirror stream mode for Sinth, matching the token classes of the compiler's lexer. */
export const sinthLanguage = StreamLanguage.define<State>({
  name: 'sinth',
  startState: () => ({ blockComment: 0, quote: null }),
  token(stream, state) {
    if (state.blockComment > 0) {
      while (!stream.eol()) {
        if (stream.match('--[')) state.blockComment++
        else if (stream.match(']--')) {
          state.blockComment--
          if (state.blockComment === 0) break
        } else stream.next()
      }
      return 'comment'
    }
    if (state.quote) return readString(stream, state)
    if (stream.eatSpace()) return null
    if (stream.match('--[')) {
      state.blockComment = 1
      return 'comment'
    }
    if (stream.match(/^--(?![\w-]*\s*:)/) || stream.match('//')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match(/^f?["'`]/)) {
      state.quote = stream.current().slice(-1)
      return readString(stream, state)
    }
    if (stream.match(/^\$\w+/)) return 'macroName'
    if (stream.match(/^<[a-z][\w-]*-[\w-]*>/)) return 'meta'
    if (stream.match(/^\d+(\.\d+)?/)) return 'number'
    if (stream.match(/^[A-Za-z_][\w-]*(?:\.[a-z]+)*(?=\s*:(?!:))/)) return 'propertyName'
    if (stream.match(/^[A-Z]\w*/)) return 'typeName'
    if (stream.match(/^[a-zA-Z_]\w*/)) {
      const word = stream.current()
      if (KEYWORDS.has(word)) return 'keyword'
      if (TYPES.has(word)) return 'typeName'
      if (ATOMS.has(word)) return 'atom'
      return 'variableName'
    }
    stream.next()
    return null
  },
  languageData: { commentTokens: { line: '--', block: { open: '--[', close: ']--' } } }
})
