---
title: Security
description: Escaping, CSP and security headers.
---

# Security

Sinth is designed to be safe by default.

- **No `eval`**: neither the compiler nor the runtime evaluates strings as code. Build-time prerendering uses an AST interpreter.
- **Escaped output**: all text and attribute values are escaped. Only `RawHTML`/`html:` insert HTML, and the compiler warns when that content is dynamic.
- **No inline handlers**: event handlers are attached with `addEventListener`, so pages work under a Content Security Policy without `'unsafe-inline'` scripts. (The generated policy still allows inline styles, which style attributes need.) `onclick: "..."` strings are compile errors.
- **URL sanitizing**: `href`, `src`, `action` and similar attributes that resolve to `javascript:`, `vbscript:` or HTML `data:` URLs are blocked, both in prerendered HTML and at runtime. Tabs, newlines and control characters that browsers ignore inside a URL scheme (for example a tab between `java` and `script:`) do not get around the check.
- **Secrets stay on the server**: pages can only import environment variables that start with `PUBLIC_`; everything else is available only to `functions/`. See [Environment variables](../full-stack/environment.md).
- **Security headers**: builds include a `_headers` file (Cloudflare Pages and Workers, Netlify; on Vercel the same headers go into `.vercel/output/config.json`) with a Content Security Policy, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` and `Cross-Origin-Opener-Policy`. External scripts, styles and fonts you import are added to the CSP automatically.
- **Safe dev server**: binds to `127.0.0.1` by default, rejects path traversal, only serves your project's public and static folders, and answers only to `localhost` and IP addresses, which blocks DNS rebinding attacks from other websites. Allow other host names, such as a tunnel, with `"allowedHosts"` in `sinth.config.json`. Request bodies sent to `functions/` are limited to 64 MB.
- **Safe builds**: `sinth build` refuses to empty an output folder it did not create.
- **Safe deploys**: deployment arguments are validated and passed to Wrangler without shell interpolation.

Configure the CSP in `sinth.config.json`:

```json
{ "security": { "csp": "default-src 'self'; img-src * data:" } }
```

Set `"csp": false` to omit it, or `"headers": false` to skip the `_headers` file. Add your own headers per path, such as `Strict-Transport-Security` or CORS rules, with the [`headers`](../tooling/configuration.md#custom-headers) option.

Report vulnerabilities privately as described in [SECURITY.md](https://github.com/Yannosay/sinth/blob/main/SECURITY.md).
