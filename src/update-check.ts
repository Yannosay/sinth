import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_DIR = path.join(os.tmpdir(), ".sinth-cache");
const CACHE_FILE = path.join(CACHE_DIR, "update-check.json");

interface CacheData {
  lastCheck: number;
}

function readCache(): CacheData | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as CacheData;
    }
  } catch {}
  return null;
}

function writeCache(): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ lastCheck: Date.now() }));
  } catch {}
}

function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      "https://registry.npmjs.org/@yannosay/sinth/latest",
      { timeout: 3000 },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          try {
            const json = JSON.parse(data) as { version?: string };
            resolve(json.version ?? null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

export async function checkForUpdate(currentVersion: string): Promise<void> {
  const cache = readCache();
  if (cache && Date.now() - cache.lastCheck < CHECK_INTERVAL_MS) return;

  writeCache();
  const latest = await fetchLatestVersion();
  if (!latest) return;
  if (latest === currentVersion) {
    process.stdout.write(`\n\x1b[2mSinth is up to date (v${currentVersion})!\x1b[0m\n`);
    return;
  }

  // simple semver compare (major.minor.patch)
  const curParts = currentVersion.split(".").map(Number);
  const latParts = latest.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((latParts[i] ?? 0) > (curParts[i] ?? 0)) {
      process.stdout.write(
        `\n\x1b[2m✨ Sinth ${latest} is available! Run \x1b[1msinth update\x1b[0m\x1b[2m to upgrade.\x1b[0m\n\n`
      );
      return;
    }
    if ((latParts[i] ?? 0) < (curParts[i] ?? 0)) return; // local is newer (dev)
  }
}