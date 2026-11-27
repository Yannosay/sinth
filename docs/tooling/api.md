---
title: Programmatic API
description: Using the compiler from JavaScript.
---

# Programmatic API

```js
const { loadConfig, Project, buildProject, checkProject, parseSinth } = require("@yannosay/sinth");

const root = process.cwd();
const { config } = loadConfig(root, "production");
const project = new Project(root, config, false);

const result = await buildProject(project, { write: true });
console.log(result.pages.map(p => p.page.route));

const { errors, warnings } = checkProject(project);
const ast = parseSinth(source, "file.sinth");
```

## Compiling in memory

`compileFiles` compiles sources without a file system or bundler, for editor integrations, previews and tests. It is the same compiler `sinth build` uses.

```js
const { compileFiles } = require("@yannosay/sinth");

const result = compileFiles({
  "/pages/index.sinth": 'var num n = 0
Main { Button(onClick: n += 1) { "n = " + n } }',
});

result.html;      // prerendered document
result.css;       // styles of the page and its components
result.modules;   // [{ id, js, deps }], dependencies first; imports use the module ids
result.warnings;
```

Options: `entry` (default `/pages/index.sinth`), `builtins` (sources for `sinth:` libraries), `resolvePackage` (where bare npm imports point, by default `https://esm.sh/<name>`) and `dev`.

A browser build is published at `@yannosay/sinth/dist/browser/sinth.js`. It is an ES module that exports `compileFiles` (with `sinth:ui` built in), `runtimeSource`, `formatDiagnostic` and `version`, and powers the [playground](https://sinth.yannosay.com/playground).

## Errors

Errors are `SinthError` instances with `code`, `loc` and `diagnostic`; `formatDiagnostic(diagnostic, color)` renders them like the CLI does.
