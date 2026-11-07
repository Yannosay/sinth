# Contributing to Sinth

**`Sinth Compiler`** is currently built by one person. Any help is appreciated!

## Ways to contribute

- Report bugs via GitHub Issues
- Improve documentation
- Suggest features via Issues
- Test the compiler on your projects
- Security tests

## Development setup

```bash
git clone https://github.com/Yannosay/sinth.git
cd sinth
npm install
npm run build
```

## Project structure

- `src/compiler/` - lexer, parser, AST, type checks, code generation, style compiler, prerenderer
- `src/runtime/` - browser runtime (compiled separately as ES module)
- `src/project/` - config, import resolution, module graph, esbuild build pipeline
- `src/server/` - dev server (HMR, overlay) and preview server
- `src/deploy/` - Cloudflare Pages deployment
- `src/cli/` - command line interface and project templates
- `lib/ui/` - the `sinth:ui` component library, written in Sinth
- `test/` - `node:test` suites (`npm test`)

## Pull requests

1. Add tests if applicable
2. Ensure `npm test` and `npm run lint` pass
3. Open PR against `main`
4. Done!

Small PRs are also welcome. A documentation fix is just as valuable as a code change!