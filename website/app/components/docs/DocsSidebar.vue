<template>
  <nav class="docs-nav" aria-label="Documentation">
    <DocsSearch v-model="query" />

    <p v-if="pending" class="docs-nav__state">Loading…</p>
    <p v-else-if="error" class="docs-nav__state docs-nav__state--error">Navigation unavailable.</p>
    <p v-else-if="filteredSections.length === 0" class="docs-nav__state">No matching pages.</p>

    <ul v-else class="docs-nav__sections">
      <li v-for="section in filteredSections" :key="section.slug" class="docs-nav__section">
        <p class="docs-nav__section-title">{{ section.title }}</p>
        <ul class="docs-nav__pages">
          <li v-for="page in section.pages" :key="page.slug">
            <NuxtLink
              :to="page.href"
              class="docs-nav__link"
              active-class="docs-nav__link--active"
            >
              {{ page.title }}
            </NuxtLink>
          </li>
        </ul>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import DocsSearch from './DocsSearch.vue'

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

const { data, pending, error } = await useFetch<ApiResponse>('/api/content', {
  key: 'docs-manifest'
})

const query = ref('')

const filteredSections = computed<ApiSection[]>(() => {
  const sections = data.value?.sections ?? []
  const normalized = query.value.trim().toLowerCase()
  if (!normalized) return sections

  return sections
    .map(section => ({
      ...section,
      pages: section.pages.filter(page =>
        page.title.toLowerCase().includes(normalized) ||
        page.description.toLowerCase().includes(normalized)
      )
    }))
    .filter(section => section.pages.length > 0)
})
</script>

<style scoped>
.docs-nav {
  padding: 0;
}

.docs-nav__state {
  font-size: 0.82rem;
  color: var(--fg-dim);
  padding: 0.5rem 0;
}

.docs-nav__state--error {
  color: #f87171;
}

.docs-nav__sections {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.docs-nav__section-title {
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-dim);
  margin-bottom: 0.7rem;
}

.docs-nav__pages {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.docs-nav__link {
  display: block;
  padding: 0.4rem 0.7rem;
  margin-left: -0.7rem;
  font-size: 0.85rem;
  font-weight: 400;
  color: var(--fg-muted);
  text-decoration: none;
  border-radius: 5px;
  transition: color 0.15s, background-color 0.15s;
  line-height: 1.4;
}

.docs-nav__link:hover {
  color: var(--fg);
  background-color: rgba(255, 255, 255, 0.03);
}

.docs-nav__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.docs-nav__link--active {
  color: var(--accent-soft);
  background-color: var(--accent-dim);
  font-weight: 500;
}
</style>