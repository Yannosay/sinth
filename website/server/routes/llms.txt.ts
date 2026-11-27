import { flattenManifest, readManifest } from '../utils/content'

/** An index of the documentation for language models, following https://llmstxt.org. */
export default defineEventHandler(async (event) => {
  const site = String(useRuntimeConfig().public.siteUrl).replace(/\/+$/, '')
  const manifest = await readManifest()
  const lines = [
    '# Sinth',
    '',
    '> Sinth is a compiled, type-checked language for websites and web apps. Pages and components combine markup, reactive state, functions and scoped styles in one file. The compiler (npm package @yannosay/sinth) prerenders every page to HTML, bundles interactive parts with a small runtime (a counter page ships 3.5 kB of gzipped JavaScript), provides client-side navigation, API routes in functions/ (Cloudflare Pages Functions compatible) and deploys with one command.',
    '',
    'Install: `npx @yannosay/sinth create my-site`. Source: https://github.com/Yannosay/sinth. The full documentation as one file: ' + site + '/llms-full.txt',
    ''
  ]
  for (const section of manifest.sections) {
    lines.push(`## ${section.title}`, '')
    for (const page of section.pages) lines.push(`- [${page.title}](${site}/docs/${section.slug}/${page.slug}): ${page.description ?? ''}`)
    lines.push('')
  }
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return lines.join('\n')
})
