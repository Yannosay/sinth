import { flattenManifest, parsePage, readManifest, readPageSource } from '../utils/content'

/** The whole documentation as one Markdown file, for language models and offline reading. */
export default defineEventHandler(async (event) => {
  const parts = ['# Sinth documentation', '']
  for (const page of flattenManifest(await readManifest())) {
    const { body } = parsePage(await readPageSource(page.sectionSlug, page.slug))
    parts.push(`# ${page.title}`, '', body.trim(), '')
  }
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return parts.join('\n')
})
