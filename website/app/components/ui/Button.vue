<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="href || undefined"
    :target="href && external ? '_blank' : undefined"
    :rel="href && external ? 'noopener noreferrer' : undefined"
    :type="href ? undefined : 'button'"
    :class="['si-btn', `si-btn--${variant}`]"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
defineProps({
  href: { type: String, default: '' },
  variant: { type: String, default: 'ghost' },
  external: { type: Boolean, default: true }
})
</script>

<style scoped>
.si-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem 1.15rem;
  border-radius: 4px;
  font-family: var(--font-sans);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0;
  line-height: 1;
  text-transform: none;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  user-select: none;
  -webkit-user-select: none;
  white-space: nowrap;
}

.si-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.si-btn--filled {
  background: var(--fg);
  color: var(--bg);
  border-color: var(--fg);
}

.si-btn--filled:hover {
  background: #ffffff;
  border-color: #ffffff;
}

.si-btn--ghost {
  background: transparent;
  color: var(--fg);
  border-color: var(--line-strong);
}

.si-btn--ghost:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.24);
}

.si-btn--accent {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}

.si-btn--accent:hover {
  background: var(--accent-soft);
  border-color: var(--accent-soft);
}
</style>