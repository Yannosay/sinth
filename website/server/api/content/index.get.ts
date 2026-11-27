import { readManifest } from '../../utils/content'

export default defineEventHandler(async (event) => {
  const manifest = await readManifest()
  setHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
  return {
    sections: manifest.sections.map(section => ({
      slug: section.slug,
      title: section.title,
      pages: section.pages.map(page => ({
        slug: page.slug,
        title: page.title,
        description: page.description ?? '',
        href: `/docs/${section.slug}/${page.slug}`
      }))
    }))
  }
})
