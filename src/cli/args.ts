import { SinthError, suggest } from "../compiler/diagnostics";

export interface FlagSpec {
  type: "boolean" | "string" | "number";
  alias?: string;
  description: string;
  optionalValue?: string;
}

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | number | boolean | undefined>;
}

export function parseArgs(argv: string[], spec: Record<string, FlagSpec>): ParsedArgs {
  const positionals: string[] = [];
  const flags: ParsedArgs["flags"] = {};
  const aliases = new Map<string, string>();
  for (const [name, s] of Object.entries(spec)) if (s.alias) aliases.set(s.alias, name);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }
    let name: string;
    let inline: string | undefined;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      inline = eq === -1 ? undefined : arg.slice(eq + 1);
    } else {
      const alias = aliases.get(arg.slice(1));
      if (!alias) throw new SinthError("E1200", `Unknown option '${arg}'`);
      name = alias;
    }
    let negated = false;
    if (!spec[name] && name.startsWith("no-") && spec[name.slice(3)]?.type === "boolean") {
      name = name.slice(3);
      negated = true;
    }
    const s = spec[name];
    if (!s) {
      const near = suggest(name, Object.keys(spec));
      throw new SinthError("E1200", `Unknown option '--${name}'`, undefined, near ? `Did you mean '--${near}'?` : "Run 'sinth help' to see all options");
    }
    if (s.type === "boolean") {
      flags[name] = inline !== undefined ? inline !== "false" : !negated;
      continue;
    }
    let value = inline;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        value = next;
        i++;
      } else if (s.optionalValue !== undefined) {
        value = s.optionalValue;
      } else {
        throw new SinthError("E1201", `Option '--${name}' needs a value`);
      }
    }
    if (s.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new SinthError("E1202", `Option '--${name}' expects a number, got '${value}'`);
      flags[name] = n;
    } else {
      flags[name] = value;
    }
  }
  return { positionals, flags };
}
