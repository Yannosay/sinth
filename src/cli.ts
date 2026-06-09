import * as fs from "fs";
import * as path from "path";
import { SinthWarning } from "./core/types";
import { compileFile, CompileOptions, findSinthPages, copyDir } from "./core/cli-compiler";
import { startDevServer } from "./server";
import * as readline from "readline";
import { checkForUpdate } from "./update-check";



function loadConfig(root: string): Record<string, unknown> {
  const cfgPath = path.join(root, "sinth.config.json");
  if (fs.existsSync(cfgPath)) {
    try { return JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as Record<string, unknown>; }
    catch { SinthWarning.emit("Could not parse sinth.config.json"); }
  }
  return {};
}

async function main(): Promise<void> {
  const [,, command, ...args] = process.argv;
  const cwd = process.cwd();
  const cfg = loadConfig(cwd);

  const outDirIdx    = args.indexOf("--out");
  const outDir       = outDirIdx !== -1 ? args[outDirIdx + 1] : (cfg.outDir as string | undefined) ?? path.join(cwd, "dist");
  const portIdx      = args.indexOf("--port");
  const port         = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : (cfg.port as number | undefined) ?? 3000;
  const minify       = args.includes("--prod") || Boolean(cfg.minify);
  const sharedRuntime = args.includes("--shared-runtime") || Boolean(cfg.sharedRuntime);
  const libraryPaths = (cfg.libraryPaths as string[] | undefined) ?? [path.join(cwd, "libraries")];

  const flagValues = new Set<string>();
  if (outDirIdx !== -1) flagValues.add(args[outDirIdx + 1]);
  if (portIdx   !== -1) flagValues.add(args[portIdx + 1]);
  const cleanArgs = args.filter(a => !a.startsWith("--") && !flagValues.has(a));

  const opts: CompileOptions = { projectRoot: cwd, outDir, libraryPaths, minify, checkOnly: false, sharedRuntime };

  switch (command) {
    case "build": {
      const nonSinth = cleanArgs.filter(a => !a.endsWith(".sinth"));
      const buildStart = Date.now();
      const pkgPath4 = path.join(__dirname, "..", "package.json");
      if (fs.existsSync(pkgPath4)) {
        const pkg4 = JSON.parse(fs.readFileSync(pkgPath4, "utf-8"));
        checkForUpdate(pkg4.version);
      }
      if (nonSinth.length > 0) process.stdout.write(`\x1b[33mSkipping non-.sinth files:\x1b[0m ${nonSinth.join(", ")}\n`);

      const fileArgs = cleanArgs.filter(a => a.endsWith(".sinth"));
      const pages    = fileArgs.length > 0
        ? fileArgs.map(f => path.resolve(cwd, f)).filter(f => fs.existsSync(f))
        : findSinthPages(cwd, outDir);

      if (pages.length === 0) { process.stdout.write("No .sinth files found.\n"); process.exit(0); }

      let hadError = false, built = 0;

      const sharedRuntimes: string[] = [];
      for (const p of pages) {
        try {
          const result = compileFile(p, opts);
          if (!result) continue;
          const html = result.html;
          if (result.shared) {
            sharedRuntimes.push(result.shared);
          }
          const rel = path.relative(cwd, p).replace(/\.sinth$/, ".html");
          const out = path.join(outDir, rel);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, html);
          process.stdout.write(`  \x1b[32m✓\x1b[0m ${rel}\n`);
          built++;
        } catch (e: unknown) {
          process.stderr.write(`  \x1b[31m✗\x1b[0m ${path.relative(cwd, p)}\n${(e as Error).message}\n`);
          hadError = true;
        }
      }

      if (sharedRuntimes.length > 0) {
        const combined = sharedRuntimes.join("\n");
        fs.writeFileSync(path.join(outDir, "sinth-runtime.js"), combined);
        process.stdout.write(`  \x1b[32m✓\x1b[0m sinth-runtime.js (shared)\n`);
      }

      const assetsIn = path.join(cwd, "assets"), assetsOut = path.join(outDir, "assets");
      if (fs.existsSync(assetsIn)) {
        copyDir(assetsIn, assetsOut);
        process.stdout.write(`  \x1b[32m✓\x1b[0m assets/ → ${path.relative(cwd, assetsOut)}/\n`);
      }

      const libIn = path.join(cwd, "libraries"), libOut = path.join(outDir, "libraries");
      if (fs.existsSync(libIn)) {
        copyDir(libIn, libOut);
        const libFiles = fs.readdirSync(libOut, { recursive: true }) as string[];
        for (const f of libFiles) {
          if (f.endsWith(".sinth") || f.endsWith(".html")) {
            try { fs.unlinkSync(path.join(libOut, f)); } catch {}
          }
        }
        process.stdout.write(`  \x1b[32m✓\x1b[0m libraries/ → ${path.relative(cwd, libOut)}/\n`);
      }

      const buildTime = ((Date.now() - buildStart) / 1000).toFixed(2);
      process.stdout.write(`\n\x1b[1mBuilt ${built} page(s)\x1b[0m${hadError ? " with errors" : ""} \x1b[2min ${buildTime}s\x1b[0m\n`);
      process.exit(hadError ? 1 : 0);
      break;
    }

    case "dev": {
      const pkgPath3 = path.join(__dirname, "..", "package.json");
      if (fs.existsSync(pkgPath3)) {
        const pkg3 = JSON.parse(fs.readFileSync(pkgPath3, "utf-8"));
        checkForUpdate(pkg3.version);
      }
      const fileArgs = cleanArgs.filter(a => a.endsWith(".sinth"));
      const files    = fileArgs.length > 0
        ? fileArgs.map(f => path.resolve(cwd, f)).filter(f => fs.existsSync(f))
        : undefined;
      await startDevServer({ ...opts, port, files });
      break;
    }

    case "check": {
      opts.checkOnly = true;
      const pages    = findSinthPages(cwd, outDir);
      let hadError   = false;
      for (const p of pages) {
        try {
          compileFile(p, opts);
          process.stdout.write(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, p)}\n`);
        } catch (e: unknown) {
          process.stderr.write(`  \x1b[31m✗\x1b[0m ${path.relative(cwd, p)}\n${(e as Error).message}\n`);
          hadError = true;
        }
      }
      process.exit(hadError ? 1 : 0);
    }
    


    case "update": {
      const pkgPath2 = path.join(__dirname, "..", "package.json");
      const current = fs.existsSync(pkgPath2) ? JSON.parse(fs.readFileSync(pkgPath2, "utf-8")).version : null;
      const https = require("https");
      https.get("https://registry.npmjs.org/@yannosay/sinth/latest", { timeout: 5000 }, (res: any) => {
        let data = "";
        res.on("data", (chunk: any) => data += chunk);
        res.on("end", () => {
          try {
            const latest = JSON.parse(data).version;
            if (latest === current) {
              process.stdout.write(`\x1b[32mAlready on latest version: ${current} ✓\x1b[0m\n`);
            } else if (latest) {
              process.stdout.write(`\x1b[36mUpdating Sinth ${current} → ${latest}...\x1b[0m\n`);
              const { execSync } = require("child_process");
              execSync("npm install -g @yannosay/sinth@latest", { stdio: "inherit" });
              process.stdout.write(`\x1b[32m✓ Sinth updated to ${latest}!\x1b[0m\n`);
            }
          } catch {
            process.stderr.write("\x1b[31mCould not check for updates.\x1b[0m\n");
          }
        });
      }).on("error", () => process.stderr.write("\x1b[31mCould not reach npm registry.\x1b[0m\n"));
      break;
    }

    case "version":
    case "--version":
    case "-v": {
      const pkgPath = path.join(__dirname, "..", "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        process.stdout.write(`Sinth Compiler v${pkg.version}\n`);
        checkForUpdate(pkg.version); // fire & forget
      } else {
        process.stdout.write("Sinth Compiler v1.0.0\n");
      }
      break;
    }

    case "init": {
      await interactiveInit(cwd);
      break;
    }

    default: {
      let version = "1.0.0";
      const paths = [
        path.resolve(__dirname, "..", "package.json"),
        path.resolve(__dirname, "package.json"),
        path.resolve(process.cwd(), "package.json"),
        path.resolve(process.cwd(), "..", "package.json"),
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
            version = pkg.version;
            break;
          } catch {}
        }
      }
      process.stdout.write(`
\x1b[1mSinth Compiler v${version}\x1b[0m

\x1b[1mCommands:\x1b[0m
  sinth build   [files] [--out ./dist] [--prod] [--shared-runtime]    Compile .sinth pages
  sinth dev     [files] [--port 3000]              Live-reload dev server
  sinth check                                      Lint without emitting
  sinth init    [name]                             Scaffold a new project
  sinth version                                    Print version
`);
      break;
    }
  }
}

type Preset = "basic" | "full" | "blank";

const PRESETS: { value: Preset; label: string; description: string }[] = [
  { value: "basic", label: "Basic", description: "Single page + component" },
  { value: "full", label: "Full", description: "Multi-page, components, SCSS demo" },
  { value: "blank", label: "Blank", description: "Folders + config only" },
];

async function interactiveInit(cwd: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    escapeCodeTimeout: 50,
  });

  process.stdout.write("\x1b[1m\n✨ Welcome to Sinth project setup!\n\n\x1b[0m");

  const rawName = await question(rl, "\x1b[45m\x1b[30m Project name: \x1b[0m ", "my-sinth-project");
  process.stdout.write("\n");
  const projectName = rawName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  rl.close();

  const rl2 = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    escapeCodeTimeout: 50,
  });

  const preset = await select(rl2);
  rl2.close();

  const root = path.resolve(cwd, projectName);
  process.stdout.write("\n");
  const start = Date.now();
  scaffoldByPreset(root, projectName, preset);
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  process.stdout.write(`
\x1b[32m✓ Sinth project scaffolded at \x1b[4m${projectName}/\x1b[0m\x1b[32m in ${elapsed}s\x1b[0m

\x1b[1mNext steps:\x1b[0m
  cd ${projectName}
  sinth dev
  sinth build
`);
}

function question(rl: readline.Interface, prompt: string, defaultVal: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

function select(rl: readline.Interface): Promise<Preset> {
  return new Promise((resolve) => {
    const items = PRESETS;
    let selected = 1;

    const prefix = "  ";
    const cursor = "\x1b[36m❯\x1b[0m";
    const empty  = " ";

    function render(first: boolean = false) {
      if (!first) {
        process.stdout.write(`\x1b[${items.length + 1}A`);
      }
      process.stdout.write(`\x1b[43m\x1b[30m Select preset: \x1b[0m\n`);
      for (let i = 0; i < items.length; i++) {
        const pointer = i === selected ? cursor : empty;
        const isFull  = items[i].value === "full";
        let label: string;
        if (i === selected) {
          label = isFull ? `\x1b[1m\x1b[35m${items[i].label}\x1b[0m` : `\x1b[1m${items[i].label}\x1b[0m`;
        } else {
          label = items[i].label;
        }
        const desc    = `\x1b[2m- ${items[i].description}\x1b[0m`;
        process.stdout.write(`${prefix}${pointer} ${label} ${desc}\x1b[0K\n`);
      }
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (key: Buffer) => {
      const str = key.toString();
      if (str === "\u001b[A") {
        selected = (selected - 1 + items.length) % items.length;
        render();
      } else if (str === "\u001b[B") {
        selected = (selected + 1) % items.length;
        render();
      } else if (str === "\r" || str === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write(`\x1b[${items.length - selected}A\x1b[0J`);
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

function scaffoldByPreset(root: string, name: string, preset: Preset): void {
  const dirs = ["pages", "components", "styles", "libraries", "assets"];
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });

  fs.writeFileSync(path.join(root, "sinth.config.json"),
    JSON.stringify({ outDir: "./dist", libraryPaths: ["./libraries"], minify: false }, null, 2)
  );
  fs.writeFileSync(path.join(root, ".gitignore"), "dist/\nnode_modules/\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: name.toLowerCase().replace(/\s+/g, "-"),
    version: "1.0.0",
    scripts: { build: "sinth build", dev: "sinth dev" },
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
descr = "Built with Sinth v1.0.0."

var int score = 0
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
    Heading(level: 3) { "$title" }
    Div(class: "card-body") { "$slot" }
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
  process.stderr.write(`\x1b[31m${(e as Error).message}\x1b[0m\n`);
  process.exit(1);
});