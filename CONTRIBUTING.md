


# Contributing to Sinth

**`Sinth Compiler`** is currently built by one person. Any help is appreciated!

## Ways to contribute

- Report bugs via GitHub Issues
- Improve documentation (typo fixes count)
- Suggest features via Issues
- Test the compiler on your projects

## Development setup

```bash
git clone https://github.com/Yannosay/sinth.git
cd sinth
npm install
node bin/sinth.js build

```


## Project structure

- `src/compiler/` - Lexer, parser, AST, code generation

- `src/runtime/` - Runtime renderer

- `tests/` - Test cases


## Pull requests

1. Add tests if applicable

2. Ensure `npm run test` passes

3. Open PR against `main`


Small PRs are welcome. A documentation fix is just as valuable as a code change!
