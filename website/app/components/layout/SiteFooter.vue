<template>
  <footer class="site-footer">
    <div class="site-footer__inner">
      <div class="site-footer__top">
        <NuxtLink to="/" class="site-footer__brand" aria-label="Sinth home">
          <img
            src="/assets/images/logo/sinth-logo.png"
            alt=""
            class="site-footer__brand-img"
            width="90"
            height="27"
            decoding="async"
          >
        </NuxtLink>
        <div class="site-footer__nav">
          <NuxtLink to="/docs" class="site-footer__nav-link">Docs</NuxtLink>
          <NuxtLink to="/playground" class="site-footer__nav-link">Playground</NuxtLink>
          <a href="https://github.com/Yannosay/sinth/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer" class="site-footer__nav-link">Changelog</a>
          <a href="https://www.npmjs.com/package/@yannosay/sinth" target="_blank" rel="noopener noreferrer" class="site-footer__nav-link">npm</a>
          <a href="https://github.com/Yannosay/sinth" target="_blank" rel="noopener noreferrer" class="site-footer__nav-link">GitHub</a>
          <a href="https://discord.gg/SUvcrafTQm" target="_blank" rel="noopener noreferrer" class="site-footer__nav-link">Discord</a>
          <a href="https://yannosay.com" target="_blank" rel="noopener noreferrer" class="site-footer__nav-link">Yannosay</a>
        </div>
      </div>
      <div class="site-footer__bottom">
        <p class="site-footer__copy">&copy; {{ currentYear }} Yannosay Productions</p>
        <p class="site-footer__credit">Sinth is released under the AGPL-3.0 license.</p>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const currentYear = computed(() => new Date().getFullYear())
</script>

<style lang="scss" scoped>
.site-footer {
  border-top: 1px solid var(--line-soft);
  padding: 3rem 0;
  margin-top: 4rem;
}

.site-footer__inner {
  max-width: 90rem;
  margin: 0 auto;
  padding: 0 1.5rem;

  @media (min-width: 768px) {
    padding: 0 2rem;
  }
}

.site-footer__top {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.75rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--line-soft);

  @media (min-width: 768px) {
    flex-direction: row;
    align-items: center;
  }
}

.site-footer__brand {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.site-footer__brand-img {
  height: 1.25rem;
  width: auto;
  opacity: 0.35;
  transition: opacity 0.3s;
}

.site-footer__brand:hover .site-footer__brand-img {
  opacity: 0.7;
}

.site-footer__nav {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  font-size: 0.8rem;
  flex-wrap: wrap;
}

.site-footer__nav-link {
  color: var(--fg-dim);
  text-decoration: none;
  transition: color 0.15s;
}

.site-footer__nav-link:hover {
  color: var(--fg);
}

.site-footer__bottom {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  padding-top: 1.75rem;

  @media (min-width: 768px) {
    flex-direction: row;
    align-items: center;
  }
}

.site-footer__copy,
.site-footer__credit {
  color: var(--fg-dim);
  font-size: 0.75rem;
  margin: 0;
}
</style>