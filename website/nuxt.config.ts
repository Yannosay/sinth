import { fileURLToPath } from 'node:url'

const siteUrl = 'https://sinth.yannosay.com'
const description = 'Sinth is a compiled, type-checked language for websites and web apps: reactive components, file-based routing with instant navigation, prerendered pages, API routes and one-command deploys.'

export default defineNuxtConfig({
  css: ['~/assets/css/main.scss'],

  alias: {
    'sinth-compiler': fileURLToPath(new URL('../dist/browser/sinth.js', import.meta.url))
  },

  runtimeConfig: {
    public: { siteUrl }
  },

  app: {
    head: {
      titleTemplate: '%s | Sinth',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#0c0c10' },
        { name: 'description', content: description },
        { property: 'og:site_name', content: 'Sinth' },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: `${siteUrl}/og/og-default.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: `${siteUrl}/og/og-default.png` }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icon-192.png' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/icon-512.png' },
        { rel: 'apple-touch-icon', href: '/icon-192.png' },
        { rel: 'alternate', type: 'text/plain', title: 'Sinth documentation for language models', href: '/llms.txt' },
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/Unbounded-VariableFont_wght.woff2', crossorigin: 'anonymous' }
      ]
    }
  },

  nitro: {
    preset: 'cloudflare-pages',
    cloudflare: { nodeCompat: true },
    serverAssets: [{ baseName: 'docs', dir: fileURLToPath(new URL('../docs', import.meta.url)) }],
    prerender: {
      autoSubfolderIndex: false,
      crawlLinks: true,
      routes: ['/', '/docs', '/playground', '/embed', '/sitemap.xml', '/llms.txt', '/llms-full.txt'],
      failOnError: true
    }
  },

  vite: {
    worker: { format: 'es' }
  },

  compatibilityDate: '2026-05-30',

  components: false
})
