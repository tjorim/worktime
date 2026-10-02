import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { compile as compileTailwind } from "tailwindcss";
import { compile } from "sass";
import postcss, { type AnyNode } from "postcss";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

const root = path.resolve(import.meta.dirname, "../..");
const css = compile(path.join(root, "src/styles/main.scss"), {
  loadPaths: [path.join(root, "node_modules")],
  quietDeps: true,
}).css;
const tailwind = readFileSync(path.join(root, "src/styles/tailwind.css"), "utf8");

describe("Tailwind coexistence", () => {
  it("keeps Bootstrap and Worktime rules inside the legacy layer", () => {
    const sheet = postcss.parse(css);
    const rules: string[] = [];
    sheet.walkRules((rule) => {
      let parent: AnyNode | undefined = rule.parent;
      while (parent && !(parent.type === "atrule" && parent.name === "layer")) {
        parent = parent.parent;
      }
      expect(parent?.type === "atrule" && parent.params).toBe("legacy");
      rules.push(rule.selector);
    });
    expect(rules).toContain(".btn");
    expect(rules).toContain(".form-control");
    expect(rules).toContain(".modal-content");
    expect(css).toContain("@layer theme, legacy, base, calendar, gantt, components, utilities");
  });

  it("maps every event palette variable without copying its value", () => {
    const palette = readFileSync(path.join(root, "src/styles/event-palette.css"), "utf8");
    const variables = new Set(palette.match(/--wt-event-[\w-]+(?=:)/g));
    expect(variables.size).toBeGreaterThan(30);
    for (const variable of variables) {
      expect(tailwind).toContain(`--color-${variable.slice(2)}: var(${variable})`);
    }
    expect(tailwind).not.toContain("preflight");
    expect(tailwind).toContain('[data-bs-theme="dark"]');
  });

  it("declares calendar runtime tokens in compiled production CSS", async () => {
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
    const declarations = new Set<string>();
    postcss.parse(compiler.build([])).walkDecls((decl) => {
      declarations.add(decl.prop);
    });
    const calendar = readFileSync(path.join(root, "src/features/calendar/calendar.css"), "utf8");
    const references = [...calendar.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]);
    expect(references.length).toBeGreaterThan(10);
    for (const reference of references) {
      expect(declarations, `Missing runtime declaration for ${reference}`).toContain(reference);
    }
  });

  it("preserves compact mobile spacing for remaining Bootstrap views", () => {
    const declarations = new Map<string, string>();
    postcss.parse(css).walkAtRules("media", (media) => {
      if (media.params !== "(width <= 768px)") return;
      media.walkRules((rule) => {
        for (const selector of rule.selector.split(",")) {
          rule.walkDecls((decl) => {
            declarations.set(`${selector.trim()} ${decl.prop}`, decl.value);
          });
        }
      });
    });
    expect(declarations.get(".container-fluid padding-left")).toBe("0.5rem");
    expect(declarations.get(".container-fluid padding-right")).toBe("0.5rem");
    expect(declarations.get(".card-body padding")).toBe("0.75rem");
    expect(declarations.get(".card-header padding")).toBe("0.75rem");
    expect(declarations.get(".btn-sm font-size")).toBe("0.75rem");
  });

  it("merges prefixed Tailwind classes while preserving Bootstrap classes", () => {
    expect(cn("btn btn-primary", "tw:p-2", { "tw:p-4": true })).toBe("btn btn-primary tw:p-4");
  });
});
