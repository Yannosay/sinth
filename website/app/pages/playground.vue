<template>
  <div class="playground-page">
    <h1 class="visually-hidden">Sinth playground</h1>
    <ClientOnly>
      <SinthPlayground />
      <template #fallback>
        <div class="playground-page__loading">Loading the Sinth compiler…</div>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import SinthPlayground from '~/components/playground/SinthPlayground.vue'

useCanonical('/playground')

useHead({
  title: 'Playground',
  meta: [
    { name: 'description', content: 'Write Sinth in your browser and see the result instantly. The playground runs the real Sinth compiler, shows the generated HTML, JavaScript and CSS, and shares code by link.' },
    { property: 'og:title', content: 'Sinth playground' },
    { property: 'og:description', content: 'Try the Sinth language in your browser, no install needed.' }
  ]
})
</script>

<style scoped>
.playground-page {
  height: calc(100svh - 3.75rem);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
}

.playground-page > :deep(.playground) {
  flex: 1;
}

.playground-page__loading {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--fg-muted);
  font-size: 0.9rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
