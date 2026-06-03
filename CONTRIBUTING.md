<!-- This is the CONTRIBUTING.md file. It's intended for interested developers on GitHub. -->


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
node bin/sinth.js build

```

## Raw Project structure

- `src/compiler/` - Lexer, parser, AST, code generation

- `src/runtime/` - Runtime renderer

- pregenerated `dist/` - Compiled Sinth Files (HTML)


## Pull requests

1. Add tests if applicable

2. Ensure `node bin/sinth.js build` runs correctly

3. Open PR against `main`

4. Done!


Small PRs are also welcome. A documentation fix is just as valuable as a code change!
