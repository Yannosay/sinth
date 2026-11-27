<template>
  <div class="doc-view">
    <DocsBreadcrumbs
      :section-title="page?.sectionTitle"
      :page-title="page?.title"
    />

    <p v-if="pending" class="doc-view__state">Loading…</p>
    <p v-else-if="error" class="doc-view__state doc-view__state--error">This page could not be loaded.</p>

    <div v-else-if="page" class="doc-view__grid">
      <article class="doc-view__main">
        <header class="doc-view__header">
          <h1 class="doc-view__title">{{ page.title }}</h1>
          <p v-if="page.description" class="doc-view__description">{{ page.description }}</p>
        </header>

        <div class="prose doc-view__body" v-html="page.html" />

        <p class="doc-view__edit">
          <a :href="page.editUrl" target="_blank" rel="noopener noreferrer">Edit this page on GitHub</a>
        </p>

        <DocsPager :prev="page.prev" :next="page.next" />
      </article>

      <aside v-if="headings.length > 0" class="doc-view__toc">
        <DocsTableOfContents :headings="headings" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DocsBreadcrumbs from '~/components/docs/DocsBreadcrumbs.vue'
import DocsPager from '~/components/docs/DocsPager.vue'
import DocsTableOfContents from '~/components/docs/DocsTableOfContents.vue'

definePageMeta({
  layout: 'docs',
  key: route => route.fullPath
})

interface ApiHeading {
  id: string
  text: string
  depth: number
}

interface ApiLink {
  title: string
  href: string
}

interface ApiPage {
  slug: string
  sectionSlug: string
  sectionTitle: string
  title: string
  description: string
  editUrl: string
  html: string
  headings: ApiHeading[]
  prev: ApiLink | null
  next: ApiLink | null
}

const route = useRoute()

const slugPath = computed(() => {
  const params = route.params.slug
  if (Array.isArray(params)) return params.join('/')
  return String(params ?? '')
})

const { data: page, pending, error } = await useFetch<ApiPage>(
  () => `/api/content/${slugPath.value}`,
  { key: () => `docs-page-${slugPath.value}` }
)

if (error.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

const headings = computed(() => page.value?.headings ?? [])

useCanonical(() => `/docs/${slugPath.value}`)

const siteUrl = String(useRuntimeConfig().public.siteUrl)

useHead(() => ({
  title: page.value?.title ?? 'Sinth Docs',
  meta: [
    { name: 'description', content: page.value?.description ?? 'Sinth documentation.' },
    { property: 'og:title', content: page.value ? `${page.value.title} | Sinth` : 'Sinth Docs' },
    { property: 'og:description', content: page.value?.description ?? '' },
    { property: 'og:type', content: 'article' }
  ],
  script: page.value
    ? [{
        type: 'application/ld+json',
        innerHTML: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'TechArticle',
              headline: page.value.title,
              description: page.value.description,
              url: `${siteUrl}/docs/${slugPath.value}`,
              about: { '@type': 'ComputerLanguage', name: 'Sinth', url: siteUrl },
              publisher: { '@type': 'Organization', name: 'Yannosay Productions', url: 'https://yannosay.com' }
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Docs', item: `${siteUrl}/docs` },
                { '@type': 'ListItem', position: 2, name: page.value.sectionTitle },
                { '@type': 'ListItem', position: 3, name: page.value.title, item: `${siteUrl}/docs/${slugPath.value}` }
              ]
            }
          ]
        }).replace(/</g, '\\u003c')
      }]
    : []
}))
</script>

<style lang="scss" scoped>
.doc-view {
  min-width: 0;
}

.doc-view__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 3rem;
}

@media (min-width: 1280px) {
  .doc-view__grid:has(.doc-view__toc) {
    grid-template-columns: minmax(0, 1fr) 12rem;
  }
}

.doc-view__main {
  min-width: 0;
}

.doc-view__edit {
  margin-top: 2.5rem;
  font-size: 0.82rem;

  a {
    color: var(--fg-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  a:hover {
    color: var(--accent-bright);
  }
}

.doc-view__state {
  font-size: 0.9rem;
  color: var(--fg-muted);
  padding: 2rem 0;
}

.doc-view__state--error {
  color: #f87171;
}

.doc-view__header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--line-soft);
}

.doc-view__title {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: clamp(1.5rem, 2.6vw, 1.85rem);
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--fg);
}

.doc-view__description {
  margin-top: 0.7rem;
  font-size: 0.95rem;
  color: var(--fg-muted);
  line-height: 1.6;
  max-width: 54ch;
}

.doc-view__toc {
  display: none;
}

@media (min-width: 1280px) {
  .doc-view__toc {
    display: block;
    position: sticky;
    top: 4.75rem;
    align-self: start;
    max-height: calc(100vh - 5.75rem);
    overflow-y: auto;
  }
}
</style>