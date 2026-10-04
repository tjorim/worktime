import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { compile as compileTailwind } from "tailwindcss";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const tailwind = read("src/styles/tailwind.css");

function cssFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const relative = path.join(dir, name);
    if (statSync(path.join(root, relative)).isDirectory()) return cssFiles(relative);
    return name.endsWith(".css") ? [relative] : [];
  });
}

async function buildTailwind(candidates: string[]) {
  const require = createRequire(import.meta.url);
  const file = path.join(root, "src/styles/tailwind.css");
  const compiler = await compileTailwind(tailwind, {
    base: path.dirname(file),
    loadStylesheet: async (id, base) => {
      const resolved = id.startsWith(".") ? path.resolve(base, id) : require.resolve(id);
      return {
        path: resolved,
        base: path.dirname(resolved),
        content: readFileSync(resolved, "utf8"),
      };
    },
  });
  return postcss.parse(compiler.build(candidates));
}

describe("style stack", () => {
  it("has no Bootstrap, prefix or legacy-layer scaffolding left", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const packages = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(packages.filter((name) => /bootstrap/.test(name))).toEqual([]);
    expect(tailwind).not.toMatch(/prefix\(/);
    expect(tailwind).not.toMatch(/\blegacy\b/);
    expect(JSON.parse(read("components.json")).tailwind.prefix).toBe("");
    for (const file of cssFiles("src")) {
      expect(read(file), file).not.toMatch(/data-bs-theme|--bs-|bootstrap/i);
    }
  });

  it("orders cascade layers so vendor styles sit below components and utilities", () => {
    expect(tailwind).toMatch(/@layer theme, base, vendor, components, utilities;/);
    expect(read("src/features/calendar/calendar.css")).toContain("layer(vendor)");
    expect(read("src/features/gantt/gantt.css")).toContain("layer(vendor)");
  });

  it("uses Tailwind's preflight and the Worktime base layer", () => {
    expect(tailwind).toContain('@import "tailwindcss/preflight.css" layer(base)');
    expect(tailwind).toContain('@import "./base.css"');
  });

  it("maps every event palette variable without copying its value", () => {
    const palette = read("src/styles/event-palette.css");
    const variables = new Set(palette.match(/--wt-event-[\w-]+(?=:)/g));
    expect(variables.size).toBeGreaterThan(30);
    for (const variable of variables) {
      expect(tailwind).toContain(`--color-${variable.slice(2)}: var(${variable})`);
    }
  });

  it("drives the dark variant and every dark token from data-theme", async () => {
    expect(tailwind).toContain('@custom-variant dark (&:where([data-theme="dark"]');
    const tokens = read("src/styles/tokens.css");
    expect(tokens).toMatch(/^\[data-theme="dark"\] \{/m);
    const css = await buildTailwind(["dark:bg-wt-surface-2"]);
    const selectors: string[] = [];
    css.walkRules((rule) => {
      if (rule.selector.includes("bg-wt-surface-2")) selectors.push(rule.selector);
    });
    expect(selectors.join(" ")).toContain('[data-theme="dark"]');
  });

  it("defines every --wt-* token that a stylesheet reads", () => {
    const declared = new Set<string>();
    const used = new Set<string>();
    for (const file of cssFiles("src")) {
      const css = read(file);
      for (const [, name] of css.matchAll(/(--[\w-]+)\s*:/g)) declared.add(name!);
      for (const [, name] of css.matchAll(/var\((--wt-[\w-]+)/g)) used.add(name!);
    }
    // Set at runtime by components (see progress-ring, team-grid utilities).
    const runtime = new Set(["--wt-half-rest", "--wt-team-name-col"]);
    for (const name of used) {
      if (!runtime.has(name))
        expect(declared, `${name} is read but never declared`).toContain(name);
    }
  });

  it("declares calendar runtime tokens in compiled production CSS", async () => {
    const declarations = new Set<string>();
    (await buildTailwind([])).walkDecls((decl) => {
      declarations.add(decl.prop);
    });
    const calendar = read("src/features/calendar/calendar.css");
    const references = [...calendar.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]);
    expect(references.length).toBeGreaterThan(10);
    for (const reference of references) {
      expect(declarations, `Missing runtime declaration for ${reference}`).toContain(reference);
    }
  });

  it("resolves theme tokens to utilities", async () => {
    const css = await buildTailwind(["bg-background", "text-muted-foreground", "px-2"]);
    const values = new Map<string, string>();
    css.walkRules((rule) => {
      rule.walkDecls((decl) => {
        values.set(`${rule.selector} ${decl.prop}`, decl.value);
      });
    });
    expect(values.get(".bg-background background-color")).toContain("--wt-theme-background");
    expect(values.get(".text-muted-foreground color")).toContain("--wt-theme-muted-foreground");
    expect(values.get(".px-2 padding-inline")).toBeDefined();
  });

  it("merges conflicting Tailwind classes, last one wins", () => {
    expect(cn("px-2 py-1", { "px-4": true })).toBe("py-1 px-4");
    expect(cn("text-muted-foreground", "text-primary", "dark:bg-card", "dark:bg-popover")).toBe(
      "text-primary dark:bg-popover",
    );
  });
});
