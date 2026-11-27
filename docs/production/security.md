---
title: Security
description: Escaping, CSP and security headers.
---

# Security

Sinth is designed to be safe by default.

- **No `eval`**: neither the compiler nor the runtime evaluates strings as code. Build-time prerendering uses an AST interpreter.
- **Escaped output**: all text and attribute values are escaped. Only `RawHTML`/`html:` insert HTML, and the compiler warns when that content is dynamic.
- **No inline handlers**: event handlers are attached with `addEventListener`, so pages work under a strict Content Security Policy without `'unsafe-inline'` scripts. `onclick: "..."` strings are compile errors.
- **URL sanitizing**: dynamic `href`, `src`, `action` and similar attributes that resolve to `javascript:`, `vbscript:` or HTML `data:` URLs are blocked.
- **Security headers**: builds include a `_headers` file (Cloudflare Pages and Netlify format) with a Content Security Policy, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Cross-Origin-Opener-Policy`. External scripts, styles and fonts you import are added to the CSP automatically.
- **Safe dev server**: binds to `127.0.0.1` by default, rejects path traversal and only serves your project's public and static folders.
- **Safe builds**: `sinth build` refuses to empty an output folder it did not create.
- **Safe deploys**: deployment arguments are validated and passed to Wrangler without shell interpolation.

Configure the CSP in `sinth.config.json`:

```json
{ "security": { "csp": "default-src 'self'; img-src * data:" } }
```

Set `"csp": false` to omit it, or `"headers": false` to skip the `_headers` file.

Report vulnerabilities privately as described in [SECURITY.md](https://github.com/Yannosay/sinth/blob/main/SECURITY.md).
