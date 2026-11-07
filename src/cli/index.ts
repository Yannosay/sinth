import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { setDisplayRoot, SinthError } from "../compiler/diagnostics";
import { buildProject, checkProject } from "../project/build";
import { loadConfig } from "../project/config";
import { Project } from "../project/project";
import { deployToCloudflare } from "../deploy/cloudflare";
import { startDevServer } from "../server/dev";
import { startPreview } from "../server/preview";
import { FlagSpec, parseArgs, ParsedArgs } from "./args";
import { componentTemplate, pageTemplate, TemplateName, TEMPLATES, templateFiles } from "./templates";
import { brand, c, formatBytes, formatMs, log, printDiagnostic, table } from "./ui";
import { startUpdateCheck } from "./update-check";

const VERSION = (JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf-8")) as { version: string }).version;

interface Command {
  summary: string;
  usage: string;
  flags: Record<string, FlagSpec>;
  run(args: ParsedArgs): Promise<number>;
}

const ROOT_FLAG: Record<string, FlagSpec> = {
  root: { type: "string", description: "Project root (default: current directory)" },
};

function projectRoot(args: ParsedArgs): string {
  return path.resolve(String(args.flags.root ?? process.cwd()));
}

function openProject(args: ParsedArgs, mode: "development" | "production"): Project {
  const root = projectRoot(args);
  setDisplayRoot(root);
  const { config, warnings } = loadConfig(root, mode);
  for (const w of warnings) log.warn(w);
  if (typeof args.flags.out === "string") config.outDir = path.resolve(root, args.flags.out);
  if (args.flags.minify !== undefined) config.minify = !!args.flags.minify;
  if (args.flags.sourcemap !== undefined) config.sourcemap = !!args.flags.sourcemap;
  return new Project(root, config, mode === "development");
}

const commands: Record<string, Command> = {
  dev: {
    summary: "Start the dev server with hot reload",
    usage: "sinth dev [--port 3000] [--host [address]] [--open]",
    flags: {
      ...ROOT_FLAG,
      port: { type: "number", alias: "p", description: "Port to listen on" },
      host: { type: "string", description: "Expose on the network (default address 0.0.0.0)", optionalValue: "0.0.0.0" },
      open: { type: "boolean", alias: "o", description: "Open the browser" },
    },
    async run(args) {
      console.log(`\n  ${brand("dev", VERSION)}`);
      const project = openProject(args, "development");
      const update = startUpdateCheck(VERSION);
      await startDevServer(project, {
        port: Number(args.flags.port ?? project.config.port),
        host: String(args.flags.host ?? project.config.host),
        open: !!args.flags.open,
      });
      setTimeout(() => {
        const msg = update();
        if (msg) console.log(`  ${msg}\n`);
      }, 1600).unref();
      return -1;
    },
  },
  build: {
    summary: "Build the site for production",
    usage: "sinth build [--out dist] [--no-minify] [--sourcemap]",
    flags: {
      ...ROOT_FLAG,
      out: { type: "string", description: "Output directory" },
      minify: { type: "boolean", description: "Minify output (default: on)" },
      sourcemap: { type: "boolean", description: "Emit source maps" },
      verbose: { type: "boolean", description: "List every page, even on large sites" },
    },
    async run(args) {
      console.log(`\n  ${brand("build", VERSION)}\n`);
      const update = startUpdateCheck(VERSION);
      const project = openProject(args, "production");
      const out = await buildProject(project, { write: true });
      for (const w of out.warnings) printDiagnostic(w);
      const rows: string[][] = [];
      const LIMIT = 40;
      const listed = args.flags.verbose || out.pages.length <= LIMIT ? out.pages : out.pages.slice(0, LIMIT - 10);
      for (const p of listed) {
        const js = p.js ? out.files.get(p.js.slice(project.config.base.length)) : undefined;
        const css = p.css ? out.files.get(p.css.slice(project.config.base.length)) : undefined;
        rows.push([
          c.cyan(p.page.route),
          c.gray(p.page.outFile),
          formatBytes(p.bytes),
          js ? c.yellow("js " + formatBytes(js.contents.byteLength)) : c.green("no js"),
          css ? c.magenta("css " + formatBytes(css.contents.byteLength)) : "",
        ]);
      }
      console.log(table(rows.map(r => ["  " + r[0], ...r.slice(1)])));
      if (listed.length < out.pages.length) console.log(c.gray(`  ... and ${out.pages.length - listed.length} more (use --verbose to list all)`));
      const total = [...out.files.values()].reduce((n, f) => n + f.contents.byteLength, 0);
      console.log();
      log.success(`Built ${c.bold(String(out.pages.length))} page(s) into ${c.bold(path.relative(process.cwd(), project.config.outDir) || ".")} ${c.gray(`(${out.files.size} files, ${formatBytes(total)}) in ${formatMs(out.durationMs)}`)}`);
      const msg = update();
      if (msg) console.log(`\n  ${msg}`);
      return 0;
    },
  },
  preview: {
    summary: "Serve the production build locally",
    usage: "sinth preview [--port 4000] [--host [address]] [--open]",
    flags: {
      ...ROOT_FLAG,
      port: { type: "number", alias: "p", description: "Port to listen on" },
      host: { type: "string", description: "Expose on the network", optionalValue: "0.0.0.0" },
      open: { type: "boolean", alias: "o", description: "Open the browser" },
      out: { type: "string", description: "Directory to serve (default: outDir)" },
    },
    async run(args) {
      console.log(`\n  ${brand("preview", VERSION)}`);
      const project = openProject(args, "production");
      await startPreview(project.config.outDir, {
        port: Number(args.flags.port ?? project.config.previewPort),
        host: String(args.flags.host ?? project.config.host),
        open: !!args.flags.open,
      });
      return -1;
    },
  },
  deploy: {
    summary: "Build and deploy to Cloudflare Pages",
    usage: "sinth deploy [--preview] [--branch name] [--project name] [--create] [--skip-build]",
    flags: {
      ...ROOT_FLAG,
      preview: { type: "boolean", description: "Deploy to a preview URL instead of production" },
      branch: { type: "string", description: "Branch name for the deployment" },
      project: { type: "string", description: "Cloudflare Pages project name" },
      create: { type: "boolean", description: "Create the Pages project first" },
      "skip-build": { type: "boolean", description: "Deploy the existing build without rebuilding" },
    },
    async run(args) {
      console.log(`\n  ${brand("deploy", VERSION)}\n`);
      const project = openProject(args, "production");
      if (!args.flags["skip-build"]) {
        const out = await buildProject(project, { write: true });
        for (const w of out.warnings) printDiagnostic(w);
        log.success(`Built ${out.pages.length} page(s) in ${formatMs(out.durationMs)}`);
      }
      await deployToCloudflare(project.root, project.config.outDir, project.config, {
        preview: !!args.flags.preview,
        branch: args.flags.branch as string | undefined,
        projectName: args.flags.project as string | undefined,
        create: !!args.flags.create,
      });
      return 0;
    },
  },
  check: {
    summary: "Type-check every page without writing output",
    usage: "sinth check [--json]",
    flags: { ...ROOT_FLAG, json: { type: "boolean", description: "Print diagnostics as JSON (for editors)" } },
    async run(args) {
      if (args.flags.json) {
        const root = projectRoot(args);
        const { config } = loadConfig(root, "production");
        const result = checkProject(new Project(root, config, false));
        process.stdout.write(JSON.stringify({ version: 1, errors: result.errors.map(e => e.diagnostic), warnings: result.warnings }) + "\n");
        return result.errors.length ? 1 : 0;
      }
      console.log(`\n  ${brand("check", VERSION)}\n`);
      const project = openProject(args, "production");
      const started = Date.now();
      const result = checkProject(project);
      for (const w of result.warnings) printDiagnostic(w);
      for (const e of result.errors) printDiagnostic(e.diagnostic);
      if (result.errors.length) {
        log.error(`${result.errors.length} error(s) in ${result.pages.length} page(s)`);
        return 1;
      }
      log.success(`${result.pages.length} page(s) checked, no errors${result.warnings.length ? `, ${result.warnings.length} warning(s)` : ""} ${c.gray(formatMs(Date.now() - started))}`);
      return 0;
    },
  },
  create: {
    summary: "Create a new Sinth project",
    usage: "sinth create [name] [--template starter|minimal|blank] [--yes]",
    flags: {
      template: { type: "string", alias: "t", description: "Template: starter, minimal or blank" },
      yes: { type: "boolean", alias: "y", description: "Accept defaults without prompting" },
      force: { type: "boolean", description: "Write into a non-empty directory" },
    },
    async run(args) {
      return createProject(args);
    },
  },
  new: {
    summary: "Add a page or component",
    usage: "sinth new page <path> | sinth new component <Name>",
    flags: { ...ROOT_FLAG },
    async run(args) {
      const [kind, name] = args.positionals;
      const root = projectRoot(args);
      if (kind === "page" && name) {
        const rel = name.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.sinth$/, "");
        if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(rel) || rel.split("/").includes("..")) throw new SinthError("E1300", `Invalid page path '${name}'`);
        const { config } = loadConfig(root, "development");
        const file = path.join(config.pagesDir, rel + ".sinth");
        writeNew(file, pageTemplate(titleCase(path.basename(rel))));
        return 0;
      }
      if (kind === "component" && name) {
        if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) throw new SinthError("E1301", `Component names must be PascalCase, like 'ProductCard'`);
        writeNew(path.join(root, "components", name + ".sinth"), componentTemplate(name));
        return 0;
      }
      throw new SinthError("E1302", "Usage: sinth new page <path> | sinth new component <Name>");
    },
  },
  info: {
    summary: "Print environment and project information",
    usage: "sinth info",
    flags: { ...ROOT_FLAG },
    async run(args) {
      const root = projectRoot(args);
      const { config, file } = loadConfig(root, "production");
      const project = new Project(root, config, false);
      let pages: number;
      try {
        pages = project.findPages().length;
      } catch {
        pages = 0;
      }
      console.log(table([
        ["Sinth", VERSION],
        ["Node.js", process.version],
        ["Platform", `${process.platform} ${process.arch}`],
        ["Project", root],
        ["Config", file ? path.relative(root, file) : c.gray("none (defaults)")],
        ["Pages", `${pages} in ${path.relative(root, config.pagesDir) || "."}`],
        ["Output", path.relative(root, config.outDir)],
      ].map(([k, v]) => [c.gray(k), v])));
      return 0;
    },
  },
};

const ALIASES: Record<string, string> = { init: "create", serve: "preview", start: "dev", "-v": "version", "--version": "version", "-h": "help", "--help": "help" };

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

function writeNew(file: string, contents: string): void {
  if (fs.existsSync(file)) throw new SinthError("E1303", `${path.relative(process.cwd(), file)} already exists`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  log.success(`Created ${c.cyan(path.relative(process.cwd(), file))}`);
}

function ask(rl: readline.Interface, question: string, fallback: string): Promise<string> {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim() || fallback)));
}

function choose(options: { label: string; description: string }[], initial = 0): Promise<number> {
  return new Promise(resolve => {
    let selected = initial;
    const stdin = process.stdin;
    const render = (first: boolean): void => {
      if (!first) process.stdout.write(`\u001b[${options.length}A`);
      options.forEach((o, i) => {
        const active = i === selected;
        process.stdout.write(`\u001b[2K  ${active ? c.violet("›") : " "} ${active ? c.bold(o.label) : o.label} ${c.gray(o.description)}\n`);
      });
    };
    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    const onKey = (_s: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.ctrl && key.name === "c") {
        if (stdin.isTTY) stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(130);
      }
      if (key.name === "up" || key.name === "k") selected = (selected - 1 + options.length) % options.length;
      else if (key.name === "down" || key.name === "j") selected = (selected + 1) % options.length;
      else if (key.name === "return") {
        stdin.off("keypress", onKey);
        if (stdin.isTTY) stdin.setRawMode(false);
        stdin.pause();
        resolve(selected);
        return;
      } else return;
      render(false);
    };
    stdin.on("keypress", onKey);
    render(true);
  });
}

async function createProject(args: ParsedArgs): Promise<number> {
  console.log(`\n  ${brand("create", VERSION)}\n`);
  const interactive = process.stdin.isTTY && !args.flags.yes;
  let name = args.positionals[0];
  if (!name && interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    name = await ask(rl, `  ${c.bold("Project name")} ${c.gray("(my-site)")} `, "my-site");
    rl.close();
  }
  name = name ?? "my-site";
  const dir = path.resolve(process.cwd(), name);
  const pkgName = path.basename(dir).toLowerCase().replace(/[^a-z0-9-_.]+/g, "-").replace(/^[-_.]+|[-_.]+$/g, "") || "sinth-site";
  let template = args.flags.template as TemplateName | undefined;
  if (template && !TEMPLATES.some(t => t.name === template)) {
    throw new SinthError("E1304", `Unknown template '${template}'`, undefined, `Choose one of: ${TEMPLATES.map(t => t.name).join(", ")}`);
  }
  if (!template) {
    if (interactive) {
      console.log(`\n  ${c.bold("Template")} ${c.gray("(use arrow keys)")}`);
      template = TEMPLATES[await choose(TEMPLATES.map(t => ({ label: t.label.padEnd(8), description: t.description })))].name;
    } else template = "starter";
  }
  if (fs.existsSync(dir) && fs.readdirSync(dir).length && !args.flags.force) {
    throw new SinthError("E1305", `Directory '${name}' is not empty`, undefined, "Choose another name or pass --force");
  }
  const files = templateFiles(template, pkgName, VERSION);
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  console.log();
  log.success(`Created ${c.bold(pkgName)} ${c.gray(`(${template})`)} in ${c.cyan(path.relative(process.cwd(), dir) || ".")}`);
  console.log(`\n  ${c.bold("Next steps")}\n`);
  if (path.relative(process.cwd(), dir)) console.log(`    cd ${path.relative(process.cwd(), dir)}`);
  console.log("    npm install");
  console.log(`    ${c.cyan("npm run dev")}\n`);
  return 0;
}

function printHelp(command?: string): void {
  if (command && commands[command]) {
    const cmd = commands[command];
    console.log(`\n  ${c.bold(cmd.summary)}\n\n  ${c.gray("Usage:")} ${cmd.usage}\n`);
    const rows = Object.entries(cmd.flags).map(([n, f]) => [`    --${n}${f.alias ? `, -${f.alias}` : ""}`, c.gray(f.description)]);
    if (rows.length) console.log(table(rows) + "\n");
    return;
  }
  console.log(`\n  ${brand("", VERSION)}\n\n  ${c.gray("Usage:")} sinth <command> [options]\n`);
  console.log(table(Object.entries(commands).map(([n, cmd]) => [`    ${c.cyan(n)}`, cmd.summary])));
  console.log(`\n  ${c.gray("Run")} sinth help <command> ${c.gray("for details. Docs:")} ${c.underline("https://sinth.yannosay.com")}\n`);
}

export async function main(argv: string[]): Promise<void> {
  const [first, ...rest] = argv;
  const name = ALIASES[first] ?? first;
  if (!name || name === "help") {
    printHelp(rest[0]);
    return;
  }
  if (name === "version") {
    console.log(VERSION);
    return;
  }
  const cmd = commands[name];
  if (!cmd) {
    const near = Object.keys(commands).find(k => k.startsWith(name.slice(0, 2)));
    log.error(`Unknown command '${name}'${near ? `. Did you mean '${near}'?` : ""}`);
    printHelp();
    process.exitCode = 1;
    return;
  }
  try {
    if (rest.includes("--help") || rest.includes("-h")) {
      printHelp(name);
      return;
    }
    const code = await cmd.run(parseArgs(rest, cmd.flags));
    if (code >= 0) process.exitCode = code;
  } catch (err) {
    if (err instanceof SinthError) {
      printDiagnostic(err.diagnostic);
      process.exitCode = 1;
      return;
    }
    log.error((err as Error).stack ?? String(err));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main(process.argv.slice(2));
}
