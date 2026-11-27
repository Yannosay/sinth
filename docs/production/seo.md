---
title: SEO and social sharing
description: Prerendered HTML, metadata, structured data, sitemaps and link previews.
---

# SEO and social sharing

Sinth sites are search-engine friendly by default: every page is a complete, prerendered HTML file with its own title and description, and nothing depends on JavaScript to show content.

## Titles and descriptions

Set metadata at the top of each page. Values can be computed at build time:

```sinth
const str site = "Acme"

title = "Pricing | " + site
descr = "Simple plans for teams of every size."
canonical = "https://acme.dev/pricing"

Main { Heading(level: 1) { "Pricing" } }
```

`title` and `descr` also fill `og:title`, `og:description` and the Twitter card, unless you set those yourself. See [Page metadata](../language/metadata.md) for every key.

## Link previews

```sinth
ogImage = "assets/og/pricing.png"
ogType = "website"
twitterSite = "@acme"
```

With an `ogImage`, `twitter:card` defaults to `summary_large_image`. Relative image paths are resolved to your `public/` or static folders. Social networks need absolute URLs, so set `"site"` in `sinth.config.json` and use full URLs for `ogImage` when sharing matters.

## Structured data

`jsonLd` adds [schema.org](https://schema.org) structured data, which search engines use for rich results:

```sinth
const str heading = "Getting started with Sinth"
title = heading

jsonLd = {
  "@context": "https://schema.org"
  "@type": "Article"
  headline: heading
  author: { "@type": "Person", name: "Ada Lovelace" }
  datePublished: "2026-11-27"
}

Main { Heading(level: 1) { heading } }
```

The value is written as `<script type="application/ld+json">` in the head and escaped safely. An array adds several items.

## Sitemap, robots.txt and llms.txt

Set your public URL:

```json
{ "site": "https://acme.dev" }
```

The build then writes `sitemap.xml` with every page (404 pages excluded) and a `robots.txt` that points to it. A `robots.txt` in `public/` replaces the generated one.

It also writes an [`llms.txt`](https://llmstxt.org): the home page's title and description, then every page with its title, URL and description. AI assistants and answer engines use it to understand and cite a site. Write good `descr` metadata and this file is useful without any extra work; an `llms.txt` in `public/` replaces the generated one. To keep a page out of search results, set `robots = "noindex"` on it.

## Dynamic pages

[Dynamic routes](../getting-started/pages-and-routing.md#dynamic-routes) prerender one HTML file per item, each with its own metadata, and all of them are listed in the sitemap.

## Performance

Search engines rank fast pages higher. Sinth pages show content without waiting for JavaScript, ship only the code a page needs, and serve hashed assets with long cache lifetimes. See [Rendering and performance](performance.md).

## Checklist

- Every page has a unique `title` and `descr`.
- `"site"` is set, so the sitemap and `robots.txt` are generated.
- Important pages set `canonical` and an `ogImage`.
- Headings form an outline: one `Heading(level: 1)` per page.
- Images have `alt` text, and links have descriptive text.
