import { flattenManifest, parsePage, readManifest, readPageSource } from '../../utils/content'
import { renderDocsMarkdown } from '../../utils/markdown-docs'

export default defineEventHandler(async (event) => {
  const segments = (getRouterParam(event, 'slug') ?? '').split('/').filter(Boolean)
  const [sectionSlug, pageSlug] = segments
  if (segments.length !== 2 || !sectionSlug || !pageSlug) {
    throw createError({ statusCode: 404, statusMessage: 'Documentation page not found' })
  }

  const flat = flattenManifest(await readManifest())
  const index = flat.findIndex(p => p.sectionSlug === sectionSlug && p.slug === pageSlug)
  const current = flat[index]
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Documentation page not found' })

  const page = parsePage(await readPageSource(sectionSlug, pageSlug))
  const rendered = renderDocsMarkdown(page.body, sectionSlug)
  const link = (p?: typeof current) => (p ? { title: p.title, href: `/docs/${p.sectionSlug}/${p.slug}` } : null)

  setHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
  return {
    slug: pageSlug,
    sectionSlug,
    sectionTitle: current.sectionTitle,
    title: page.title ?? current.title,
    description: page.description ?? current.description,
    html: rendered.html,
    headings: rendered.headings,
    editUrl: `https://github.com/Yannosay/sinth/edit/main/docs/${sectionSlug}/${pageSlug}.md`,
    prev: link(flat[index - 1]),
    next: link(flat[index + 1])
  }
})
