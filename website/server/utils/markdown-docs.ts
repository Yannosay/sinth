import { Marked, type RendererObject, type Tokens } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import { registerSinthLanguage } from './sinth-language'

registerSinthLanguage(hljs)

export interface DocsHeading {
  id: string
  text: string
  depth: number
}

export interface DocsRenderResult {
  html: string
  headings: DocsHeading[]
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = parseInt(body.slice(2), 16)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match
    }
    if (body.startsWith('#')) {
      const code = parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match
    }
    const named = HTML_ENTITIES[body.toLowerCase()]
    return named ?? match
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Turns a link between Markdown files (`../language/forms.md#x`) into a site route (`/docs/language/forms#x`). */
function resolveDocsLink(href: string, sectionSlug: string): string {
  const match = /^((?:\.\.?\/)*[\w-]+(?:\/[\w-]+)*)\.md(#[\w-]*)?$/.exec(href)
  if (!match) return href
  const parts = [sectionSlug]
  for (const part of (match[1] ?? '').split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  return `/docs/${parts.join('/')}${match[2] ?? ''}`
}

function sanitizeHref(rawHref: string): string | null {
  if (!rawHref) return null
  const decoded = decodeEntities(rawHref).replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!decoded) return null
  if (/^(https?:|mailto:|tel:)/i.test(decoded)) return decoded
  if (decoded.startsWith('/') || decoded.startsWith('#')) return decoded
  return null
}

function sanitizeImageSrc(rawHref: string): string | null {
  if (!rawHref) return null
  const decoded = decodeEntities(rawHref).replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!decoded) return null
  if (/^https?:\/\//i.test(decoded)) return decoded
  if (decoded.startsWith('/')) return decoded
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(decoded)) return decoded
  return null
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const CALLOUT_VARIANTS = ['note', 'warning', 'tip', 'danger'] as const
type CalloutVariant = (typeof CALLOUT_VARIANTS)[number]

interface ExtractedCallout {
  variant: CalloutVariant
  body: string
}

function extractCallouts(source: string): { source: string; callouts: ExtractedCallout[] } {
  const callouts: ExtractedCallout[] = []
  const pattern = /^:::[ \t]*(note|warning|tip|danger)[ \t]*\r?\n([\s\S]*?)\r?\n:::[ \t]*$/gm

  const replaced = source.replace(pattern, (_match, variant: string, body: string) => {
    const index = callouts.length
    callouts.push({ variant: variant as CalloutVariant, body: body.trim() })
    return `\n\n@@SINTH_CALLOUT_${index}@@\n\n`
  })

  return { source: replaced, callouts }
}

function buildRenderer(headings: DocsHeading[], sectionSlug: string): RendererObject {
  return {
    heading(token: Tokens.Heading): string {
      const id = slugifyHeading(token.text)
      if (token.depth >= 2 && token.depth <= 3 && id) {
        headings.push({ id, text: token.text, depth: token.depth })
      }
      const inner = this.parser.parseInline(token.tokens)
      if (!id) {
        return `<h${token.depth}>${inner}</h${token.depth}>\n`
      }
      return `<h${token.depth} id="${escapeHtml(id)}">${inner}</h${token.depth}>\n`
    },

    html(): string {
      return ''
    },

    link(token: Tokens.Link): string {
      const href = sanitizeHref(resolveDocsLink(token.href, sectionSlug))
      const inner = this.parser.parseInline(token.tokens)
      if (!href) return inner
      const isExternal = /^https?:\/\//i.test(href)
      const rel = isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      return `<a href="${escapeHtml(href)}"${title}${rel}>${inner}</a>`
    },

    image(token: Tokens.Image): string {
      const src = sanitizeImageSrc(token.href)
      const alt = String(token.text ?? '')
      if (!src) return escapeHtml(alt)
      const lower = src.toLowerCase()
      const videoPattern = /\.(mp4|webm|ogv|mov)(\?|#|$)/i
      if (videoPattern.test(lower)) {
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
        return `<video controls preload="metadata" src="${escapeHtml(src)}"${title}></video>`
      }
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async"${title}>`
      if (token.title) {
        return `<figure>${img}<figcaption>${escapeHtml(token.title)}</figcaption></figure>`
      }
      return img
    }
  }
}

function buildParser(headings: DocsHeading[], sectionSlug: string): Marked {
  const parser = new Marked()
  parser.use(
    markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code: string, lang: string) {
        const normalized = (lang || '').toLowerCase().trim()
        const language = normalized && hljs.getLanguage(normalized) ? normalized : 'plaintext'
        try {
          return hljs.highlight(code, { language }).value
        } catch {
          return escapeHtml(code)
        }
      }
    })
  )
  parser.use({
    gfm: true,
    breaks: false,
    renderer: buildRenderer(headings, sectionSlug)
  })
  return parser
}

const CODE_BLOCK_PATTERN = /<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g

export function renderDocsMarkdown(source: string, sectionSlug = ''): DocsRenderResult {
  const headings: DocsHeading[] = []
  const parser = buildParser(headings, sectionSlug)

  const { source: withoutCallouts, callouts } = extractCallouts(source.replace(/^```sinth live[ \t]*$/gm, '```sinth-live'))
  let html = parser.parse(withoutCallouts) as string

  if (callouts.length > 0) {
    html = html.replace(/<p>@@SINTH_CALLOUT_(\d+)@@<\/p>/g, (_match, indexText: string) => {
      const index = Number(indexText)
      const callout = callouts[index]
      if (!callout) return ''
      const innerHtml = parser.parse(callout.body) as string
      return `<aside class="callout callout--${callout.variant}">${innerHtml}</aside>`
    })
  }

  html = html.replace(CODE_BLOCK_PATTERN, (_match, attributes: string, code: string) => {
    const live = attributes.includes('language-sinth-live')
    const attrs = live ? attributes.replace('language-sinth-live', 'language-sinth') : attributes
    const actions = live
      ? '<button type="button" class="code-block__run" data-run-code aria-label="Run this example">Try it</button>'
      : ''
    return `<div class="code-block"${live ? ' data-live' : ''} data-code-block><pre><code${attrs}>${code}</code></pre><div class="code-block__actions">${actions}<button type="button" class="code-block__copy" data-copy-code aria-label="Copy code">copy</button></div></div>`
  })

  return { html, headings }
}