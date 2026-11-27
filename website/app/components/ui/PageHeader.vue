<template>
  <header class="page-header">
    <p v-if="eyebrow" class="page-header__eyebrow">{{ eyebrow }}</p>
    <h1 class="page-header__title">{{ title }}</h1>
    <p v-if="lede" class="page-header__lede">{{ lede }}</p>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  eyebrow?: string
  title: string
  lede?: string
}>()
</script>

<style scoped>
.page-header {
  margin-bottom: 3rem;
}

.page-header__eyebrow {
  font-size: 0.68rem;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-dim);
  margin-bottom: 0.9rem;
}

.page-header__title {
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: clamp(1.85rem, 3.2vw, 2.4rem);
  letter-spacing: -0.025em;
  line-height: 1.15;
  color: var(--fg);
}

.page-header__lede {
  margin-top: 1rem;
  font-size: 1rem;
  font-weight: 400;
  color: var(--fg-muted);
  line-height: 1.65;
  max-width: 56ch;
}

.page-header__actions {
  margin-top: 1.75rem;
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
}
</style>