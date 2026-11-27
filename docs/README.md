# Sinth documentation

The source of the documentation at [sinth.yannosay.com/docs](https://sinth.yannosay.com/docs).

- [manifest.json](manifest.json) lists the sections and pages in navigation order.
- Each page is `<section>/<page>.md` with `title` and `description` front matter.
- Code blocks tagged `sinth live` are runnable in the playground and are compiled in CI by `npm run check:docs`, so they always match the compiler.

Links between pages use relative `.md` paths, which work both on GitHub and on the website.
