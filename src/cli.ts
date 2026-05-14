#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { SinthWarning } from "./core/types.ts";
import { compileFile, CompileOptions, findSinthPages, copyDir } from "./core/compiler.ts";
import { startDevServer } from "./server.ts";



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

      // copies to output
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

      process.stdout.write(`\n\x1b[1mBuilt ${built} page(s)\x1b[0m${hadError ? " with errors" : ""}\n`);
      process.exit(hadError ? 1 : 0);
      break;
    }

    case "dev": {
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
      break;
    }

    case "version":
    case "--version":
    case "-v": {
      const pkgPath = path.join(__dirname, "..", "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        process.stdout.write(`Sinth Compiler v${pkg.version}\n`);
      } else {
        process.stdout.write("Sinth Compiler v1.0.0\n");
      }
      break;
    }

    case "init": {
      const projectName = cleanArgs[0] || "my-sinth-project";
      scaffoldProject(path.resolve(cwd, projectName));
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
  sinth build   [files] [--out ./dist] [--prod]   Compile .sinth pages
  sinth dev     [files] [--port 3000]              Live-reload dev server
  sinth check                                      Lint without emitting
  sinth init    [name]                             Scaffold a new project
  sinth version                                    Print version
`);
      break;
    }
  }
}

// project scaffholding

function scaffoldProject(root: string): void {
  for (const d of ["pages", "components", "styles", "libraries", "assets"]) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
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

  fs.writeFileSync(path.join(root, "styles", "reset.css"),
    `*, *::before, *::after { box-sizing: border-box; }\nbody { margin: 0; font-family: system-ui, sans-serif; line-height: 1.6; }\nimg { max-width: 100%; display: block; }\n`
  );

  fs.writeFileSync(path.join(root, "sinth.config.json"),
    JSON.stringify({ outDir: "./dist", libraryPaths: ["./libraries"], minify: false }, null, 2)
  );

  fs.writeFileSync(path.join(root, ".gitignore"), "dist/\nnode_modules/\n");

  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: path.basename(root).toLowerCase().replace(/\s+/g, "-"),
    version: "1.0.0",
    scripts: { build: "sinth build", dev: "sinth dev" },
    devDependencies: { "ts-node": "^10.0.0", typescript: "^5.0.0", sass: "^1.70.0" },
  }, null, 2));

  process.stdout.write(`
\x1b[32m✓ Sinth project scaffolded at ${path.basename(root)}/\x1b[0m

\x1b[1mNext steps:\x1b[0m
  cd ${path.basename(root)}
  sinth dev
  sinth build
`);
}




main().catch(e => {
  process.stderr.write(`\x1b[31m${(e as Error).message}\x1b[0m\n`);
  process.exit(1);
});