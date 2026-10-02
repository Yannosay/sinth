import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { CompileOptions } from "./core/cli-compiler";
import { SinthWarning } from "./core/types";

interface CloudflareConfig {
  accountId?: string;
  projectName?: string;
  productionBranch?: string;
  compatibilityDate?: string;
  compatibilityFlags?: string[];
  kvNamespaces?: { binding: string; id: string }[];
  d1Databases?: { binding: string; name: string }[];
  r2Buckets?: { binding: string; bucketName: string }[];
  durableObjects?: { binding: string; className: string }[];
  services?: { binding: string; service: string }[];
}

function loadConfig(root: string): Record<string, unknown> {
  const cfgPath = path.join(root, "sinth.config.json");
  if (fs.existsSync(cfgPath)) {
    try { return JSON.parse(fs.readFileSync(cfgPath, "utf-8")) as Record<string, unknown>; }
    catch {
      SinthWarning.emit("Could not parse sinth.config.json. Make sure it contains valid JSON.", { file: cfgPath, line: 0, col: 0 });
    }
  }
  return {};
}

export async function deployToCloudflare(opts: CompileOptions & { port: number }): Promise<void> {
  const cwd = opts.projectRoot;
  const cfg = loadConfig(cwd);
  const cfConfig = (cfg.cloudflare as CloudflareConfig) || {};
  
  // Check if wrangler is installed
  try {
    execSync("wrangler --version", { stdio: "ignore" });
  } catch {
    process.stderr.write("\x1b[31mWrangler CLI not found. Install it with: npm install -g wrangler\x1b[0m\n");
    process.exit(1);
  }
  
  // Check for required config
  if (!cfConfig.accountId) {
    process.stderr.write("\x1b[31mCloudflare account_id not configured in sinth.config.json\x1b[0m\n");
    process.stderr.write("Add to sinth.config.json:\n");
    process.stderr.write(`  "cloudflare": {\n    "accountId": "your-account-id",\n    "projectName": "my-sinth-app"\n  }\x1b[0m\n`);
    process.exit(1);
  }
  
  // Build first
  process.stdout.write("\x1b[36m[sinth deploy] Building project...\x1b[0m\n");
  const buildResult = await buildForCloudflare(opts);
  if (!buildResult.success) {
    process.exit(1);
  }
  
  // Create wrangler.toml if it doesn't exist
  const wranglerPath = path.join(cwd, "wrangler.toml");
  if (!fs.existsSync(wranglerPath)) {
    generateWranglerConfig(cwd, cfConfig, buildResult.outDir);
  }
  
  // Deploy using wrangler
  process.stdout.write("\x1b[36m[sinth deploy] Deploying to Cloudflare Pages...\x1b[0m\n");
  try {
    const deployCmd = `wrangler pages deploy ${buildResult.outDir} --project-name=${cfConfig.projectName || "sinth-app"} --branch=${cfConfig.productionBranch || "production"}`;
    execSync(deployCmd, { stdio: "inherit", cwd });
    process.stdout.write("\x1b[32m✓ Deployed successfully to Cloudflare Pages!\x1b[0m\n");
  } catch (e) {
    process.stderr.write(`\x1b[31mDeployment failed: ${(e as Error).message}\x1b[0m\n`);
    process.exit(1);
  }
}

async function buildForCloudflare(opts: CompileOptions): Promise<{ success: boolean; outDir: string }> {
  const { compileFile, findSinthPages, copyDir } = await import("./core/cli-compiler");
  
  const outDir = path.resolve(opts.outDir);
  const pages = findSinthPages(opts.projectRoot, opts.outDir, opts.libraryPaths);
  
  if (pages.length === 0) {
    process.stdout.write("No .sinth files found.\n");
    return { success: false, outDir };
  }
  
  const sharedRuntimes: string[] = [];
  const compiledJsDir = path.join(outDir, "_sinth", "js");
  const compiledCssDir = path.join(outDir, "_sinth", "styles");
  
  fs.rmSync(compiledJsDir, { recursive: true, force: true });
  fs.rmSync(compiledCssDir, { recursive: true, force: true });
  
  let hadError = false;
  for (const p of pages) {
    try {
      const result = compileFile(p, { ...opts, checkOnly: false, minify: true });
      if (!result) continue;
      
      if (result.shared) {
        sharedRuntimes.push(result.shared);
      }
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
      
      const rel = path.relative(opts.projectRoot, p).replace(/\.sinth$/, ".html");
      const out = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, result.html);
      process.stdout.write(`  \x1b[32m✓\x1b[0m ${rel}\n`);
    } catch (e: unknown) {
      process.stderr.write(`  \x1b[31m✗\x1b[0m ${path.relative(opts.projectRoot, p)}\n${(e as Error).message}\n`);
      hadError = true;
    }
  }
  
  if (sharedRuntimes.length > 0) {
    const combined = sharedRuntimes.join("\n");
    fs.writeFileSync(path.join(outDir, "sinth-runtime.js"), combined);
  }
  
  for (const dir of opts.staticDirs) {
    const staticIn = path.isAbsolute(dir) ? dir : path.join(opts.projectRoot, dir);
    const staticOut = path.isAbsolute(dir) ? path.join(outDir, path.basename(dir)) : path.join(outDir, dir);
    if (fs.existsSync(staticIn)) {
      copyDir(staticIn, staticOut);
    }
  }
  
  const libIn = path.join(opts.projectRoot, "libraries"), libOut = path.join(outDir, "libraries");
  if (fs.existsSync(libIn)) {
    copyDir(libIn, libOut);
    const libFiles = fs.readdirSync(libOut, { recursive: true }) as string[];
    for (const f of libFiles) {
      if (f.endsWith(".sinth") || f.endsWith(".html")) {
        try { fs.unlinkSync(path.join(libOut, f)); } catch { void 0; }
      }
    }
  }
  
  return { success: !hadError, outDir };
}

function generateWranglerConfig(cwd: string, cfConfig: CloudflareConfig, outDir: string): void {
  const config = `# Auto-generated by Sinth. Modify as needed.
name = "${cfConfig.projectName || "sinth-app"}"
compatibility_date = "${cfConfig.compatibilityDate || new Date().toISOString().split("T")[0]}"
pages_build_output_dir = "${path.relative(cwd, outDir)}"

[env.production]
name = "${cfConfig.projectName || "sinth-app"}-production"
`;
  
  fs.writeFileSync(path.join(cwd, "wrangler.toml"), config);
  process.stdout.write(`  \x1b[32m✓\x1b[0m Generated wrangler.toml\n`);
}