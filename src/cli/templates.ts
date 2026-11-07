export type TemplateName = "starter" | "minimal" | "blank";

export interface TemplateInfo {
  name: TemplateName;
  label: string;
  description: string;
}

export const TEMPLATES: TemplateInfo[] = [
  { name: "starter", label: "Starter", description: "Two pages, a layout component and the sinth:ui library" },
  { name: "minimal", label: "Minimal", description: "One page with a counter, nothing else" },
  { name: "blank", label: "Blank", description: "Config and folders only" },
];

export function templateFiles(template: TemplateName, name: string, version: string): Record<string, string> {
  const files: Record<string, string> = {
    "sinth.config.json": JSON.stringify({
      $schema: "./node_modules/@yannosay/sinth/schema/sinth.config.schema.json",
      outDir: "dist",
      pagesDir: "pages",
      cloudflare: { projectName: name },
    }, null, 2) + "\n",
    "package.json": JSON.stringify({
      name,
      version: "0.1.0",
      private: true,
      scripts: { dev: "sinth dev", build: "sinth build", preview: "sinth preview", check: "sinth check", deploy: "sinth deploy" },
      devDependencies: { "@yannosay/sinth": `^${version.replace(/-.*$/, "")}` },
    }, null, 2) + "\n",
    ".gitignore": "node_modules/\ndist/\n.sinth/\n.wrangler/\n",
    "README.md": `# ${name}\n\nBuilt with [Sinth](https://sinth.yannosay.com).\n\n\`\`\`bash\nnpm install\nnpm run dev      # http://localhost:3000\nnpm run build    # production build in dist/\nnpm run deploy   # deploy to Cloudflare Pages\n\`\`\`\n`,
    "public/robots.txt": "User-agent: *\nAllow: /\n",
  };
  if (template === "blank") {
    files["pages/.gitkeep"] = "";
    files["components/.gitkeep"] = "";
    return files;
  }
  if (template === "minimal") {
    files["pages/index.sinth"] = `page

title = "${name}"
descr = "A Sinth site."

var num count = 0

Main {
  Heading(level: 1) { "Hello, Sinth!" }
  Paragraph { "Edit pages/index.sinth and save. The page updates instantly." }
  Button(onClick: count += 1) { "Clicked " + count + (count == 1 ? " time" : " times") }
}

style {
  main {
    maxWidth: "40rem"
    margin: "4rem auto"
    padding: "0 1.25rem"
    fontFamily: "system-ui, sans-serif"
  }
  button {
    font: "inherit"
    padding: "0.6rem 1.1rem"
    borderRadius: "8px"
    border: "1px solid #d4d4d8"
    cursor: "pointer"
  }
}
`;
    return files;
  }
  files["components/Layout.sinth"] = `import { Navbar, Content } from "sinth:ui"

component Layout(str current = "/") {
  Navbar(brand: "${name}") {
    NavLink(href: "/", ariaCurrent: current == "/" ? "page" : null) { "Home" }
    NavLink(href: "/about", ariaCurrent: current == "/about" ? "page" : null) { "About" }
  }
  Main {
    Content {
      $slot
    }
  }
  Footer(class: "site-footer") {
    Content {
      Small { "© " + new Date().getFullYear() + " ${name}. Built with Sinth." }
    }
  }

  style {
    main { padding: "3rem 0" }
    .site-footer {
      borderTop: "1px solid var(--ui-border)"
      padding: "1.5rem 0"
      color: "var(--ui-muted)"
    }
  }
}
`;
  files["pages/index.sinth"] = `page

import { Layout } from "../components/Layout.sinth"
import { Button, Card, Columns, Field, Badge, Alert } from "sinth:ui"

title = "${name}"
descr = "A fast website built with Sinth."

var num count = 0
var str name = ""
var str[] features = ["Reactive by default", "Zero-config builds", "Deploy anywhere"]

computed str greeting = name.trim() ? "Hello, " + name.trim() + "!" : "Hello, stranger!"

Layout(current: "/") {
  Badge(tone: "accent") { "Sinth ${version}" }
  Heading(level: 1) { greeting }
  Paragraph(class: "lead") { "Edit pages/index.sinth and save. Your changes appear instantly, state included." }

  Columns(min: "15rem") {
    Card(title: "Counter") {
      Paragraph { "You clicked " + count + (count == 1 ? " time." : " times.") }
      Button(onClick: count += 1) { "Click me" }
    }
    Card(title: "Two-way binding") {
      Field(label: "Your name", value: name, placeholder: "Ada Lovelace")
    }
  }

  Heading(level: 2) { "Why Sinth?" }
  Ul {
    for feature in features {
      Li { feature }
    }
  }

  if count >= 10 {
    Alert(tone: "success", title: "Nice!") { "You clicked ten times. State survives hot reloads too." }
  }
}

style {
  .lead {
    fontSize: "1.15rem"
    color: "var(--ui-muted)"
    maxWidth: "40rem"
  }
}
`;
  files["pages/about.sinth"] = `page

import { Layout } from "../components/Layout.sinth"

title = "About | ${name}"
descr = "About this site."

Layout(current: "/about") {
  Heading(level: 1) { "About" }
  Paragraph { "This page is static, so Sinth ships it without any JavaScript." }
}
`;
  files["pages/404.sinth"] = `page

import { Layout } from "../components/Layout.sinth"
import { Button } from "sinth:ui"

title = "Page not found"
robots = "noindex"

Layout {
  Heading(level: 1) { "Page not found" }
  Paragraph { "The page you are looking for does not exist." }
  Button(href: "/") { "Back home" }
}
`;
  return files;
}

export function pageTemplate(title: string): string {
  return `page

title = "${title}"

Main {
  Heading(level: 1) { "${title}" }
}
`;
}

export function componentTemplate(name: string): string {
  const cls = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  return `component ${name}(str title = "${name}") {
  Div(class: "${cls}") {
    Heading(level: 3) { title }
    $slot
  }

  style {
    .${cls} {
      padding: "1rem"
      borderRadius: "12px"
    }
  }
}
`;
}
