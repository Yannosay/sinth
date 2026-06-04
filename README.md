# ![Sinth Repo Cover](/.github/assets/sinth_repo_cover.png)

[![npm version](https://img.shields.io/npm/v/@yannosay/sinth?color=6366f1&label=&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth)
[![npm downloads](https://img.shields.io/npm/dw/@yannosay/sinth?color=818cf8&label=&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth)
[![license](https://img.shields.io/npm/l/@yannosay/sinth?color=a78bfa&label=&style=for-the-badge)](https://github.com/yannosay/sinth/blob/main/LICENSE)
[![Commits](https://img.shields.io/github/commit-activity/m/yannosay/sinth?color=a78bfa&style=for-the-badge)](https://github.com/yannosay/sinth/commits)
[![PRs](https://img.shields.io/github/issues-pr-raw/yannosay/sinth?color=818cf8&style=for-the-badge)](https://github.com/yannosay/sinth/pulls)

## Sinth Compiler

Sinth enables faster, easier and reactive HTML coding.

* **Declarative:** Sinth makes it super easy to create reactive code. Declarative code helps you understand your code more easily and simplifies debugging.
* **Simple to setup:** You don't need to download 5 different packages. Download Sinth, create `.sinth` files, and easily transform them into usable HTML right in your CLI.

## Install

* To install Sinth, use this command:
  * `npm install -g @yannosay/sinth`

The Sinth compiler is designed as a CLI tool that should work from anywhere. Therefore, it is best installed globally.

## Init

* You can initialize your Sinth project via your CLI:
  * `sinth init my-sinth-project`
  * `cd my-sinth-project`
* After that's done, you can start a Dev Server to preview your chan ge:
  * `sinth dev pages/index.sinth`
  
## Documentation

You can find the complete documentation, including all notes and tips [here](https://yannosay.com/sinth).

## Usage

```ts
page

title = "Increment Showcase"
fav = "./assets/fav.ico"

var str userName = "User"
var int count = 0
Main {
    Heading(level: 1) { count }
    Button(onClick: count += 1) { "Increment" }
    Input(bind: userName, placeholder: "Type in your username")
    Paragraph() { userName + " has reached Count " + count + "!" }
}
```

## Feature Overview

- Mixed logic
- Two-way binding
- Reactive Sinth variables
- Import own Components
- Expression-based delays
- Object support
- Object iteration
- SCSS support
- Tree-shaken output
- VS Code extension
- Live reload dev server
- Self-contained HTML
- Reactive Sinth variables affecting CSS
- Reactivity in functions
- Exporting custom HTML Tags to use in non-sinth HTML Projects

## Security

Sinth's reactive runtime environment does not use `eval()`. Every expression is precompiled into optimized JavaScript functions at build time. This is intended to make using Sinth more secure.

Should you nevertheless discover a security issue, you can help us by submitting a security vulnerabilities report. For more information, view our [Security policy](https://github.com/Yannosay/sinth/security/policy).

## Support

If you have encountered a problem and need assistance, please open an issue in [our repository](https://github.com/Yannosay/sinth/issues) or join our [Discord server](https://discord.gg/SUvcrafTQm) for general support.

## Commands

- `sinth init [name]`
- `sinth dev [file]`
- `sinth build [file] [--shared-runtime]`
- `sinth check [file]`
- `sinth version`

## Additional Links

- Official Sinth Repo: [Visit on GitHub](https://github.com/yannosay/sinth)
- Website: [Yannosay Production Website](https://yannosay.com/)
- Discord: [Join here](https://discord.gg/SUvcrafTQm)
- VS Code Extension: [Download here](https://marketplace.visualstudio.com/items?itemName=YannosayProductions.sinth-vscode)

## License

[AGPL-3.0](https://github.com/Yannosay/sinth/blob/main/LICENSE)

Notice: All generated output you made with Sinth is entirely your intellectual property and free of any license obligations of Sinth.