<template>
  <div class="docs-index">
    <header class="docs-index__header">
      <h1 class="docs-index__title">Sinth Documentation</h1>
      <p class="docs-index__lede">
        Everything about the Sinth language, its compiler and tools. New here? Start with the
        <NuxtLink to="/docs/getting-started/introduction">introduction</NuxtLink> and the
        <NuxtLink to="/docs/getting-started/tutorial">tutorial</NuxtLink>, or try it in the
        <NuxtLink to="/playground">playground</NuxtLink>.
      </p>
    </header>

    <p v-if="pending" class="docs-index__state">Loading…</p>
    <p v-else-if="error" class="docs-index__state docs-index__state--error">Documentation is unavailable right now.</p>
    <p v-else-if="sections.length === 0" class="docs-index__state">Documentation is being written.</p>

    <div v-else class="docs-index__sections">
      <section v-for="section in sections" :key="section.slug" class="docs-section">
        <h2 class="docs-section__title">{{ section.title }}</h2>
        <ul class="docs-section__pages">
          <li v-for="page in section.pages" :key="page.slug">
            <NuxtLink :to="page.href" class="docs-entry">
              <span class="docs-entry__main">
                <span class="docs-entry__title">{{ page.title }}</span>
                <span v-if="page.description" class="docs-entry__description">{{ page.description }}</span>
              </span>
              <span class="docs-entry__arrow" aria-hidden="true">→</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

definePageMeta({ layout: 'docs' })

interface ApiPage {
  slug: string
  title: string
  description: string
  order: number
  href: string
}

interface ApiSection {
  slug: string
  title: string
  order: number
  pages: ApiPage[]
}

interface ApiResponse {
  sections: ApiSection[]
}

useCanonical('/docs')

useHead({
  title: 'Sinth Docs',
  titleTemplate: null,
  meta: [
    { name: 'description', content: 'Official Sinth documentation: installation, a tutorial, the language reference, components and styling, server functions, deployment, the CLI and every error code.' },
    { property: 'og:title', content: 'Sinth Docs' },
    { property: 'og:description', content: 'Learn Sinth: tutorial, language reference, components, server functions and deployment.' }
  ]
})

const { data, pending, error } = await useFetch<ApiResponse>('/api/content', {
  key: 'docs-manifest'
})

const sections = computed(() => data.value?.sections ?? [])
</script>

<style lang="scss" scoped>
.docs-index {
  max-width: 52rem;
}

.docs-index__header {
  margin-bottom: 3.5rem;
}

.docs-index__title {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: clamp(1.85rem, 3.2vw, 2.35rem);
  letter-spacing: -0.028em;
  line-height: 1.15;
  color: var(--fg);
}

.docs-index__lede {
  margin-top: 0.85rem;
  font-size: 1rem;
  color: var(--fg-muted);
  line-height: 1.6;
  max-width: 52ch;
}

.docs-index__state {
  font-size: 0.9rem;
  color: var(--fg-muted);
  padding: 1rem 0;
}

.docs-index__state--error {
  color: #f87171;
}

.docs-index__sections {
  display: flex;
  flex-direction: column;
  gap: 2.75rem;
}

.docs-section__title {
  font-family: var(--font-sans);
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-dim);
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--line-soft);
  margin-bottom: 0.35rem;
}

.docs-section__pages {
  list-style: none;
  padding: 0;
  margin: 0;
}

.docs-entry {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 0;
  text-decoration: none;
  border-bottom: 1px solid var(--line-soft);
}

.docs-section__pages li:last-child .docs-entry {
  border-bottom: none;
}

.docs-entry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
  border-radius: 4px;
}

.docs-entry__main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.docs-entry__title {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--fg);
  letter-spacing: -0.005em;
  transition: color 0.15s;
}

.docs-entry__description {
  font-size: 0.85rem;
  color: var(--fg-muted);
  line-height: 1.55;
}

.docs-entry__arrow {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--fg-dim);
  transition: color 0.15s, transform 0.15s;
}

.docs-entry:hover .docs-entry__title {
  color: var(--accent-soft);
}

.docs-entry:hover .docs-entry__arrow {
  color: var(--accent-soft);
  transform: translateX(3px);
}
</style>