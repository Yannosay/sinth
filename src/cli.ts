import * as fs from "fs";
import * as path from "path";
import { SinthWarning } from "./core/types";
import { compileFile, CompileOptions, findSinthPages, copyDir } from "./core/cli-compiler";
import { startDevServer } from "./server";
import { previewBuild } from "./preview";
import { deployToCloudflare } from "./deploy";
import * as readline from "readline";
import { checkForUpdate } from "./update-check";

interface SinthConfig {
  outDir?: string;
  libraryPaths?: string[];
  staticDirs?: string[];
  minify?: boolean;
  sharedRuntime?: boolean;
  inlineJS?: boolean;
  inlineCSS?: boolean;
  port?: number;
  cloudflare?: {
    accountId?: string;
    projectName?: string;
    productionBranch?: string;
    compatibilityDate?: string;
    compatibilityFlags?: string[];
    kvNamespaces?: { binding: string; id: string }[];
    d1Databases?: { binding: string; name: string }[];
    r2Buckets?: { binding: string; bucketName: string }[];
  };
  development?: Partial<Omit<SinthConfig, "development" | "cloudflare">>;
  production?: Partial<Omit<SinthConfig, "development" | "cloudflare">>;
}

const COLORS = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  underline: "\u001b[4m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
};

const ICONS = {
  success: "✓",
  error: "✗",
  warning: "⚠",
  info: "ℹ",
  arrow: "→",
  bullet: "•",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
};

function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function underline(text: string): string {
  return `${COLORS.underline}${text}${COLORS.reset}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function loadConfig(root: string): SinthConfig {
  const cfgPath = path.join(root, "sinth.config.json");
  if (fs.existsSync(cfgPath)) {
    try { return JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as SinthConfig; }
    catch (e) {
      SinthWarning.emit("Could not parse sinth.config.json. Make sure it contains valid JSON.", { file: cfgPath, line: 0, col: 0 });
      console.error(e);
    }
  }
  return {};
}

function mergeConfig(base: SinthConfig, env: "development" | "production"): SinthConfig {
  const envConfig = base[env] || {};
  return { ...base, ...envConfig, [env]: undefined };
}

function printHeader(title: string): void {
  const width = process.stdout.columns || 80;
  const line = "═".repeat(Math.min(width - 4, 60));
  console.log(colorize(`╔${line}╗`, "cyan"));
  console.log(colorize(`║ ${title.padEnd(line.length - 2)} ║`, "cyan"));
  console.log(colorize(`╚${line}╝`, "cyan"));
}

function printStep(step: string, total: number, current: number): void {
  const prefix = colorize(`[${current}/${total}]`, "gray");
  console.log(`${prefix} ${step}`);
}

function printSuccess(message: string): void {
  console.log(`  ${colorize(ICONS.success, "green")} ${message}`);
}

function printError(message: string): void {
  console.log(`  ${colorize(ICONS.error, "red")} ${message}`);
}

function printWarning(message: string): void {
  console.log(`  ${colorize(ICONS.warning, "yellow")} ${message}`);
}

function printInfo(message: string): void {
  console.log(`  ${colorize(ICONS.info, "blue")} ${message}`);
}

async function main(): Promise<void> {
  const [,, command, ...args] = process.argv;
  const cwd = process.cwd();
  const isProd = command === "build" && args.includes("--prod");
  const baseConfig = loadConfig(cwd);
  const cfg = isProd ? mergeConfig(baseConfig, "production") : mergeConfig(baseConfig, "development");

  const outDirIdx    = args.indexOf("--out");
  const outDir       = outDirIdx !== -1 ? args[outDirIdx + 1] : cfg.outDir ?? path.join(cwd, "dist");
  const portIdx      = args.indexOf("--port");
  const port         = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : cfg.port ?? 3000;
  const minify       = args.includes("--prod") || Boolean(cfg.minify);
  const sharedRuntime = args.includes("--shared-runtime") || Boolean(cfg.sharedRuntime);
  const inlineJS      = args.includes("--inline-js") || Boolean(cfg.inlineJS);
  const inlineCSS     = args.includes("--inline-css") || Boolean(cfg.inlineCSS);
  const libraryPaths = cfg.libraryPaths ?? [path.join(cwd, "libraries")];
  const staticDirs   = cfg.staticDirs ?? ["assets"];

  const flagValues = new Set<string>();
  if (outDirIdx !== -1) flagValues.add(args[outDirIdx + 1]);
  if (portIdx   !== -1) flagValues.add(args[portIdx + 1]);
  const cleanArgs = args.filter(a => !a.startsWith("--") && !flagValues.has(a));

  const opts: CompileOptions = { projectRoot: cwd, outDir, libraryPaths, staticDirs, minify, checkOnly: false, sharedRuntime, inlineJS, inlineCSS };

  const pkgPath = path.join(__dirname, "..", "package.json");
  const pkgVersion = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version : "0.0.0";

  switch (command) {
    case "build": {
      printHeader(`Sinth Build v${pkgVersion}`);
      const buildStart = Date.now();
      
      checkForUpdate(pkgVersion);

      const nonSinth = cleanArgs.filter(a => !a.endsWith(".sinth"));
      if (nonSinth.length > 0) printWarning(`Skipping non-.sinth files: ${nonSinth.join(", ")}`);

      const fileArgs = cleanArgs.filter(a => a.endsWith(".sinth"));
      const pages = fileArgs.length > 0
        ? fileArgs.map(f => path.resolve(cwd, f)).filter(f => fs.existsSync(f))
        : findSinthPages(cwd, outDir, libraryPaths);

      if (pages.length === 0) { printInfo("No .sinth files found."); process.exit(0); }

      printStep(`Found ${pages.length} page(s)`, pages.length, 0);
      console.log();

      let hadError = false, built = 0;
      const sharedRuntimes: string[] = [];
      const compiledJsDir = path.join(outDir, "_sinth", "js");
      const compiledCssDir = path.join(outDir, "_sinth", "styles");

      if (!opts.checkOnly) {
        fs.rmSync(compiledJsDir, { recursive: true, force: true });
        fs.rmSync(compiledCssDir, { recursive: true, force: true });
      }

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        printStep(`Compiling ${path.relative(cwd, p)}`, pages.length, i + 1);
        
        try {
          const result = compileFile(p, opts);
          if (!result) continue;
          
          if (result.shared) sharedRuntimes.push(result.shared);
          if (result.jsFile) {
            fs.mkdirSync(compiledJsDir, { recursive: true });
            fs.writeFileSync(path.join(compiledJsDir, result.jsFile.filename), result.jsFile.content);
          }
          if (result.cssFile) {
            fs.mkdirSync(compiledCssDir, { recursive: true });
            fs.writeFileSync(path.join(compiledCssDir, result.cssFile.filename), result.cssFile.content);
          }
          if (result.copiedAssets) {
            for (const asset of result.copiedAssets) {
              fs.mkdirSync(path.dirname(asset.dest), { recursive: true });
              fs.copyFileSync(asset.src, asset.dest);
            }
          }
          
          const rel = path.relative(cwd, p).replace(/\.sinth$/, ".html");
          const out = path.join(outDir, rel);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, result.html);
          
          printSuccess(`${rel} ${colorize(formatBytes(Buffer.byteLength(result.html, "utf8")), "gray")}`);
          built++;
        } catch (e: unknown) {
          printError(`${path.relative(cwd, p)}`);
          console.log(`    ${(e as Error).message}`);
          hadError = true;
        }
      }

      if (sharedRuntimes.length > 0) {
        const combined = sharedRuntimes.join("\n");
        fs.writeFileSync(path.join(outDir, "sinth-runtime.js"), combined);
        printSuccess(`sinth-runtime.js (shared) ${colorize(formatBytes(Buffer.byteLength(combined, "utf8")), "gray")}`);
      }

      for (const dir of staticDirs) {
        const staticIn = path.isAbsolute(dir) ? dir : path.join(cwd, dir);
        const staticOut = path.isAbsolute(dir) ? path.join(outDir, path.basename(dir)) : path.join(outDir, dir);
        if (fs.existsSync(staticIn)) {
          copyDir(staticIn, staticOut);
          printSuccess(`${dir}/ → ${path.relative(cwd, staticOut)}/`);
        }
      }

      const libIn = path.join(cwd, "libraries"), libOut = path.join(outDir, "libraries");
      if (fs.existsSync(libIn)) {
        copyDir(libIn, libOut);
        const libFiles = fs.readdirSync(libOut, { recursive: true }) as string[];
        for (const f of libFiles) {
          if (f.endsWith(".sinth") || f.endsWith(".html")) {
            try { fs.unlinkSync(path.join(libOut, f)); } catch { /* ignore */ }
          }
        }
        printSuccess(`libraries/ → ${path.relative(cwd, libOut)}/`);
      }

      const buildTime = Date.now() - buildStart;
      console.log();
      console.log(`${colorize(ICONS.success, "green")} Built ${colorize(String(built), "bold")} page(s)${hadError ? colorize(" with errors", "red") : ""} in ${colorize(formatDuration(buildTime), "bold")}`);
      process.exit(hadError ? 1 : 0);
    }
    // break; // process.exit exits function

    // eslint-disable-next-line no-fallthrough
    case "dev": {
      printHeader(`Sinth Dev Server v${pkgVersion}`);
      checkForUpdate(pkgVersion);
      
      const fileArgs = cleanArgs.filter(a => a.endsWith(".sinth"));
      const files = fileArgs.length > 0
        ? fileArgs.map(f => path.resolve(cwd, f)).filter(f => fs.existsSync(f))
        : undefined;
      
      printInfo(`Starting dev server on ${colorize(`http://localhost:${port}`, "cyan")}`);
      if (files) printInfo(`Watching ${files.length} file(s)`);
      
      await startDevServer({ ...opts, port, files });
      return;
    }
    // break; // return exits function

    case "check": {
      printHeader(`Sinth Type Check v${pkgVersion}`);
      const pages = findSinthPages(cwd, outDir, libraryPaths);
      let hadError = false;
      
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        printStep(`Checking ${path.relative(cwd, p)}`, pages.length, i + 1);
        try {
          compileFile(p, { ...opts, checkOnly: true });
          printSuccess(path.relative(cwd, p));
        } catch (e: unknown) {
          printError(`${path.relative(cwd, p)}`);
          console.log(`    ${(e as Error).message}`);
          hadError = true;
        }
      }
      process.exit(hadError ? 1 : 0);
    }
    // break; // process.exit exits

    // eslint-disable-next-line no-fallthrough
    case "preview": {
      printHeader(`Sinth Preview v${pkgVersion}`);
      checkForUpdate(pkgVersion);
      const previewPort = portIdx !== -1 ? port : 4000;
      printInfo(`Previewing build output at ${colorize(`http://localhost:${previewPort}`, "cyan")}`);
      await previewBuild({ ...opts, port: previewPort });
      return;
    }
    // break; // return exits

    case "deploy": {
      printHeader(`Sinth Deploy v${pkgVersion}`);
      checkForUpdate(pkgVersion);
      await deployToCloudflare({ ...opts, port });
      return;
    }
    // break; // return exits

    case "init": {
      await interactiveInit(cwd, pkgVersion);
      return;
    }

    case "version":
    case "--version":
    case "-v": { // fallthrough intended
      console.log(`${colorize("Sinth Compiler", "bold")} v${pkgVersion}`);
      checkForUpdate(pkgVersion);
      return;
    }

    default: {
      console.log(`
${colorize("Sinth Compiler", "bold")} v${pkgVersion}

${colorize("Commands:", "bold")}
  ${colorize("sinth build", "cyan")}    [files] [--out ./dist]       Compile .sinth pages
                  [--prod] [--shared-runtime] 
                  [--inline-js] [--inline-css]
  ${colorize("sinth dev", "cyan")}     [files] [--port 3000]        Live-reload dev server with HMR
  ${colorize("sinth preview", "cyan")}  [--port 4000]               Preview built output
  ${colorize("sinth deploy", "cyan")}   [--out ./dist]             Deploy to Cloudflare Pages
  ${colorize("sinth check", "cyan")}                                    Lint without emitting
  ${colorize("sinth init", "cyan")}    [name] [--preset <name>]     Scaffold a new project
  ${colorize("sinth version", "cyan")}                                 Print version

${colorize("Config:", "bold")}
  ${colorize("sinth.config.json", "cyan")} - Project configuration (optional)
  ${colorize("Environment configs:", "dim")} development / production overrides

${colorize("Examples:", "bold")}
  sinth build --prod                    # Production build
  sinth dev                             # Start dev server with HMR
  sinth init my-app --preset full       # Scaffold full project
`);
      return;
    }
  }
}

type Preset = "basic" | "full" | "blank";

const PRESETS: { value: Preset; label: string; description: string }[] = [
  { value: "basic", label: "Basic", description: "Single page + component" },
  { value: "full", label: "Full", description: "Multi-page, components, SCSS demo" },
  { value: "blank", label: "Blank", description: "Folders + config only" },
];

async function interactiveInit(cwd: string, version: string): Promise<void> {
  printHeader("Sinth Project Setup");
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    escapeCodeTimeout: 50,
  });

  const rawName = await question(rl, `${colorize("Project name:", "cyan")} `, "my-sinth-project");
  const projectName = rawName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const preset = await selectPreset(rl);
  rl.close();

  const root = path.resolve(cwd, projectName);
  const start = Date.now();
  scaffoldByPreset(root, projectName, preset, version);
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log();
  console.log(`${colorize(ICONS.success, "green")} ${colorize("Success!", "bold")}`);
  console.log();
  console.log(`  ${colorize("Project name:", "cyan")}  ${projectName}`);
  console.log(`  ${colorize("Preset:", "cyan")} ${preset}`);
  console.log(`  ${colorize(ICONS.success, "green")} ${projectName} scaffolded at ${underline(projectName + "/")} in ${elapsed}s`);
  console.log();
  console.log(`  ${colorize("Get started:", "bold")}`);
  console.log(`    cd ${projectName}`);
  console.log(`    ${colorize("sinth dev", "cyan")} to start dev server`);
}

function question(_rl: readline.Interface, prompt: string, defaultVal: string): Promise<string> {
  return new Promise((resolve) => {
    _rl.question(prompt, (answer) => resolve(answer.trim() || defaultVal));
  });
}

async function selectPreset(_rl: readline.Interface): Promise<Preset> {
  return new Promise((resolve) => {
    let selected = 1;
    const items = PRESETS;

    const render = (first = false) => {
      if (!first) process.stdout.write(`\u001b[${items.length + 1}A`);
      console.log(`\n  ${colorize("Select preset:", "yellow")}`);
      for (let i = 0; i < items.length; i++) {
        const pointer = i === selected ? colorize("❯", "cyan") : " ";
        const label = i === selected ? colorize(items[i].label, "bold") : items[i].label;
        const desc = colorize(`- ${items[i].description}`, "gray");
        console.log(`  ${pointer} ${label} ${desc}`);
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (key: Buffer) => {
      const str = key.toString();
      if (str === "\u001b[A") { selected = (selected - 1 + items.length) % items.length; render(); }
      else if (str === "\u001b[B") { selected = (selected + 1) % items.length; render(); }
      else if (str === "\r" || str === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.removeAllListeners("data");
        process.stdin.pause();
        console.log(`\u001b[${items.length + 1}A\u001b[0J`);
        resolve(items[selected].value);
      } else if (str === "\u0003") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(0);
      }
    };

    process.stdin.on("data", onData);
    render(true);
  });
}

function scaffoldByPreset(root: string, name: string, preset: Preset, version: string): void {
  const dirs = ["pages", "components", "styles", "libraries", "assets"];
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });

  const config: SinthConfig = {
    outDir: "./dist",
    libraryPaths: ["./libraries"],
    minify: false,
    sharedRuntime: false,
  };
  fs.writeFileSync(path.join(root, "sinth.config.json"), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(root, ".gitignore"), "dist/\nnode_modules/\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: name.toLowerCase().replace(/\s+/g, "-"),
    version: "1.0.0",
    scripts: { build: "sinth build", dev: "sinth dev", preview: "sinth preview" },
    dependencies: { "sass": "^1.70.0" },
  }, null, 2));

  if (preset === "blank") return;

  fs.writeFileSync(path.join(root, "styles", "reset.css"),
    `*, *::before, *::after { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; line-height: 1.6; }\nimg { max-width: 100%; display: block; }\n`
  );

  fs.writeFileSync(path.join(root, "components", "Navbar.sinth"), `-- Navbar component

component Navbar {
  Header {
    Nav {
      Link(href: "/", class: "logo") { "MySite" }
      Div(class: "nav-links") {
        NavLink(href: "/")       { "Home" }
        NavLink(href: "/about")  { "About" }
      }
    }
  }

  style {
    header {
      display: "flex"
      alignItems: "center"
      padding: "1rem 2rem"
      backgroundColor: "#1a1a2e"
      color: "white"
    }
    .logo {
      fontSize: "1.5rem"
      fontWeight: "700"
      color: "white"
      textDecoration: "none"
    }
    .nav-links {
      marginLeft: "auto"
      display: "flex"
      gap: "1.5rem"
    }
    .nav-links a {
      color: "rgba(255,255,255,0.8)"
      textDecoration: "none"
    }
  }
}
`);

  if (preset === "basic") {
    fs.writeFileSync(path.join(root, "pages", "index.sinth"), `-- My Sinth Site
page

import "../components/Navbar.sinth"
import css "../styles/reset.css"

title = "My Site"
fav   = "assets/favicon.ico"
descr = "Built with Sinth."

Navbar

Main {
  Heading(level: 1) { "Hello, Sinth!" }
  Paragraph { "Edit pages/index.sinth to get started." }
}
`);
    return;
  }

  fs.writeFileSync(path.join(root, "pages", "index.sinth"), `-- My Sinth Site
page

import "../components/Navbar.sinth"
import css "../styles/reset.css"

title = "My Site"
fav   = "assets/favicon.ico"
descr = "Built with Sinth v${version}."

var num score = 0
var str message = "Click to begin"

Navbar

Hero {
  Heading(level: 1) { "Welcome to Sinth" }
  Paragraph { "A declarative, component-based web UI language." }
  Button(onClick: "handleClick") { "Get Started" }
  Paragraph(id: "score-display") { message }
}

Main {
  Section {
    Heading(level: 2) { "Features" }
    CardGrid {
      -- Add Card components here
    }
  }
}

style {
  section.hero {
    padding: "4rem 2rem"
    textAlign: "center"
    backgroundColor: "#f0f4ff"
  }
  main {
    maxWidth: "1100px"
    margin: "0 auto"
    padding: "2rem"
  }
}

script {
  function handleClick() {
    score += 1
    message = "Score: " + score
    sinthRender()
  }
}
`);

  fs.writeFileSync(path.join(root, "components", "Card.sinth"), `-- Card component

component Card(title, color = "blue") {
  Div(class: "card") {
    Heading(level: 3) { title }
    Div(class: "card-body") { $slot }
  }

  style {
    .card {
      backgroundColor: "#f7f7f7"
      borderRadius: "1rem"
      padding: "1.5rem"
      marginBottom: "1rem"
    }
    .card:hover {
      boxShadow: "0 4px 16px rgba(0,0,0,0.1)"
    }
    .card-body {
      marginTop: "0.75rem"
    }
  }
}
`);
}

main().catch(e => {
  console.error(colorize(ICONS.error, "red"), (e as Error).message);
  process.exit(1);
});