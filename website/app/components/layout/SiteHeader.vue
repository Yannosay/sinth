<template>
  <header class="site-header">
    <nav class="site-nav" aria-label="Primary">
      <NuxtLink to="/" class="site-logo" aria-label="Sinth home">
        <img
          src="/assets/images/logo/sinth-logo.png"
          alt="Sinth"
          class="site-logo__img"
          width="114"
          height="36"
          decoding="async"
        >
      </NuxtLink>

      <div class="site-nav__links">
        <NuxtLink to="/docs" class="site-nav__link" active-class="site-nav__link--active">
          Docs
        </NuxtLink>
        <NuxtLink to="/playground" class="site-nav__link" active-class="site-nav__link--active">
          Playground
        </NuxtLink>
        <a
          href="https://github.com/Yannosay/sinth"
          target="_blank"
          rel="noopener noreferrer"
          class="site-nav__link"
        >
          GitHub
        </a>
        <a
          href="https://discord.gg/SUvcrafTQm"
          target="_blank"
          rel="noopener noreferrer"
          class="site-nav__link"
        >
          Discord
        </a>
      </div>
    </nav>
  </header>
</template>

<script setup lang="ts">
</script>

<style lang="scss" scoped>
.site-header {
  position: sticky;
  top: 0;
  width: 100%;
  z-index: 50;
  border-bottom: 1px solid var(--line-soft);
  background-color: rgba(12, 12, 16, 0.72);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  backdrop-filter: blur(14px) saturate(140%);
  will-change: backdrop-filter;
  transform: translateZ(0);
  isolation: isolate;
}

.site-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 90rem;
  margin: 0 auto;
  padding: 0 1.5rem;
  height: 3.75rem;

  @media (min-width: 768px) {
    padding: 0 2rem;
  }
}

.site-nav__links {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  font-size: 0.82rem;
  font-weight: 400;

  @media (min-width: 768px) {
    gap: 2rem;
  }
}

.site-nav__link {
  color: var(--fg-muted);
  text-decoration: none;
  transition: color 0.15s;

  &:hover {
    color: var(--fg);
  }

  &.site-nav__link--active {
    color: var(--fg);
  }
}

.site-logo {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.site-logo__img {
  height: 1.5rem;
  width: auto;
  display: block;
}
</style>