---
title: Desktop apps
description: Ship a Sinth project as a signed native app for Windows, macOS and Linux.
---

# Desktop apps

A Sinth project can also ship as a desktop program: its own window, an entry in the Start menu or Applications folder, native file dialogs and notifications, and installers for Windows, macOS and Linux. Desktop support is opt-in. A project without it does not change, and the same pages keep working as a website.

Sinth uses [Tauri 2](https://tauri.app) for this. Apps use the web view built into the operating system and a small Rust shell, so an installer is a few megabytes, not the 100 MB or more of an app that bundles its own browser.

## Set up

```bash
npx sinth desktop init --name "Orders" --identifier com.acme.orders
```

This writes `src-tauri/` next to your pages:

| File | What it is |
|---|---|
| `tauri.conf.json` | App name, version, window size, identifier, content security policy and installer settings |
| `capabilities/default.json` | What the app's pages may do. Files can only be read or written where the user picked them in a dialog |
| `src/main.rs`, `Cargo.toml` | The native shell with the dialog, file, notification and link plugins |
| `icons/` | App icons, generated from `public/app-icon.png` (or `icon.png`, a square PNG of at least 512 px). Without one, a plain placeholder is used |

The identifier is your app's permanent id, in reverse-DNS form. Pick it once; changing it later makes systems treat the app as a different program. Building needs Rust, installed once from [rustup.rs](https://rustup.rs).

## Develop and build

```bash
npx sinth desktop dev      # opens the app window, with hot reload like sinth dev
npx sinth desktop build    # installers in src-tauri/target/release/bundle
```

`desktop dev` runs `sinth dev` on port 1420 and opens it in the app window. Saving a `.sinth` file updates the window without losing state. `desktop build` runs `sinth build` and packages the output: `.msi` and `.exe` setups on Windows, `.dmg` and `.app` on macOS, `.deb`, `.rpm` and `.AppImage` on Linux. Each platform builds its own installers, so use a CI matrix (Windows, macOS and Linux runners) for all three. `--debug` builds faster and keeps the developer tools.

## Native features

`sinth:desktop` gives pages native features. Every function also works in a browser, with the closest web equivalent, so you never need separate code for the website:

```sinth
import { Button, Content, Field, Inline, toast, Toaster } from "sinth:ui"
import { pickFile, saveFile, notify, setTitle } from "sinth:desktop"

var str text = ""
var str file = "notes.txt"

async function open() {
  const picked = await pickFile(".txt,.md")
  if picked {
    text = picked.text
    file = picked.name
    await setTitle(file + " · Notes")
  }
}

async function save() {
  if await saveFile(file, text) {
    toast("Saved " + file, "success")
  }
}

Content(width: "md") {
  Field(label: file, value: text, type: "textarea")
  Inline {
    Button(variant: "secondary", onClick: open()) { "Open" }
    Button(onClick: save()) { "Save" }
  }
  Toaster()
}
```

| Function | In the app | In a browser |
|---|---|---|
| `isDesktop()` | `true` | `false` |
| `pickFile(accept)` | native open dialog; resolves to `{ name, path, text }` or `null` | file picker; `path` is `null` |
| `saveFile(name, contents)` | native save dialog; `false` when cancelled | downloads the file |
| `notify(title, body)` | system notification | web notification, after the user allows it |
| `confirmDialog(message, title)` | native OK and Cancel dialog | `confirm()` |
| `setTitle(title)` | window title | `document.title` |
| `openExternal(url)` | opens the default browser or mail app; only `http`, `https` and `mailto` | new tab |

`accept` takes extensions like `".csv,.txt"`.

## Security

The defaults are locked down. Pages get only the permissions listed in `capabilities/default.json`, and the file permissions have no paths of their own: the app can only read or write a file the user picked in a dialog. The content security policy in `tauri.conf.json` allows the app's own scripts and HTTPS requests, and nothing else. Links never open inside the app window; `openExternal` sends them to the default browser. Remove the permissions you do not use, and add Tauri plugins or Rust commands in `src-tauri/` when you need more. That folder is a regular Tauri project, so the [Tauri documentation](https://v2.tauri.app) applies as is.

## Signing and updates

Unsigned installers work but show a warning when they are first opened. To sign them, add your Windows certificate or Apple Developer ID to `tauri.conf.json` under `bundle` (see Tauri's [signing guides](https://v2.tauri.app/distribute/sign/)). For automatic updates, add the [Tauri updater plugin](https://v2.tauri.app/plugin/updater/), which installs only releases signed with your key.
