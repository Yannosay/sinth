<template>
  <nav class="docs-toc" aria-label="On this page">
    <p class="docs-toc__label">On this page</p>
    <ul class="docs-toc__list">
      <li
        v-for="heading in headings"
        :key="heading.id"
        :class="['docs-toc__item', `docs-toc__item--depth-${heading.depth}`]"
      >
        <a :href="`#${heading.id}`" class="docs-toc__link">{{ heading.text }}</a>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
interface TocHeading {
  id: string
  text: string
  depth: number
}

defineProps<{ headings: TocHeading[] }>()
</script>

<style scoped>
.docs-toc__label {
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-dim);
  margin-bottom: 0.8rem;
}

.docs-toc__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.docs-toc__item {
  padding: 0;
  margin: 0;
}

.docs-toc__item--depth-3 {
  padding-left: 0.75rem;
}

.docs-toc__link {
  display: block;
  padding: 0.3rem 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--fg-dim);
  text-decoration: none;
  transition: color 0.15s;
}

.docs-toc__link:hover {
  color: var(--fg);
}

.docs-toc__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>