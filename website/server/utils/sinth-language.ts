import type { HLJSApi, LanguageFn } from 'highlight.js'

const KEYWORDS = [
  'import', 'from', 'as', 'extern', 'component', 'function', 'async', 'await', 'var', 'const', 'computed', 'persist',
  'bind', 'if', 'elif', 'else', 'for', 'in', 'key', 'while', 'try', 'catch', 'finally', 'throw', 'return', 'break',
  'continue', 'watch', 'onMount', 'onDestroy', 'style', 'script', 'global', 'and', 'or', 'not', 'new', 'typeof', 'font', 'css'
]

const TYPES = ['str', 'num', 'int', 'bool', 'obj', 'any', 'ui', 'void', 'fn']

const LITERALS = ['true', 'false', 'null', 'undefined']

/** highlight.js grammar for Sinth 5. */
export const sinthLanguage: LanguageFn = (hljs: HLJSApi) => {
  const interpolation = { scope: 'subst', begin: /\{/, end: /\}/, keywords: { keyword: KEYWORDS, literal: LITERALS } }
  return {
    name: 'Sinth',
    aliases: ['sinth-live'],
    keywords: { keyword: KEYWORDS, type: TYPES, literal: LITERALS },
    contains: [
      hljs.COMMENT(/--\[/, /\]--/, { contains: ['self'] }),
      hljs.COMMENT(/--(?![\w-]*\s*:)/, /$/),
      hljs.COMMENT(/\/\//, /$/),
      hljs.C_BLOCK_COMMENT_MODE,
      { scope: 'string', begin: /f"/, end: /"/, contains: [hljs.BACKSLASH_ESCAPE, interpolation] },
      { scope: 'string', begin: /`/, end: /`/, contains: [hljs.BACKSLASH_ESCAPE, { scope: 'subst', begin: /\$\{/, end: /\}/ }] },
      hljs.QUOTE_STRING_MODE,
      hljs.APOS_STRING_MODE,
      { scope: 'built_in', begin: /\$slot\b|\$[a-z]\w*(?=\()/ },
      { scope: 'meta', begin: /<[a-z][\w-]*-[\w-]*>/ },
      { scope: 'attr', begin: /\b[a-zA-Z_][\w-]*(?:\.[a-z]+)*(?=\s*:(?!:))/, relevance: 0 },
      { scope: 'title', begin: /\b[A-Z][a-zA-Z0-9]*\b/, relevance: 0 },
      hljs.C_NUMBER_MODE
    ]
  }
}

export function registerSinthLanguage(hljs: HLJSApi): void {
  if (!hljs.getLanguage('sinth')) hljs.registerLanguage('sinth', sinthLanguage)
}
