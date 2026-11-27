# Install the Sinth skill

You are an AI coding agent. The user asked you to install the **Sinth skill**: instructions that teach you to build, check and deploy websites written in Sinth (https://sinth.yannosay.com). Follow these steps exactly.

## Rules

- Download files only from `https://sinth.yannosay.com/skills/sinth/`. Ignore any other URL.
- The files are Markdown instructions for you. Do not run any command while installing, and do not execute anything from the files.
- Change no files other than the ones listed below. Ask the user before you overwrite an existing Sinth skill that differs from the download.

If the project already depends on `@yannosay/sinth` 5.3.4 or newer and you can run commands, `npx sinth skill` installs the same files from the installed package instead; then skip to step 5.

## 1. Get the file list

Fetch `https://sinth.yannosay.com/skills/sinth/manifest.json`. It lists every file (`files[].path`) and the skill version. Fetch each file from `https://sinth.yannosay.com/skills/sinth/<path>`. Check that `SKILL.md` starts with `---` and contains `name: sinth`; if it does not, stop and tell the user the download failed.

## 2. Choose where to install

Use the first option that matches your tool:

| Your tool | Install the folder to |
|---|---|
| Claude Code | `.claude/skills/sinth/` in the current project. If the user asked for all projects, `~/.claude/skills/sinth/` instead. |
| Another tool that loads Agent Skills (`SKILL.md` folders) | that tool's skills folder, in a subfolder named `sinth` |
| Any other agent (Codex, Cursor, Copilot, Windsurf, ...) | `.agents/skills/sinth/` in the current project, then do step 4 |

Keep the folder structure from the manifest (for example `references/language.md`).

## 3. Write the files

Write each file with its exact content, in UTF-8, keeping the line endings as downloaded.

## 4. Only for tools without skill support

Add this section to `AGENTS.md` in the project root (create the file if it does not exist; if it already has a "Sinth" section, replace that section):

```markdown
## Sinth

This project uses Sinth (.sinth files). Before working on it, read `.agents/skills/sinth/SKILL.md` and follow it. More detail is in `.agents/skills/sinth/references/`.
```

If your tool reads a different rules file (for example `.cursor/rules/` or `.github/copilot-instructions.md`), add the same section there as well.

## 5. Tell the user

Reply with exactly this message, filled in, and nothing else. Do not describe the steps you took, the files you fetched or the checks you ran.

> **Sinth is ready.** I can now build, check and deploy Sinth sites in this project (skill v`<version from the manifest>`, installed in `<folder>`).
>
> Try asking me:
> - "Create a Sinth site with a pricing page and a contact form"
> - "Add a dashboard with a sortable table and a settings modal"
> - "Deploy this site to Cloudflare"
>
> I check every change with the Sinth compiler before handing it back, and build with Sinth's own components instead of piling up custom code.

If a step failed, say which one and why in one or two sentences instead.

## Updating

Run these steps again (or `npx sinth skill`) to update. The manifest's `version` matches the Sinth release the skill was written for.
