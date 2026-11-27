/**
 * Redirects and custom headers from sinth.config.json. The same rules are applied by `sinth dev`,
 * `sinth preview` and every deploy target, so a redirect behaves the same locally and in production.
 *
 *   "redirects": { "/old": "/new", "/blog/:slug": "/posts/:slug", "/docs/*": { "to": "https://docs.example.com/:splat", "status": 302 } }
 *   "headers":   { "/api/*": { "Access-Control-Allow-Origin": "*" } }
 */

export interface Redirect {
  from: string;
  to: string;
  status: number;
}

export type HeaderRules = Record<string, Record<string, string>>;

export const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

interface Compiled extends Redirect {
  regex: RegExp;
  names: string[];
}

/** True when the pattern has `:params` or a `*` splat. */
export function isPattern(from: string): boolean {
  return /(^|\/):[A-Za-z_]|\*/.test(from);
}

function compile(r: Redirect): Compiled {
  const names: string[] = [];
  const source = r.from.split("/").map(part => {
    if (part === "*") {
      names.push("splat");
      return "(.*)";
    }
    const param = part.match(/^:([A-Za-z_]\w*)$/);
    if (param) {
      names.push(param[1]);
      return "([^/]+)";
    }
    return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, () => {
      names.push("splat");
      return "(.*)";
    });
  }).join("/");
  return { ...r, regex: new RegExp(`^${source}/?$`), names };
}

/** Param names with their group index, longest first so ":id" never replaces part of ":idx". */
function byLength(names: string[]): [string, number][] {
  return names.map((n, i): [string, number] => [n, i]).sort((a, b) => b[0].length - a[0].length);
}

function withBase(p: string, base: string): string {
  return base !== "/" && p.startsWith("/") && !p.startsWith("//") ? base.slice(0, -1) + p : p;
}

/** Finds the redirect for a site path (without the base). Returns the target with params filled in. */
export function matchRedirect(rules: Redirect[], sitePath: string, search = ""): { location: string; status: number } | null {
  for (const r of rules) {
    const c = compile(r);
    const m = c.regex.exec(sitePath);
    if (!m) continue;
    let to = r.to;
    for (const [name, i] of byLength(c.names)) to = to.split(":" + name).join(m[i + 1] ?? "");
    if (search && !to.includes("?")) to += search;
    return { location: to, status: r.status };
  }
  return null;
}

/** A `_redirects` file (Cloudflare Pages and Workers, Netlify). */
export function redirectsFile(rules: Redirect[], base: string): string {
  return rules.map(r => `${withBase(r.from, base)} ${withBase(r.to, base)} ${r.status}`).join("\n") + "\n";
}

/** Extra rules for a `_headers` file. */
export function headerRulesFile(rules: HeaderRules, base: string): string {
  const out: string[] = [];
  for (const [pattern, headers] of Object.entries(rules)) {
    out.push(withBase(pattern, base));
    for (const [k, v] of Object.entries(headers)) out.push(`  ${k}: ${v}`);
    out.push("");
  }
  return out.join("\n");
}

/** Vercel Build Output API routes for the redirects (placed before the filesystem). */
export function vercelRedirectRoutes(rules: Redirect[], base: string): Record<string, unknown>[] {
  return rules.map(r => {
    const c = compile({ ...r, from: withBase(r.from, base) });
    let dest = withBase(r.to, base);
    for (const [name, i] of byLength(c.names)) dest = dest.split(":" + name).join("$" + (i + 1));
    return { src: c.regex.source, status: r.status, headers: { Location: dest } };
  });
}

/** Vercel routes that add the custom headers. `*` matches any characters. */
export function vercelHeaderRoutes(rules: HeaderRules, base: string): Record<string, unknown>[] {
  return Object.entries(rules).map(([pattern, headers]) => ({
    src: "^" + withBase(pattern, base).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    headers,
    continue: true,
  }));
}

/** A static page that redirects, for hosts without server-side redirects (GitHub Pages). */
export function redirectPage(to: string): string {
  const esc = to.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>Redirecting</title>\n  <meta http-equiv="refresh" content="0; url=${esc}">\n  <link rel="canonical" href="${esc}">\n  <meta name="robots" content="noindex">\n</head>\n<body>\n<a href="${esc}">Continue to ${esc}</a>\n</body>\n</html>\n`;
}
