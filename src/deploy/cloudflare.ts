import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { SinthError } from "../compiler/diagnostics";
import { c, log } from "../cli/ui";
import { Platform, SinthConfig } from "../project/config";
import { DEPLOY_DIR, userWranglerConfig } from "./platforms";

const PROJECT_NAME = /^[a-z0-9][a-z0-9-]{0,56}[a-z0-9]$/;
const BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const ACCOUNT_ID = /^[a-f0-9]{32}$/;
const WRANGLER = "wrangler@4";
const VERCEL = "vercel@latest";
const NETLIFY = "netlify-cli@latest";

export interface DeployOptions {
  branch?: string;
  preview: boolean;
  create: boolean;
  projectName?: string;
}

export function defaultProjectName(root: string): string {
  let name = path.basename(root);
  const pkg = path.join(root, "package.json");
  if (fs.existsSync(pkg)) {
    try {
      const meta = JSON.parse(fs.readFileSync(pkg, "utf-8")) as { name?: string };
      if (meta.name) name = meta.name.replace(/^@[^/]+\//, "");
    } catch {
      return sanitizeName(name);
    }
  }
  return sanitizeName(name);
}

function sanitizeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 58);
  return cleaned.length >= 2 ? cleaned : "sinth-site";
}

/** Runs a host's CLI through npx, so it does not have to be installed. */
export function runNpx(pkg: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
  for (const a of args) {
    if (!/^[A-Za-z0-9@._/:=\\ -]+$/.test(a)) throw new SinthError("E1100", `Refusing to pass unsafe argument to ${pkg}: ${a}`);
  }
  const isWin = process.platform === "win32";
  const cmd = isWin ? "npx.cmd" : "npx";
  const quoted = isWin ? ["--yes", pkg, ...args].map(a => (/\s/.test(a) ? `"${a}"` : a)) : ["--yes", pkg, ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, quoted, { cwd, env, stdio: "inherit", shell: isWin });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

function assertBuilt(outDir: string): void {
  if (!fs.existsSync(outDir) || (!fs.existsSync(path.join(outDir, "index.html")) && !fs.readdirSync(outDir).some(f => f.endsWith(".html")))) {
    throw new SinthError("E1104", `Nothing to deploy in ${outDir}`, undefined, "Run sinth build first, or deploy without --skip-build");
  }
}

function cloudflareEnv(config: SinthConfig): NodeJS.ProcessEnv {
  const cf = config.cloudflare;
  if (cf.accountId && !ACCOUNT_ID.test(cf.accountId)) throw new SinthError("E1103", "cloudflare.accountId must be a 32-character hex ID from the Cloudflare dashboard");
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (cf.accountId) env.CLOUDFLARE_ACCOUNT_ID = cf.accountId;
  if (!env.CLOUDFLARE_API_TOKEN) log.step(c.gray("Using your wrangler login. In CI, set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."));
  return env;
}

function projectNameFor(root: string, config: SinthConfig, opts: DeployOptions, what: string): string {
  const name = opts.projectName ?? config.cloudflare.projectName ?? defaultProjectName(root);
  if (!PROJECT_NAME.test(name)) {
    throw new SinthError("E1101", `Invalid ${what} name '${name}'`, undefined, "Use 2-58 lowercase letters, numbers and dashes, e.g. \"my-site\"");
  }
  return name;
}

/** Uploads a finished build to the host set by `platform`. */
export async function deploy(root: string, config: SinthConfig, opts: DeployOptions): Promise<void> {
  const platform: Platform = config.platform;
  switch (platform) {
    case "cloudflare":
      return deployToCloudflare(root, config.outDir, config, opts);
    case "cloudflare-workers":
      return deployToWorkers(root, config, opts);
    case "vercel":
      return deployToVercel(root, opts);
    case "netlify":
      return deployToNetlify(root, config, opts);
    case "github-pages":
    case "static":
      throw new SinthError("E1106", `sinth deploy has no upload step for platform "${platform}"`, undefined, platform === "github-pages"
        ? "Publish dist/ with GitHub Actions (actions/upload-pages-artifact and actions/deploy-pages). See https://sinth.yannosay.com/docs/production/deploy"
        : "Upload the contents of your outDir to your host, or set \"platform\" in sinth.config.json");
  }
}

export async function deployToCloudflare(root: string, outDir: string, config: SinthConfig, opts: DeployOptions): Promise<void> {
  const cf = config.cloudflare;
  const projectName = projectNameFor(root, config, opts, "Cloudflare Pages project");
  const branch = opts.branch ?? (opts.preview ? "preview" : cf.productionBranch ?? "main");
  if (!BRANCH_NAME.test(branch)) throw new SinthError("E1102", `Invalid branch name '${branch}'`);
  assertBuilt(outDir);
  const env = cloudflareEnv(config);

  if (opts.create) {
    log.info(`Creating Cloudflare Pages project ${c.bold(projectName)}`);
    const code = await runNpx(WRANGLER, ["pages", "project", "create", projectName, "--production-branch", cf.productionBranch ?? "main"], root, env);
    if (code !== 0) log.warn("Project creation failed or the project already exists, continuing with the deploy");
  }

  log.info(`Deploying ${c.bold(path.relative(root, outDir) || outDir)} to ${c.bold(projectName)} ${c.gray(`(branch ${branch})`)}`);
  const code = await runNpx(WRANGLER, ["pages", "deploy", path.relative(root, outDir) || ".", "--project-name", projectName, "--branch", branch, "--commit-dirty=true"], root, env);
  if (code !== 0) {
    throw new SinthError("E1105", "Cloudflare deployment failed", undefined, `Check the output above. Not logged in? Run: npx ${WRANGLER} login. New project? Run: sinth deploy --create`);
  }
  log.success(`Deployed to Cloudflare Pages (${projectName})`);
}

async function deployToWorkers(root: string, config: SinthConfig, opts: DeployOptions): Promise<void> {
  assertBuilt(config.outDir);
  const env = cloudflareEnv(config);
  const own = userWranglerConfig(root);
  const configFile = own ?? path.join(root, DEPLOY_DIR, "wrangler.json");
  if (!fs.existsSync(configFile)) throw new SinthError("E1104", "No Worker config found", undefined, "Run sinth build with \"platform\": \"cloudflare-workers\" first");
  const args = opts.preview ? ["versions", "upload"] : ["deploy"];
  args.push("--config", path.relative(root, configFile));
  if (opts.projectName) args.push("--name", projectNameFor(root, config, opts, "Worker"));
  log.info(`${opts.preview ? "Uploading a preview version of" : "Deploying"} the Worker ${c.gray(`(config ${path.relative(root, configFile)})`)}`);
  if (own) log.step(c.gray(`Using your ${path.basename(own)}. It should point "assets.directory" at ${path.relative(root, config.outDir)}; see the deploy docs.`));
  const code = await runNpx(WRANGLER, args, root, env);
  if (code !== 0) throw new SinthError("E1105", "Cloudflare Workers deployment failed", undefined, `Check the output above. Not logged in? Run: npx ${WRANGLER} login`);
  log.success(opts.preview ? "Uploaded a preview version to Cloudflare Workers" : "Deployed to Cloudflare Workers");
}

async function deployToVercel(root: string, opts: DeployOptions): Promise<void> {
  if (!fs.existsSync(path.join(root, ".vercel", "output", "config.json"))) {
    throw new SinthError("E1104", "No Vercel build output found", undefined, "Run sinth build with \"platform\": \"vercel\" first");
  }
  const args = ["deploy", "--prebuilt"];
  if (!opts.preview) args.push("--prod");
  log.info(`Deploying ${c.bold(".vercel/output")} to Vercel${opts.preview ? " (preview)" : ""}`);
  if (!process.env.VERCEL_TOKEN) log.step(c.gray("Using your Vercel login. The first deploy asks which project to link."));
  else args.push("--token", process.env.VERCEL_TOKEN);
  const code = await runNpx(VERCEL, args, root, { ...process.env });
  if (code !== 0) throw new SinthError("E1105", "Vercel deployment failed", undefined, `Check the output above. Not logged in? Run: npx ${VERCEL} login`);
  log.success("Deployed to Vercel");
}

async function deployToNetlify(root: string, config: SinthConfig, opts: DeployOptions): Promise<void> {
  assertBuilt(config.outDir);
  const args = ["deploy", "--dir", path.relative(root, config.outDir) || ".", "--no-build"];
  if (!opts.preview) args.push("--prod");
  log.info(`Deploying ${c.bold(path.relative(root, config.outDir))} to Netlify${opts.preview ? " (draft)" : ""}`);
  if (!process.env.NETLIFY_AUTH_TOKEN) log.step(c.gray("Using your Netlify login. In CI, set NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID."));
  const code = await runNpx(NETLIFY, args, root, { ...process.env });
  if (code !== 0) throw new SinthError("E1105", "Netlify deployment failed", undefined, `Check the output above. Not logged in? Run: npx ${NETLIFY} login`);
  log.success("Deployed to Netlify");
}
