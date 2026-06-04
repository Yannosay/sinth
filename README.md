# ![Sinth Repo Cover](/.github/assets/sinth_repo_cover.png)

[![npm version](https://img.shields.io/npm/v/@yannosay/sinth?color=6366f1&label=&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth)
[![npm downloads](https://img.shields.io/npm/dw/@yannosay/sinth?color=818cf8&label=&style=for-the-badge)](https://www.npmjs.com/package/@yannosay/sinth)
[![license](https://img.shields.io/npm/l/@yannosay/sinth?color=a78bfa&label=&style=for-the-badge)](https://github.com/yannosay/sinth/blob/main/LICENSE)
[![Commits](https://img.shields.io/github/commit-activity/m/yannosay/sinth?color=a78bfa&style=for-the-badge)](https://github.com/yannosay/sinth/commits)
[![PRs](https://img.shields.io/github/issues-pr-raw/yannosay/sinth?color=818cf8&style=for-the-badge)](https://github.com/yannosay/sinth/pulls)

* Introduction: [Watch now](https://www.youtube.com/watch?v=W0tOMTiIF0Q)
* Discord: [Join here](https://discord.gg/SUvcrafTQm)
* Documentation: https://yannosay.com/sinth

## Sinth Compiler
Welcome to Sinth Compiler. Sinth enables faster, easier and reactive HTML coding.

## Documentation
You can find the complete documentation, including all notes and tips [here]

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

## Install
npm install -g @yannosay/sinth

## Init
`sinth init`
`sinth dev pages/index.sinth`

## Feature overview
- Mixed logic
- Two-way binding
- Reactivity
- Import own Components
- Expression-based delays
- Object support
- Object iteration
- SCSS support
- Tree-shaken output
- VS Code extension
- Live reload dev server
- Self-contained HTML
- Reactive variables in CSS
- Reactivity in functions
- Exporting custom HTML Tags

## Security
Sinth's reactive runtime does not use eval(). Every expression is pre-compiled into optimized JavaScript functions at build time.
###### Check out our [public GitHub repo](https://github.com/Yannosay/sinth) and see for yourself.

Should you nevertheless discover a security issue, you can help us by submitting a security vulnerabilities report. For more information, view our [Security policy](https://github.com/Yannosay/sinth/security/policy)

## Support
If you have encountered a problem and need assistance, please open an issue in [our repository](https://github.com/Yannosay/sinth/issues) or join our [Discord server](https://discord.gg/SUvcrafTQm) for general support.

## Commands
- sinth init [name]
- sinth dev [file] 
- sinth build [file] [--shared-runtime]
- sinth check [file]
- sinth version

## Additional Links
- Official Sinth Repo: [Visit on GitHub](https://github.com/yannosay/sinth)
- Website: [Yannosay Production Website](https://yannosay.com/)
- Discord: [Join here](https://discord.gg/SUvcrafTQm)
- VS Code Extension: [Download here](https://marketplace.visualstudio.com/items?itemName=YannosayProductions.sinth-vscode)

## License
AGPL-3.0
All generated output is entirely your intellectual property, free of any license obligations.