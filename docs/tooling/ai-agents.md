---
title: AI agents
description: Install the Sinth skill in Claude Code, Codex, Cursor and other coding agents.
---

# AI agents

Coding agents know the big JavaScript frameworks from their training data but have rarely seen Sinth. The **Sinth skill** closes that gap: it teaches an agent the syntax, the component library, the mistakes to avoid and a workflow that checks every change with the compiler.

Sinth suits agents well. A page is one file with markup, state and styles, so an agent reads and edits less code, and `sinth check` catches unknown names, wrong arguments and type errors before anything runs, with a machine-readable hint for each.

## Install the skill

In a project that has Sinth installed:

```bash
npx sinth skill
```

It copies the skill that ships with your Sinth version into `.claude/skills/sinth/` when the project uses Claude Code (a `.claude/` folder or `CLAUDE.md`), and otherwise into `.agents/skills/sinth/` with a short section in `AGENTS.md` that Codex, Cursor, GitHub Copilot, Gemini CLI, Windsurf and other agents read. `--claude` or `--agents` picks the target, `--global` installs it for all your Claude Code projects. Run it again after updating Sinth.

Without a project yet, paste this prompt into your agent instead:

```text
Install the Sinth skill: fetch https://sinth.yannosay.com/agents.md and follow its instructions exactly.
```

The agent reads [agents.md](https://sinth.yannosay.com/agents.md), downloads the files listed in [manifest.json](https://sinth.yannosay.com/skills/sinth/manifest.json) and installs them in the same places. The instructions allow downloads only from sinth.yannosay.com, run nothing while installing, and ask before overwriting a different version.

When it is done, the agent confirms in a few lines what it can now do, for example:

> **Sinth is ready.** I can now build, check and deploy Sinth sites in this project.
>
> Try asking me: "Create a Sinth site with a pricing page and a contact form", "Add a dashboard with a sortable table and a settings modal", "Deploy this site to Cloudflare".

## What the skill changes

- **Checked work.** The agent runs `sinth check --json` after each change and fixes every diagnostic before handing the work back.
- **Lean code.** It reaches for [`sinth:ui`](../components/sinth-ui.md), `computed` values, `model` bindings, `for … else` and stores before writing custom markup, watchers or CSS, so generated code stays small and reviewable.
- **Safe defaults.** Secrets stay in `functions/` (pages only see `PUBLIC_` variables), and the agent deploys, commits or installs tools only when you ask.
- **Short reports.** It tells you what works now, how to see it and what to do next, instead of narrating the commands it ran.

## What is in the skill

| File | Contents |
|---|---|
| [SKILL.md](https://sinth.yannosay.com/skills/sinth/SKILL.md) | When to use it, the edit → check → fix loop, how to write lean Sinth, a complete example page, common mistakes and how to report back |
| [references/language.md](https://sinth.yannosay.com/skills/sinth/references/language.md) | Condensed language reference: state, functions, markup, events, loops, forms, components, stores, imports, styles, routing |
| [references/ui.md](https://sinth.yannosay.com/skills/sinth/references/ui.md) | Every `sinth:ui` component with its parameters |
| [references/project-and-deploy.md](https://sinth.yannosay.com/skills/sinth/references/project-and-deploy.md) | Project layout, CLI, configuration, redirects, environment variables, every deploy platform and server functions |

Agents load the reference files only when they need them, so the skill takes little room in their context.

## Other resources for language models

- [llms.txt](https://sinth.yannosay.com/llms.txt): an index of the documentation, and [llms-full.txt](https://sinth.yannosay.com/llms-full.txt): all of it in one file.
- `sinth check --json` prints machine-readable diagnostics (code, message, location and hint).
- Sites you build get their own `llms.txt` when `site` is set in `sinth.config.json`, so AI assistants can find and cite your pages.
