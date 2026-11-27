<template>
  <div class="home">
    <section class="hero">
      <div class="hero__glow" aria-hidden="true" />
      <img
        src="/assets/images/logo/sinth-logo.png"
        alt="Sinth"
        class="hero__logo"
        width="520"
        height="228"
        decoding="async"
        fetchpriority="high"
      >
      <h1 class="hero__title">The compiled language for fast, reactive websites.</h1>
      <p class="hero__tagline">
        Write pages and components in one readable syntax. Sinth type-checks your project and ships prerendered HTML,
        scoped CSS and the JavaScript each page needs, with routing, API routes and deployment built in.
      </p>
      <div class="hero__cta">
        <UiButton href="/docs/getting-started/introduction" :external="false" variant="filled">Get started</UiButton>
        <UiButton href="/playground" :external="false" variant="ghost">Open the playground</UiButton>
      </div>
      <button type="button" class="hero__install" :aria-label="`Copy: ${installCommand}`" @click="copyInstall">
        <code>{{ installCommand }}</code>
        <span class="hero__install-hint">{{ copied ? 'copied' : 'copy' }}</span>
      </button>
      <dl class="hero__facts">
        <div v-for="fact in facts" :key="fact.label" class="hero__fact">
          <dt>{{ fact.value }}</dt>
          <dd>{{ fact.label }}</dd>
        </div>
      </dl>
    </section>

    <section class="demo" aria-labelledby="demo-heading">
      <div class="demo__container">
        <div class="demo__text">
          <h2 id="demo-heading" class="section-heading">Markup, state and styles in one file.</h2>
          <p class="section-body">
            Variables are reactive, handlers are plain expressions and styles are scoped automatically.
            Edit the code: this is the real compiler, running in your browser.
          </p>
          <NuxtLink to="/docs/getting-started/tutorial" class="text-link">Follow the tutorial →</NuxtLink>
        </div>
        <div class="demo__frame">
          <ClientOnly>
            <SinthPlayground compact :initial-code="demoCode" />
            <template #fallback>
              <div class="demo__loading">Loading the compiler…</div>
            </template>
          </ClientOnly>
        </div>
      </div>
    </section>

    <section class="stack" aria-labelledby="stack-heading">
      <div class="stack__container">
        <h2 id="stack-heading" class="section-heading">One tool instead of a stack</h2>
        <p class="section-body stack__intro">
          A typical site combines a UI framework, a meta-framework, a router, a component kit, an SSG step and per-host
          config files. In Sinth these are part of the language and the CLI, checked together and versioned together.
        </p>
        <dl class="stack__list">
          <div v-for="row in stack" :key="row.need" class="stack__row">
            <dt>{{ row.need }}</dt>
            <dd>
              <code v-if="row.code">{{ row.code }}</code>
              {{ row.how }}
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="features" aria-labelledby="features-heading">
      <div class="features__container">
        <h2 id="features-heading" class="section-heading">Everything a website needs, in the box</h2>
        <div class="features__grid">
          <article v-for="feature in features" :key="feature.title" class="feature">
            <h3 class="feature__title">{{ feature.title }}</h3>
            <p class="feature__body">{{ feature.body }}</p>
            <NuxtLink :to="feature.href" class="feature__link">{{ feature.link }} →</NuxtLink>
          </article>
        </div>
      </div>
    </section>

    <section class="agents" aria-labelledby="agents-heading">
      <div class="agents__container">
        <h2 id="agents-heading" class="section-heading">Built for working with AI agents</h2>
        <p class="section-body">
          A Sinth page is one short file with its markup, state and styles, so an agent reads less and changes less.
          The compiler checks every edit and returns machine-readable fixes, and the Sinth skill teaches the agent to
          build with <code>sinth:ui</code> instead of piling up custom code.
        </p>
        <AgentLogos class="agents__logos" />
        <div class="agents__install">
          <p class="agents__step">In a Sinth project</p>
          <button type="button" class="hero__install agents__command" :aria-label="`Copy: ${skillCommand}`" @click="copySkill">
            <code>{{ skillCommand }}</code>
            <span class="hero__install-hint">{{ skillCopied ? 'copied' : 'copy' }}</span>
          </button>
          <p class="agents__step">Or ask your agent</p>
          <AgentPrompt class="agents__prompt" />
        </div>
        <NuxtLink to="/docs/tooling/ai-agents" class="text-link">What the skill changes →</NuxtLink>
      </div>
    </section>

    <section class="ide-section" aria-labelledby="ide-heading">
      <div class="ide-section__container">
        <div class="ide-section__text">
          <h2 id="ide-heading" class="section-heading">Sinth IDE</h2>
          <p class="section-body">
            A desktop editor made for Sinth. Open a folder and press Run: it finds the project's compiler, starts the dev
            server in its own terminal and opens your browser. Errors from <code>sinth check</code> appear inline on every
            save, and completions know every element, <code>sinth:ui</code> component and attribute.
          </p>
          <ul class="ide-section__points">
            <li>Run, Build, Preview, Check and Deploy from the toolbar or the command palette</li>
            <li>Installs Sinth compilers with verified checksums, no setup needed</li>
            <li>Signed automatic updates for Windows, macOS and Linux</li>
          </ul>
          <div class="ide-section__cta">
            <UiButton href="https://github.com/Yannosay/sinth-ide/releases/latest" variant="filled">Download Sinth IDE</UiButton>
            <UiButton href="/docs/tooling/editors" :external="false" variant="ghost">VS Code extension</UiButton>
          </div>
          <p class="ide-section__note">Free and open source. Early development: feedback is welcome on GitHub.</p>
        </div>
        <IdeShowcase class="ide-section__shot" />
      </div>
    </section>

    <section class="start" aria-labelledby="start-heading">
      <div class="start__container">
        <h2 id="start-heading" class="section-heading">Start in a minute</h2>
        <pre class="start__commands"><code>npx @yannosay/sinth create my-site
cd my-site
npm install
npm run dev</code></pre>
        <p class="section-body">
          Needs Node.js 18.17 or newer. Works with the <a href="https://github.com/Yannosay/sinth/releases/latest" target="_blank" rel="noopener">VS Code extension</a>
          and <a href="https://github.com/Yannosay/sinth-ide/releases/latest" target="_blank" rel="noopener">Sinth IDE</a>.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import UiButton from '~/components/ui/Button.vue'
import SinthPlayground from '~/components/playground/SinthPlayground.vue'
import AgentPrompt from '~/components/AgentPrompt.vue'
import AgentLogos from '~/components/AgentLogos.vue'
import IdeShowcase from '~/components/IdeShowcase.vue'

const installCommand = 'npx @yannosay/sinth create my-site'
const skillCommand = 'npx sinth skill'
const copied = ref(false)
const skillCopied = ref(false)

async function copyText(text: string, flag: typeof copied): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    flag.value = true
    setTimeout(() => { flag.value = false }, 1800)
  } catch {
    flag.value = false
  }
}

const copyInstall = (): Promise<void> => copyText(installCommand, copied)
const copySkill = (): Promise<void> => copyText(skillCommand, skillCopied)

/** Measured on the counter example and the default build; see the README and the sinth:ui docs. */
const facts = [
  { value: '3.5 kB', label: 'JavaScript for an interactive page, runtime and router included' },
  { value: '2 kB', label: 'for static pages, which still prerender and navigate instantly' },
  { value: '28', label: 'accessible UI components built in' },
  { value: '1 command', label: 'to deploy to Cloudflare, Vercel, Netlify or GitHub Pages' }
]

const stack = [
  { need: 'Components and reactivity', code: '.sinth', how: 'files with markup, state, functions and scoped styles' },
  { need: 'Type checking', code: 'sinth check', how: 'names, types, arguments and component parameters across the project' },
  { need: 'Routing and prerendering', code: 'pages/', how: 'every file is a prerendered page; links navigate without reloads' },
  { need: 'UI kit', code: 'sinth:ui', how: 'forms, modals, tabs, tables, toasts and more, keyboard accessible' },
  { need: 'API routes', code: 'functions/', how: 'standard Fetch API handlers, local and on Cloudflare' },
  { need: 'Config and secrets', code: 'sinth:env', how: 'public variables checked at compile time; secrets stay on the server' },
  { need: 'Redirects and headers', code: 'sinth.config.json', how: 'written once, translated for every host' },
  { need: 'SEO and AI discovery', code: 'title = …', how: 'meta tags, sitemap, robots.txt, JSON-LD and llms.txt from page metadata' },
  { need: 'Security', how: 'escaped output, URL sanitizing, CSP without inline scripts and security headers by default' },
  { need: 'Deploys', code: 'sinth deploy', how: 'Cloudflare Pages or Workers, Vercel, Netlify; GitHub Pages and any static host' }
]

const demoCode = `var str name = "world"
var num count = 0

Main {
  Heading(level: 1) { "Hello, " + name + "!" }
  Input(model: name, placeholder: "Your name")
  Button(onClick: count += 1) { "Clicked " + count + " times" }
}

style {
  main { fontFamily: "system-ui, sans-serif"; padding: "1.5rem" }
  h1 { color: "#7c3aed" }
  input, button { font: "inherit"; padding: "0.4rem 0.7rem"; marginRight: "0.5rem" }
}
`

const features = [
  { title: 'Reactive by design', body: 'Assign to a variable and exactly the affected parts of the page update. Arrays and objects can be changed in place.', href: '/docs/language/variables', link: 'Variables and state' },
  { title: 'Checked before it runs', body: 'Unknown names, wrong types, missing arguments and missing component props are compile errors with a code frame and a hint.', href: '/docs/reference/errors', link: 'Error reference' },
  { title: 'Prerendered pages', body: 'Every page is HTML at build time, so content shows before any JavaScript runs. Links are prefetched and swapped in place without reloads.', href: '/docs/production/performance', link: 'Rendering and performance' },
  { title: 'Full stack', body: 'API routes in functions/ use the standard Fetch API, run in the dev server and deploy to Cloudflare Pages or Workers unchanged.', href: '/docs/full-stack/functions', link: 'Server functions' },
  { title: 'A real component library', body: '28 sinth:ui components: forms, modals with focus trapping, tabs, sortable tables, toasts, menus. Themed with a few CSS variables, dark mode included.', href: '/docs/components/sinth-ui', link: 'sinth:ui' },
  { title: 'Components everywhere', body: 'Scoped styles, slots and two-way bindings. Export any component as a web component and use it in plain HTML sites.', href: '/docs/components/custom-elements', link: 'Custom elements' },
  { title: 'Hot reload that keeps state', body: 'Save a file and the page updates without losing form input or variables. Errors appear in an overlay with the exact location.', href: '/docs/tooling/dev-server', link: 'Dev server' },
  { title: 'Secure defaults', body: 'No eval, escaped output, sanitized URLs, a CSP without inline scripts and security headers. The dev server blocks DNS rebinding.', href: '/docs/production/security', link: 'Security' },
  { title: 'Production config, once', body: 'Environment variables checked at compile time, plus redirects and headers that work the same locally and on every host.', href: '/docs/full-stack/environment', link: 'Environment variables' },
]

const siteUrl = String(useRuntimeConfig().public.siteUrl)
const description = 'Sinth is a compiled, type-checked language for websites and web apps: reactive components, file-based routing with instant navigation, prerendered pages, API routes and one-command deploys.'

useCanonical('/')

useHead({
  title: 'Sinth: the compiled language for fast, reactive websites',
  titleTemplate: null,
  meta: [
    { name: 'description', content: description },
    { property: 'og:title', content: 'Sinth: the compiled language for fast, reactive websites' },
    { property: 'og:description', content: description }
  ],
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'ComputerLanguage',
          name: 'Sinth',
          url: siteUrl,
          description
        },
        {
          '@type': 'SoftwareApplication',
          name: 'Sinth',
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'Windows, macOS, Linux',
          url: siteUrl,
          downloadUrl: 'https://www.npmjs.com/package/@yannosay/sinth',
          softwareHelp: `${siteUrl}/docs`,
          license: 'https://www.gnu.org/licenses/agpl-3.0.html',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          author: { '@type': 'Organization', name: 'Yannosay Productions', url: 'https://yannosay.com' },
          sameAs: ['https://github.com/Yannosay/sinth', 'https://www.npmjs.com/package/@yannosay/sinth']
        },
        { '@type': 'WebSite', name: 'Sinth', url: siteUrl }
      ]
    })
  }]
})
</script>

<style lang="scss" scoped>
@use '~/assets/css/components/page' as page;

.home {
  width: 100%;
}

.hero {
  min-height: calc(100svh - 3.75rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4rem 1.5rem;
  position: relative;
  overflow: hidden;
}

.hero__glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 55vw;
  height: 55vw;
  max-width: 780px;
  max-height: 780px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(167, 139, 250, 0.14) 0%, transparent 62%);
  pointer-events: none;
}

.hero__logo {
  position: relative;
  width: clamp(200px, 28vw, 400px);
  height: auto;
  margin-bottom: 1.75rem;
}

.hero__title {
  position: relative;
  max-width: 22ch;
  font-family: var(--font-sans);
  font-size: clamp(1.6rem, 3.6vw, 2.6rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.15;
  color: var(--fg);
}

.hero__tagline {
  position: relative;
  max-width: 56ch;
  margin-top: 1.25rem;
  font-size: clamp(0.95rem, 1.4vw, 1.05rem);
  line-height: 1.7;
  color: var(--fg-muted);
}

.hero__cta {
  position: relative;
  margin-top: 2.25rem;
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
}

.hero__install {
  position: relative;
  margin-top: 1.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.9rem;
  max-width: 100%;
  padding: 0.6rem 0.9rem;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--accent-bright);
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 8px;
  cursor: pointer;

  code {
    overflow-x: auto;
    white-space: nowrap;
  }

  &:hover {
    border-color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
}

.hero__install-hint {
  font-size: 0.7rem;
  color: var(--fg-dim);
}

.section-heading {
  font-family: var(--font-sans);
  font-weight: 600;
  font-size: clamp(1.35rem, 2.4vw, 1.75rem);
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--fg);
  margin-bottom: 1rem;
}

.section-body {
  font-size: 0.95rem;
  color: var(--fg-muted);
  line-height: 1.7;

  a {
    color: var(--accent-bright);
  }
}

.text-link {
  display: inline-block;
  margin-top: 1.25rem;
  font-size: 0.9rem;
  color: var(--accent-bright);
}

.demo {
  border-top: 1px solid var(--line-soft);
  padding: clamp(4rem, 8vw, 6rem) 1.5rem;
}

.demo__container {
  @include page.container;
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.5rem;
  align-items: center;

  @media (min-width: 1000px) {
    grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
    gap: 3.5rem;
  }
}

.demo__frame {
  height: 30rem;
  min-width: 0;

  @media (max-width: 899px) {
    height: 40rem;
  }
}

.demo__loading {
  height: 100%;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--fg-muted);
  font-size: 0.85rem;
}

.features {
  @include page.page;
  border-top: 1px solid var(--line-soft);
}

.features__container {
  @include page.container;
}

.features__grid {
  @include page.grid;
  margin-top: 1.5rem;
}

.feature {
  @include page.card;
  display: flex;
  flex-direction: column;
}

.feature__title {
  @include page.card-title;
  font-size: 1.05rem;
  font-weight: 600;
}

.feature__body {
  @include page.card-body;
  font-size: 0.9rem;
  flex: 1;
}

.feature__link {
  margin-top: 1rem;
  font-size: 0.82rem;
  color: var(--accent-bright);
}

.agents {
  border-top: 1px solid var(--line-soft);
  padding: clamp(4rem, 8vw, 6rem) 1.5rem;
}

.agents__container {
  @include page.container-narrow;
  text-align: center;
}

.agents__prompt {
  margin: 1.75rem 0 0.25rem;
}

.start {
  border-top: 1px solid var(--line-soft);
  padding: clamp(4rem, 8vw, 6rem) 1.5rem;
}

.start__container {
  @include page.container-narrow;
  text-align: center;
}

.start__commands {
  display: inline-block;
  margin: 0.5rem 0 1.5rem;
  padding: 1rem 1.4rem;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  line-height: 1.7;
  text-align: left;
  color: var(--accent-bright);
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 8px;
  overflow-x: auto;
  max-width: 100%;

  code {
    background: none;
    padding: 0;
    color: inherit;
  }
}

.hero__facts {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 1.5rem;
  width: min(56rem, 100%);
  margin-top: 3rem;

  dt { font-size: 1.35rem; font-weight: 600; color: var(--fg); }
  dd { margin: 0.25rem 0 0; font-size: 0.8rem; line-height: 1.5; color: var(--fg-muted); }
}

.stack, .ide-section {
  border-top: 1px solid var(--line-soft);
  padding: clamp(4rem, 8vw, 6rem) 1.5rem;
}

.stack__container { @include page.container; }
.stack__intro { max-width: 60ch; }

.stack__list {
  margin-top: 2rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
  gap: 0 2.5rem;
}

.stack__row {
  display: grid;
  grid-template-columns: 11rem 1fr;
  gap: 1rem;
  padding: 0.8rem 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 0.9rem;

  dt { font-weight: 600; color: var(--fg); }
  dd { margin: 0; color: var(--fg-muted); }
  code { color: var(--accent-bright); margin-right: 0.35rem; }
}

.agents__logos { margin-top: 2rem; }
.agents__install { margin-top: 2rem; }
.agents__step { margin-top: 1.25rem; font-size: 0.8rem; color: var(--fg-dim); text-transform: uppercase; letter-spacing: 0.06em; }
.agents__command { margin-top: 0.5rem; }

.ide-section__container {
  @include page.container;
  display: grid;
  gap: 3rem;
  align-items: center;

  @media (min-width: 1100px) { grid-template-columns: minmax(0, 22rem) minmax(0, 1fr); }
}

.ide-section__points {
  margin: 1.25rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.9rem;
  line-height: 1.8;
  color: var(--fg-muted);
}

.ide-section__cta { margin-top: 1.75rem; display: flex; gap: 0.6rem; flex-wrap: wrap; }
.ide-section__note { margin-top: 1rem; font-size: 0.8rem; color: var(--fg-dim); }
.ide-section__shot { min-width: 0; }
</style>
