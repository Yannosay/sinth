<template>
  <div class="embed-page">
    <ClientOnly>
      <SinthPlayground compact />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import SinthPlayground from '~/components/playground/SinthPlayground.vue'

definePageMeta({ layout: false })

useHead({
  title: 'Playground embed',
  meta: [{ name: 'robots', content: 'noindex' }]
})
</script>

<style scoped>
.embed-page {
  height: 100vh;
  background: #0e0e13;
}

.embed-page > :deep(.playground) {
  height: 100%;
  border: none;
  border-radius: 0;
}
</style>
