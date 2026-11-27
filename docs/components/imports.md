---
title: Imports
description: Importing Sinth files, npm packages, CSS, JSON and fonts.
---

# Imports

```sinth
-- Sinth modules
import { Card, Badge } from "./components/ui.sinth"   -- named
import { Card as Tile } from "./components/ui.sinth"  -- renamed
import Card from "./components/Card.sinth"            -- default: the component named like the file
import * as UI from "./components/ui.sinth"           -- namespace: UI.Card { ... }
import "./components/Navbar.sinth"                    -- all components of the file
import { Button } from "sinth:ui"                     -- built-in library
import { Chart } from "charts/Chart"                  -- from a library folder (libraryPaths)
import { Map } from "sinth-maps"                      -- npm package with a "sinth" field

-- JavaScript and npm
import confetti from "canvas-confetti"                -- bundled from node_modules
import { format } from "date-fns"
import * as utils from "./utils.js"                   -- .js, .mjs, .ts, .tsx, .jsx
import "./analytics.js"                               -- side effects only

-- Styles
import "./styles/reset.css"
import css "./styles/theme.scss"
import "https://cdn.example.com/lib.css"             -- external stylesheet link

-- Data and fonts
import data from "./data.json"                        -- inlined at build time
import { posts, site } from "./content.json"
import font "Inter:400,600,800"                       -- Google Fonts (with preconnect)

-- External scripts
import "https://cdn.example.com/widget.js" { defer: true }
extern Widget                                          -- declare the global it creates
```

Rules:

- Extensions are optional for `.sinth` files (`./components/Card`).
- Paths starting with `/` are relative to the source folder: the project root, or `app/` (see [Project structure](../getting-started/project-structure.md#the-app-folder)).
- Missing npm packages produce a clear error with the `npm install` command to run.
- Circular imports between `.sinth` files are an error (E0609).
- Importing a name that does not exist lists the available exports (E0602).

## Publishing Sinth components on npm

Add a `sinth` field pointing to your entry file:

```json
{ "name": "sinth-charts", "sinth": "index.sinth" }
```

Users can then write `import { BarChart } from "sinth-charts"`.
