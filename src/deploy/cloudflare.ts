import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { SinthError } from "../compiler/diagnostics";
import { c, log } from "../cli/ui";
import { SinthConfig } from "../project/config";

const PROJECT_NAME = /^[a-z0-9][a-z0-9-]{0,56}[a-z0-9]$/;
const BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const ACCOUNT_ID = /^[a-f0-9]{32}$/;
const WRANGLER = "wrangler@4";

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

function runWrangler(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
  for (const a of args) {
    if (!/^[A-Za-z0-9@._/:=\\ -]+$/.test(a)) throw new SinthError("E1100", `Refusing to pass unsafe argument to wrangler: ${a}`);
  }
  const isWin = process.platform === "win32";
  const cmd = isWin ? "npx.cmd" : "npx";
  const quoted = isWin ? ["--yes", WRANGLER, ...args].map(a => (/\s/.test(a) ? `"${a}"` : a)) : ["--yes", WRANGLER, ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, quoted, { cwd, env, stdio: "inherit", shell: isWin });
    child.on("error", reject);
    child.on("exit", code => resolve(code ?? 1));
  });
}

export async function deployToCloudflare(root: string, outDir: string, config: SinthConfig, opts: DeployOptions): Promise<void> {
  const cf = config.cloudflare;
  const projectName = opts.projectName ?? cf.projectName ?? defaultProjectName(root);
  const branch = opts.branch ?? (opts.preview ? "preview" : cf.productionBranch ?? "main");
  if (!PROJECT_NAME.test(projectName)) {
    throw new SinthError("E1101", `Invalid Cloudflare Pages project name '${projectName}'`, undefined, "Use 2-58 lowercase letters, numbers and dashes, e.g. \"my-site\"");
  }
  if (!BRANCH_NAME.test(branch)) throw new SinthError("E1102", `Invalid branch name '${branch}'`);
  if (cf.accountId && !ACCOUNT_ID.test(cf.accountId)) throw new SinthError("E1103", "cloudflare.accountId must be a 32-character hex ID from the Cloudflare dashboard");
  if (!fs.existsSync(path.join(outDir, "index.html")) && !fs.readdirSync(outDir).some(f => f.endsWith(".html"))) {
    throw new SinthError("E1104", `Nothing to deploy in ${outDir}`);
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (cf.accountId) env.CLOUDFLARE_ACCOUNT_ID = cf.accountId;

  if (opts.create) {
    log.info(`Creating Cloudflare Pages project ${c.bold(projectName)}`);
    const code = await runWrangler(["pages", "project", "create", projectName, "--production-branch", cf.productionBranch ?? "main"], root, env);
    if (code !== 0) log.warn("Project creation failed or the project already exists, continuing with the deploy");
  }

  log.info(`Deploying ${c.bold(path.relative(root, outDir) || outDir)} to ${c.bold(projectName)} ${c.gray(`(branch ${branch})`)}`);
  if (!env.CLOUDFLARE_API_TOKEN) log.step(c.gray("Using your wrangler login. In CI, set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."));
  const code = await runWrangler(["pages", "deploy", path.relative(root, outDir) || ".", "--project-name", projectName, "--branch", branch, "--commit-dirty=true"], root, env);
  if (code !== 0) {
    throw new SinthError("E1105", "Cloudflare deployment failed", undefined, `Check the output above. Not logged in? Run: npx ${WRANGLER} login. New project? Run: sinth deploy --create`);
  }
  log.success(`Deployed to Cloudflare Pages (${projectName})`);
}
