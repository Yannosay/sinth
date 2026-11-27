/**
 * Documentation content from the repository's docs/ folder, bundled as Nitro server assets
 * (see nitro.serverAssets in nuxt.config.ts), so pages render and prerender without network access.
 */

export interface DocsManifestPage {
  slug: string
  title: string
  description?: string
  order: number
}

export interface DocsManifestSection {
  slug: string
  title: string
  order: number
  pages: DocsManifestPage[]
}

export interface DocsManifest {
  sections: DocsManifestSection[]
}

export interface DocsFlatPage {
  sectionSlug: string
  sectionTitle: string
  slug: string
  title: string
  description: string
}

const SLUG_PATTERN = /^[a-z0-9-]+$/
const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/

function storage() {
  return useStorage('assets:docs')
}

export async function readManifest(): Promise<DocsManifest> {
  const raw = await storage().getItem<DocsManifest | string>('manifest.json')
  if (!raw) throw createError({ statusCode: 500, statusMessage: 'Documentation manifest missing' })
  const manifest = typeof raw === 'string' ? JSON.parse(raw) as DocsManifest : raw
  return {
    sections: [...manifest.sections]
      .sort((a, b) => a.order - b.order)
      .map(s => ({ ...s, pages: [...s.pages].sort((a, b) => a.order - b.order) }))
  }
}

export function flattenManifest(manifest: DocsManifest): DocsFlatPage[] {
  return manifest.sections.flatMap(section => section.pages.map(page => ({
    sectionSlug: section.slug,
    sectionTitle: section.title,
    slug: page.slug,
    title: page.title,
    description: page.description ?? ''
  })))
}

export async function readPageSource(sectionSlug: string, pageSlug: string): Promise<string> {
  if (!SLUG_PATTERN.test(sectionSlug) || !SLUG_PATTERN.test(pageSlug)) {
    throw createError({ statusCode: 404, statusMessage: 'Documentation page not found' })
  }
  const raw = await storage().getItem<string>(`${sectionSlug}:${pageSlug}.md`)
  if (typeof raw !== 'string') throw createError({ statusCode: 404, statusMessage: 'Documentation page not found' })
  return raw.replace(/\r\n/g, '\n')
}

/** Splits front matter from the body and drops the leading `# Title`, which the page header renders. */
export function parsePage(source: string): { title?: string; description?: string; body: string } {
  const match = FRONTMATTER_PATTERN.exec(source)
  const data: Record<string, string> = {}
  let body = source
  if (match) {
    for (const line of (match[1] ?? '').split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
    }
    body = match[2] ?? ''
  }
  return { title: data.title, description: data.description, body: body.replace(/^\s*#[ \t]+[^\n]+\n+/, '') }
}
