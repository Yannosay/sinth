---
title: The CLI
description: Every sinth command and option.
---

# The CLI

```
sinth create [name] [--template starter|minimal|blank] [--yes] [--force]
sinth dev     [--port 3000] [--host [address]] [--open]
sinth build   [--out dist] [--platform name] [--no-minify] [--sourcemap]
sinth preview [--port 4000] [--host [address]] [--open]
sinth deploy  [--platform name] [--preview] [--branch name] [--project name] [--create] [--skip-build]
sinth check   [--json] [--max-warnings n]
sinth skill   [--claude | --agents] [--global]
sinth new page <path> | sinth new component <Name>
sinth info
sinth version
sinth help [command]
```

Every command accepts `--root <dir>` to run against another folder. Aliases: `init` = `create`, `start` = `dev`, `serve` = `preview`.

| Command | What it does |
|---|---|
| `create` | Scaffolds a project. Templates: `starter` (layout, two pages, 404, sinth:ui), `minimal` (one page), `blank` (config only). |
| `dev` | Dev server with hot reload, state preservation and an error overlay. |
| `build` | Production build: prerendering, minification, code splitting, hashed assets, headers, redirects, sitemap and `llms.txt`, plus the files the `platform` needs. `--platform` overrides the config. |
| `preview` | Serves the build with clean URLs, `_headers` and `404.html`, like Cloudflare Pages. |
| `deploy` | Builds and deploys to the configured `platform`: Cloudflare Pages or Workers (Wrangler), Vercel or Netlify (their CLIs, run with npx). |
| `check` | Type-checks every page and module without writing files. `--json` prints machine-readable diagnostics. `--max-warnings 0` fails on any warning, for CI. |
| `skill` | Installs the [Sinth skill](./ai-agents.md) for your AI coding agent from the installed package, so it always matches your Sinth version. Claude Code when the project has `.claude/` or `CLAUDE.md`, otherwise `.agents/skills/sinth` plus a section in `AGENTS.md`. |
| `new` | Creates a page (`sinth new page blog/first-post`) or component (`sinth new component ProductCard`). |
| `info` | Prints versions and project settings, useful for bug reports. |

The CLI checks for updates at most once a day (never in CI). Disable with `SINTH_NO_UPDATE_CHECK=1`. Disable colors with `NO_COLOR=1`.
