<template>
  <nav v-if="prev || next" class="docs-pager" aria-label="Documentation pagination">
    <NuxtLink
      v-if="prev"
      :to="prev.href"
      class="docs-pager__link docs-pager__link--prev"
    >
      <span class="docs-pager__label">← Previous</span>
      <span class="docs-pager__title">{{ prev.title }}</span>
    </NuxtLink>
    <NuxtLink
      v-if="next"
      :to="next.href"
      class="docs-pager__link docs-pager__link--next"
    >
      <span class="docs-pager__label">Next →</span>
      <span class="docs-pager__title">{{ next.title }}</span>
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
interface PagerLink {
  title: string
  href: string
}

defineProps<{
  prev: PagerLink | null
  next: PagerLink | null
}>()
</script>

<style scoped>
.docs-pager {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 4rem;
  padding-top: 2rem;
  border-top: 1px solid var(--line-soft);
}

.docs-pager__link {
  flex: 1 1 14rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  text-decoration: none;
  color: var(--fg);
  background: rgba(255, 255, 255, 0.01);
  transition: border-color 0.15s, background-color 0.15s;
  min-width: 0;
}

.docs-pager__link:hover {
  border-color: var(--line-strong);
  background-color: rgba(255, 255, 255, 0.03);
}

.docs-pager__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.docs-pager__link--next {
  text-align: right;
}

.docs-pager__label {
  font-size: 0.7rem;
  color: var(--fg-dim);
}

.docs-pager__title {
  font-size: 0.9rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}
</style>