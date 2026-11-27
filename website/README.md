# Sinth website

The source of [sinth.yannosay.com](https://sinth.yannosay.com): the landing page, the documentation and the playground.

- Nuxt 4 with the Cloudflare Pages preset; every page is prerendered at build time.
- Documentation is read from [`../docs`](../docs) and bundled as server assets, so the site always matches the compiler in this repository.
- The playground runs the browser build of the compiler (`../dist/browser/sinth.js`) in a Web Worker and previews pages in a sandboxed iframe with the real Sinth runtime.
- `/llms.txt` and `/llms-full.txt` expose the documentation to language models; `/sitemap.xml` lists every page.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000 (run `npm run build` in the repository root once first)
npm run build      # builds the compiler, then the site into dist/
npm run deploy     # builds and deploys to Cloudflare Pages (project "sinth")
```

## Structure

```
app/
  components/docs/        sidebar, search, table of contents, pager
  components/playground/  playground UI and CodeMirror editor
  playground/             compiler worker, preview runner, Sinth editor mode, examples, share links
  pages/                  /, /docs, /docs/[section]/[page], /playground, /embed
server/
  api/content/            documentation pages as JSON
  routes/                 sitemap.xml, llms.txt, llms-full.txt
  utils/                  content loading, Markdown rendering, Sinth highlighting
```
