# Changelog

## 5.4.0

- `sinth:desktop` in import completions.

## 5.3.4

- Completions and hover documentation for all 28 `sinth:ui` components, including the new `Select`, `Tabs`, `Table`, `Toaster` and others.
- `sinth:env` in import completions.
- The `sinth.config.json` schema knows `redirects`, `headers` and `allowedHosts`.

## 5.3.1

- Version aligned with Sinth 5.3.1 (runtime license exception); no editor changes.

## 5.3.0

- Highlighting for `try`, `catch`, `finally` and `throw`.
- Completions and hover documentation for the `jsonLd` metadata key and the `router` config option.
- The documentation link opens sinth.yannosay.com/docs.

## 5.2.2

- Matches Sinth 5.2: the removed `page` keyword is no longer highlighted or suggested. **New Page** and the empty-file snippet create pages without it.
- Metadata completions (`title`, `descr`, `paths`, ...) appear in files inside `pages/`.
- Hover documentation for `paths` (dynamic routes).

## 5.0.0

- Rewritten for Sinth 5: new grammar, IntelliSense with workspace components, auto-import, parameter completions, hover, go to definition, signature help, outline, formatter, compiler diagnostics, project commands and config validation.
