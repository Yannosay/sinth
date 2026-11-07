import * as fs from "fs";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { c } from "./ui";

const DAY = 24 * 60 * 60 * 1000;

function cacheFile(): string {
  const base = process.env.XDG_CACHE_HOME || (process.platform === "win32" ? process.env.LOCALAPPDATA || os.homedir() : path.join(os.homedir(), ".cache"));
  return path.join(base, "sinth", "update-check.json");
}

function parseVersion(v: string): { nums: number[]; pre: string } {
  const [main, pre = ""] = v.replace(/^v/, "").split("-", 2);
  return { nums: main.split(".").map(n => Number(n) || 0), pre };
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i++) {
    if ((a.nums[i] ?? 0) !== (b.nums[i] ?? 0)) return (a.nums[i] ?? 0) > (b.nums[i] ?? 0);
  }
  if (!a.pre && b.pre) return true;
  return false;
}

function fetchLatest(timeoutMs: number): Promise<string | null> {
  return new Promise(resolve => {
    const req = https.get("https://registry.npmjs.org/@yannosay/sinth/latest", { timeout: timeoutMs, headers: { Accept: "application/json" } }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > 1_000_000) req.destroy();
      });
      res.on("end", () => {
        try {
          resolve((JSON.parse(body) as { version?: string }).version ?? null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("socket", socket => socket.unref());
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

export function startUpdateCheck(current: string): () => string | null {
  let message: string | null = null;
  if (process.env.CI || process.env.SINTH_NO_UPDATE_CHECK || !process.stdout.isTTY) return () => null;
  const file = cacheFile();
  let cached: { checkedAt: number; latest: string | null } | null;
  try {
    cached = JSON.parse(fs.readFileSync(file, "utf-8")) as { checkedAt: number; latest: string | null };
  } catch {
    cached = null;
  }
  const announce = (latest: string | null): void => {
    if (latest && isNewer(latest, current)) {
      message = `${c.yellow("Update available")} ${c.gray(current)} → ${c.green(latest)}  ${c.gray("Run")} ${c.cyan("npm i -g @yannosay/sinth@latest")}`;
    }
  };
  if (cached && Date.now() - cached.checkedAt < DAY) {
    announce(cached.latest);
    return () => message;
  }
  fetchLatest(1500).then(latest => {
    announce(latest);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ checkedAt: Date.now(), latest }));
    } catch {
      return;
    }
  }, () => undefined);
  return () => message;
}
