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

## Raw Project structure

- `src/compiler/` - Lexer, parser, AST, code generation
- `src/runtime/` - Runtime renderer
- `src/server/` - Dev server with live reload
- `src/core/` - CLI compiler, shared types, utilities
- `dist/` - Compiled JavaScript output (not committed to Git)
- `bin/sinth.js` - CLI entry point

## Pull requests

1. Add tests if applicable
2. Ensure `npm run build` completes without errors
3. Open PR against `main`
4. Done!

Small PRs are also welcome. A documentation fix is just as valuable as a code change!