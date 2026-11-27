<template>
  <div class="docs-layout">
    <a href="#docs-main" class="skip-link">Skip to content</a>

    <LayoutSiteHeader />

    <div class="docs-shell">
      <aside class="docs-shell__sidebar" :data-open="mobileOpen ? 'true' : 'false'">
        <button
          type="button"
          class="docs-shell__toggle"
          :aria-expanded="mobileOpen"
          aria-controls="docs-sidebar-body"
          @click="mobileOpen = !mobileOpen"
        >
          <span>Navigation</span>
          <span class="docs-shell__toggle-icon" aria-hidden="true">{{ mobileOpen ? '−' : '+' }}</span>
        </button>
        <div id="docs-sidebar-body" class="docs-shell__sidebar-body">
          <DocsSidebar />
        </div>
      </aside>
      <main id="docs-main" class="docs-shell__content">
        <slot />
      </main>
    </div>

    <LayoutSiteFooter />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import LayoutSiteHeader from '~/components/layout/SiteHeader.vue'
import LayoutSiteFooter from '~/components/layout/SiteFooter.vue'
import DocsSidebar from '~/components/docs/DocsSidebar.vue'

const mobileOpen = ref(false)
</script>

<style lang="scss" scoped>
.docs-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bg);
  color: var(--fg-body);
}

.docs-shell {
  flex: 1 1 0%;
  width: 100%;
  max-width: 84rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;

  @media (min-width: 768px) {
    padding: 2.5rem 2rem 4rem;
  }

  @media (min-width: 1024px) {
    grid-template-columns: 14rem minmax(0, 1fr);
    gap: 3.5rem;
    padding-top: 3rem;
  }
}

.docs-shell__sidebar {
  @media (min-width: 1024px) {
    position: sticky;
    top: 4.75rem;
    align-self: start;
    max-height: calc(100vh - 5.75rem);
    overflow-y: auto;
    padding-left: 0.75rem;
    padding-right: 0.5rem;
    margin-left: -0.75rem;
  }
}

.docs-shell__toggle {
  display: none;
  width: 100%;
  padding: 0.7rem 0.9rem;
  font-family: var(--font-sans);
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--fg);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
  justify-content: space-between;
  align-items: center;
  transition: border-color 0.15s, background-color 0.15s;

  &:hover {
    border-color: var(--line-strong);
    background: rgba(255, 255, 255, 0.04);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  @media (max-width: 1023px) {
    display: flex;
  }
}

.docs-shell__toggle-icon {
  font-family: var(--font-mono);
  font-size: 0.9rem;
  color: var(--fg-muted);
}

.docs-shell__sidebar-body {
  @media (max-width: 1023px) {
    display: none;
    margin-top: 0.75rem;
  }
}

.docs-shell__sidebar[data-open='true'] .docs-shell__sidebar-body {
  @media (max-width: 1023px) {
    display: block;
  }
}

.docs-shell__content {
  min-width: 0;
}
</style>