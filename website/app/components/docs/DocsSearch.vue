<template>
  <div class="docs-search">
    <label for="docs-search-input" class="docs-search__label">Search</label>
    <div class="docs-search__field">
      <svg class="docs-search__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" stroke-linecap="round" />
      </svg>
      <input
        id="docs-search-input"
        :value="modelValue"
        type="search"
        class="docs-search__input"
        placeholder="Filter pages"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
      >
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onInput(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  emit('update:modelValue', target.value)
}
</script>

<style scoped>
.docs-search {
  margin-bottom: 1.75rem;
}

.docs-search__label {
  display: block;
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-dim);
  margin-bottom: 0.6rem;
}

.docs-search__field {
  position: relative;
  display: flex;
  align-items: center;
}

.docs-search__icon {
  position: absolute;
  left: 0.7rem;
  width: 0.85rem;
  height: 0.85rem;
  color: var(--fg-dim);
  pointer-events: none;
}

.docs-search__input {
  width: 100%;
  padding: 0.5rem 0.75rem 0.5rem 1.9rem;
  font-family: var(--font-sans);
  font-size: 0.82rem;
  color: var(--fg);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--line);
  border-radius: 6px;
  transition: border-color 0.15s, background-color 0.15s;
  -webkit-appearance: none;
  appearance: none;
}

.docs-search__input::placeholder {
  color: var(--fg-dim);
}

.docs-search__input:hover {
  border-color: var(--line-strong);
}

.docs-search__input:focus-visible {
  outline: none;
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.03);
}
</style>