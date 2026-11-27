---
title: AI agents
description: Install the Sinth skill in Claude Code, Codex, Cursor and other coding agents.
---

# AI agents

Coding agents know JavaScript frameworks well but have rarely seen Sinth. The **Sinth skill** teaches them the syntax, the mistakes to avoid and a workflow that checks every change with the compiler.

## Install the skill

Paste this prompt into your agent (Claude Code, Codex, Cursor, Copilot, Windsurf, ...):

```text
Install the Sinth skill: fetch https://sinth.yannosay.com/agents.md and follow its instructions exactly.
```

The agent reads [agents.md](https://sinth.yannosay.com/agents.md), downloads the skill files listed in [manifest.json](https://sinth.yannosay.com/skills/sinth/manifest.json) and installs them:

| Agent | Location |
|---|---|
| Claude Code | `.claude/skills/sinth/` in the project (or `~/.claude/skills/sinth/` for all projects, if you ask for that) |
| Other tools with Agent Skills support | the tool's skills folder |
| Everything else | `.agents/skills/sinth/`, plus a short "Sinth" section in `AGENTS.md` that points to it |

The instructions tell the agent to download only from sinth.yannosay.com, run nothing while installing and ask before it overwrites a different version. It ends with a short summary of where the skill went and what to try.

## What is in the skill

| File | Contents |
|---|---|
| [SKILL.md](https://sinth.yannosay.com/skills/sinth/SKILL.md) | When to use it, the edit → `sinth check --json` → fix loop, a complete example page and the rules that trip people up |
| [references/language.md](https://sinth.yannosay.com/skills/sinth/references/language.md) | Condensed language reference: state, functions, markup, events, loops, forms, components, stores, imports, styles, routing |
| [references/project-and-deploy.md](https://sinth.yannosay.com/skills/sinth/references/project-and-deploy.md) | Project layout (including `app/`), CLI, configuration, every deploy platform and server functions |

Agents load the reference files only when they need them, so the skill stays small in their context.

## Install it by hand

Download the three files above into `.claude/skills/sinth/` (keeping `references/`), or any folder your agent reads. To update, run the prompt again.

## Other resources for language models

- [llms.txt](https://sinth.yannosay.com/llms.txt): an index of the documentation.
- [llms-full.txt](https://sinth.yannosay.com/llms-full.txt): the whole documentation as one file.
- `sinth check --json` prints machine-readable diagnostics (code, message, location and hint) for agents and editors.
