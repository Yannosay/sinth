---
title: Page metadata
description: Titles, descriptions, social cards and other head tags.
---

# Page metadata

Metadata is written as `key = value` at the top level of a page. Values are evaluated at build time, so they can use literals, constants, imported JSON and [route params](../getting-started/pages-and-routing.md#dynamic-routes):

```sinth
const str site = "Acme"
title = "Pricing | " + site
descr = f"Plans for teams of every size at {site}"
```

Values that only exist in the browser (`fetch`, `localStorage`, user input) cannot be used in metadata (E0700). A value of `null` or `false` leaves the tag out.

| Key | Output |
|---|---|
| `title` | `<title>`, and `og:title` if not set |
| `descr` / `description` | `<meta name="description">`, and `og:description` if not set |
| `fav` / `favicon` | `<link rel="icon">` (type detected from the extension) |
| `lang` | `<html lang>` (default `en`) |
| `charset` | default `utf-8` |
| `viewport` | default `width=device-width, initial-scale=1` |
| `author`, `keywords`, `robots` | `<meta name="...">` |
| `generator` | `<meta name="generator">` (default `Sinth`) |
| `themeColor` | `<meta name="theme-color">` |
| `colorScheme` | `<meta name="color-scheme">` |
| `canonical` | `<link rel="canonical">` |
| `manifest` | `<link rel="manifest">` |
| `appleTouchIcon` | `<link rel="apple-touch-icon">` |
| `base` | `<base href>` |
| `bodyClass`, `htmlClass` | class on `<body>` / `<html>` |
| `ogImage`, `ogUrl`, `ogType`, `ogSiteName`, ... | `<meta property="og:...">` |
| `twitterCard`, `twitterSite`, `twitterImage`, ... | `<meta name="twitter:...">` |
| `jsonLd` | `<script type="application/ld+json">` structured data (an object or array, see [SEO](../production/seo.md)) |

Asset paths (`fav`, `ogImage`, `manifest`, `appleTouchIcon`) are resolved for you: `fav = "assets/logo.png"` or `fav = "./favicon.svg"` become correct root-relative URLs if the file exists in `public/` or a static folder. `twitter:card` defaults to `summary_large_image` when an `ogImage` is present.
