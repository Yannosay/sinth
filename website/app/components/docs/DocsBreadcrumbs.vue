<template>
  <nav class="docs-crumbs" aria-label="Breadcrumb">
    <ol class="docs-crumbs__list">
      <li class="docs-crumbs__item">
        <NuxtLink to="/docs" class="docs-crumbs__link">Docs</NuxtLink>
      </li>
      <li v-if="sectionTitle" class="docs-crumbs__item">
        <span class="docs-crumbs__sep" aria-hidden="true">/</span>
        <span class="docs-crumbs__current">{{ sectionTitle }}</span>
      </li>
      <li v-if="pageTitle" class="docs-crumbs__item">
        <span class="docs-crumbs__sep" aria-hidden="true">/</span>
        <span class="docs-crumbs__current docs-crumbs__current--active">{{ pageTitle }}</span>
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
defineProps<{
  sectionTitle?: string
  pageTitle?: string
}>()
</script>

<style scoped>
.docs-crumbs {
  margin-bottom: 1.75rem;
}

.docs-crumbs__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.78rem;
}

.docs-crumbs__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.docs-crumbs__sep {
  color: var(--fg-dim);
  opacity: 0.5;
}

.docs-crumbs__link {
  color: var(--fg-dim);
  text-decoration: none;
  transition: color 0.15s;
}

.docs-crumbs__link:hover {
  color: var(--fg);
}

.docs-crumbs__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.docs-crumbs__current {
  color: var(--fg-muted);
}

.docs-crumbs__current--active {
  color: var(--fg);
}
</style>