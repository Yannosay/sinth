import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SinthError } from "../compiler/diagnostics";
import { PACKAGE_ROOT } from "../project/project";
import { c } from "./ui";

const SKILL_SOURCE = path.join(PACKAGE_ROOT, "skills", "sinth");
const AGENTS_SECTION = [
  "## Sinth",
  "",
  "This project uses Sinth (.sinth files). Before working on it, read `.agents/skills/sinth/SKILL.md` and follow it. More detail is in `.agents/skills/sinth/references/`.",
  "",
].join("\n");

export interface SkillOptions {
  claude: boolean;
  agents: boolean;
  global: boolean;
}

function copyDir(from: string, to: string): number {
  let count = 0;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dest = path.join(to, e.name);
    if (e.isDirectory()) count += copyDir(src, dest);
    else {
      fs.copyFileSync(src, dest);
      count++;
    }
  }
  return count;
}

/** Adds or replaces the "## Sinth" section of AGENTS.md, which Codex, Cursor, Copilot and others read. */
function writeAgentsSection(file: string): void {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  const start = existing.search(/^## Sinth\s*$/m);
  let next: string;
  if (start === -1) next = (existing.trim() ? existing.replace(/\s*$/, "\n\n") : "# Agent instructions\n\n") + AGENTS_SECTION;
  else {
    const rest = existing.slice(start + 1);
    const end = rest.search(/^## /m);
    next = existing.slice(0, start) + AGENTS_SECTION + (end === -1 ? "" : "\n" + rest.slice(end));
  }
  fs.writeFileSync(file, next);
}

/**
 * Installs the Sinth skill that ships with this package, so it always matches the installed
 * compiler. Returns the lines to print.
 */
export function installSkill(root: string, opts: SkillOptions, version: string): string[] {
  if (!fs.existsSync(path.join(SKILL_SOURCE, "SKILL.md"))) throw new SinthError("E1310", "The Sinth skill is missing from this installation", undefined, "Reinstall @yannosay/sinth");
  const forClaude = opts.global || opts.claude || (!opts.agents && (fs.existsSync(path.join(root, ".claude")) || fs.existsSync(path.join(root, "CLAUDE.md"))));
  const targets: { label: string; dir: string }[] = [];
  if (opts.global) targets.push({ label: "Claude Code (all projects)", dir: path.join(os.homedir(), ".claude", "skills", "sinth") });
  else if (forClaude) targets.push({ label: "Claude Code", dir: path.join(root, ".claude", "skills", "sinth") });
  if (opts.agents || (!forClaude && !opts.global)) targets.push({ label: "AGENTS.md agents (Codex, Cursor, Copilot, Gemini, ...)", dir: path.join(root, ".agents", "skills", "sinth") });

  const out: string[] = [];
  const show = (p: string): string => (p.startsWith(root + path.sep) ? path.relative(root, p) : p.startsWith(os.homedir()) ? "~" + p.slice(os.homedir().length) : p).replace(/\\/g, "/");
  for (const t of targets) {
    copyDir(SKILL_SOURCE, t.dir);
    out.push(`  ${c.green("✓")} ${c.bold(`Sinth skill ${version}`)} installed for ${t.label}`, `    ${c.gray(show(t.dir))}`);
    if (t.dir.includes(`${path.sep}.agents${path.sep}`)) {
      writeAgentsSection(path.join(root, "AGENTS.md"));
      out.push(`    ${c.gray("AGENTS.md points your agent to it")}`);
    }
  }
  out.push(
    "",
    "  Your agent now knows Sinth's syntax and components, checks each change with",
    `  ${c.cyan("sinth check")} and keeps code small by reaching for ${c.cyan("sinth:ui")} first.`,
    "",
    `  ${c.bold("Try asking it")}`,
    `    ${c.gray("›")} Add a contact form with validation to the home page`,
    `    ${c.gray("›")} Build a dashboard page with a sortable table and a settings modal`,
    `    ${c.gray("›")} Deploy this site to Cloudflare`,
    "",
    `  ${c.gray("Run this again after updating Sinth to refresh the skill.")}`,
    "",
  );
  return out;
}
