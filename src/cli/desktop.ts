import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { SinthError } from "../compiler/diagnostics";
import { runNpx } from "../deploy/cloudflare";
import { loadConfig } from "../project/config";
import { c, log } from "./ui";

/**
 * `sinth desktop` packages a Sinth project as a native app with Tauri 2: the system web view, a
 * Rust shell of a few MB, signed installers for Windows, macOS and Linux. The Tauri CLI runs
 * through npx, so nothing is added to the project's dependencies.
 */
export const TAURI_CLI = "@tauri-apps/cli@^2";
export const DESKTOP_DIR = "src-tauri";
/** Fixed dev port: the app window loads this address, so `sinth dev` runs with --strict-port. */
export const DESKTOP_DEV_PORT = 1420;

export interface DesktopInitOptions {
  name?: string;
  identifier?: string;
  force?: boolean;
}

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*){1,}$/;

function readPackage(root: string): { name?: string; version?: string } {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as { name?: string; version?: string };
  } catch {
    return {};
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/^@[^/]+\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}

function titleCase(s: string): string {
  return s.split(/[-_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function hasCargo(): boolean {
  return spawnSync(process.platform === "win32" ? "cargo.exe" : "cargo", ["--version"], { stdio: "ignore" }).status === 0;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    t[n] = v >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let v = 0xffffffff;
  for (const b of buf) v = CRC_TABLE[(v ^ b) & 0xff] ^ (v >>> 8);
  return (v ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A plain rounded-square app icon (1024 px PNG), used until the project provides its own. */
export function placeholderIcon(rgb: [number, number, number] = [124, 58, 237]): Buffer {
  const size = 1024;
  const radius = size * 0.22;
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
      const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
      const edge = radius - Math.hypot(dx, dy);
      const alpha = Math.round(Math.max(0, Math.min(1, edge + 0.5)) * 255);
      row.set([rgb[0], rgb[1], rgb[2], alpha], 1 + x * 4);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A square PNG of at least 512 px in public/, used as the app icon when present. */
function projectIcon(root: string, publicDir: string): string | undefined {
  for (const name of ["app-icon.png", "icon.png", "icon-512.png", "logo.png"]) {
    const file = path.join(publicDir, name);
    if (!fs.existsSync(file)) continue;
    const b = fs.readFileSync(file);
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) continue;
    const w = b.readUInt32BE(16);
    const h = b.readUInt32BE(20);
    if (w === h && w >= 512) return path.relative(root, file);
  }
  return undefined;
}

export function desktopFiles(opts: { name: string; identifier: string; version: string; frontendDist: string; sinthVersion: string }): Record<string, string> {
  const crate = slug(opts.name).replace(/-/g, "_").replace(/^(\d)/, "app_$1");
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' ipc: http://ipc.localhost https:",
  ].join("; ");
  return {
    "Cargo.toml": `[package]
name = "${crate}"
version = "${opts.version}"
edition = "2021"
publish = false

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
tauri-plugin-notification = "2"
tauri-plugin-opener = "2"

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true
`,
    "build.rs": "fn main() {\n    tauri_build::build()\n}\n",
    "src/main.rs": `// Hides the console window of release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("failed to start the app");
}
`,
    "tauri.conf.json": JSON.stringify({
      $schema: "https://schema.tauri.app/config/2",
      productName: opts.name,
      version: opts.version,
      identifier: opts.identifier,
      build: {
        frontendDist: opts.frontendDist,
        devUrl: `http://127.0.0.1:${DESKTOP_DEV_PORT}`,
        beforeDevCommand: `npx --yes @yannosay/sinth@^${opts.sinthVersion} dev --port ${DESKTOP_DEV_PORT} --strict-port`,
        beforeBuildCommand: `npx --yes @yannosay/sinth@^${opts.sinthVersion} build`,
      },
      app: {
        windows: [{ label: "main", title: opts.name, width: 1200, height: 800, minWidth: 480, minHeight: 360, center: true, resizable: true }],
        security: { csp },
      },
      bundle: {
        active: true,
        targets: "all",
        icon: ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"],
      },
    }, null, 2) + "\n",
    // Least privilege: files can only be read or written where the user picked them in a dialog.
    "capabilities/default.json": JSON.stringify({
      $schema: "../gen/schemas/desktop-schema.json",
      identifier: "default",
      description: "What the app's pages may do. sinth:desktop needs these; remove what you do not use.",
      windows: ["main"],
      permissions: [
        "core:default",
        "core:window:allow-set-title",
        "dialog:allow-open",
        "dialog:allow-save",
        "dialog:allow-message",
        "fs:allow-read-text-file",
        "fs:allow-write-text-file",
        "notification:default",
        "opener:default",
      ],
    }, null, 2) + "\n",
    ".gitignore": "/target/\n/gen/schemas/\n",
  };
}

export async function desktopInit(root: string, opts: DesktopInitOptions, sinthVersion: string): Promise<void> {
  const dir = path.join(root, DESKTOP_DIR);
  if (fs.existsSync(path.join(dir, "tauri.conf.json")) && !opts.force) {
    throw new SinthError("E1400", `${DESKTOP_DIR}/ already exists`, undefined, "Edit src-tauri/tauri.conf.json, or pass --force to write it again");
  }
  const { config } = loadConfig(root, "production");
  const pkg = readPackage(root);
  const name = (opts.name ?? titleCase(slug(pkg.name ?? path.basename(root)))).trim();
  if (!name || name.length > 64) throw new SinthError("E1401", "The app name must be 1 to 64 characters", undefined, "Pass --name \"My App\"");
  const identifier = opts.identifier ?? `com.example.${slug(name).replace(/-/g, "")}`;
  if (!IDENTIFIER.test(identifier) || /\.app$/i.test(identifier)) {
    throw new SinthError("E1401", `'${identifier}' is not a valid app identifier`, undefined, "Use reverse-DNS form, like com.acme.orders (it must not end in .app)");
  }
  const version = /^\d+\.\d+\.\d+/.test(pkg.version ?? "") ? (pkg.version as string) : "0.1.0";
  const frontendDist = path.relative(dir, config.outDir).split(path.sep).join("/") || ".";
  for (const [rel, contents] of Object.entries(desktopFiles({ name, identifier, version, frontendDist, sinthVersion: sinthVersion.split("-")[0] }))) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  log.success(`Created ${c.bold(DESKTOP_DIR + "/")} for ${c.bold(name)} (${identifier})`);

  let icon = projectIcon(root, config.publicDir);
  if (!icon) {
    icon = path.join(DESKTOP_DIR, "app-icon.png");
    fs.writeFileSync(path.join(root, icon), placeholderIcon());
  }
  const code = await runNpx(TAURI_CLI, ["icon", icon, "--output", path.join(DESKTOP_DIR, "icons")], root, process.env);
  if (code !== 0) throw new SinthError("E1402", "Could not generate the app icons", undefined, `Run it again when online: npx ${TAURI_CLI} icon ${icon} --output ${DESKTOP_DIR}/icons`);
  // Desktop only: the mobile icon sets are not used.
  for (const mobile of ["android", "ios"]) fs.rmSync(path.join(dir, "icons", mobile), { recursive: true, force: true });
  log.success(`App icons from ${c.cyan(icon)}`);

  console.log(`\n  ${c.bold("Next")}\n`);
  if (!hasCargo()) console.log(`    Install Rust from ${c.cyan("https://rustup.rs")} (needed once to build desktop apps)`);
  console.log(`    ${c.cyan("sinth desktop dev")}     open the app with hot reload`);
  console.log(`    ${c.cyan("sinth desktop build")}   build installers into ${DESKTOP_DIR}/target/release/bundle\n`);
  if (identifier.startsWith("com.example.")) console.log(`  ${c.gray(`Set your own identifier in ${DESKTOP_DIR}/tauri.conf.json before you ship.`)}\n`);
}

/** Runs `tauri dev` or `tauri build` for a project set up with `sinth desktop init`. */
export async function desktopRun(root: string, command: "dev" | "build", extra: string[]): Promise<void> {
  if (!fs.existsSync(path.join(root, DESKTOP_DIR, "tauri.conf.json"))) {
    throw new SinthError("E1403", "This project is not set up as a desktop app", undefined, "Run: sinth desktop init");
  }
  if (!hasCargo()) {
    throw new SinthError("E1404", "Rust is not installed", undefined, "Desktop apps are compiled with Rust. Install it from https://rustup.rs, then run this again");
  }
  const code = await runNpx(TAURI_CLI, [command, ...extra], root, process.env);
  if (code !== 0) throw new SinthError("E1405", `tauri ${command} failed`, undefined, "Check the output above");
  if (command === "build") log.success(`Installers are in ${c.cyan(path.join(DESKTOP_DIR, "target", "release", "bundle"))}`);
}
