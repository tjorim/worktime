import { readFileSync } from "node:fs";
import path from "node:path";
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
    expect(css).toContain("@layer theme, legacy, base, calendar, components, utilities");
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

  it("merges prefixed Tailwind classes while preserving Bootstrap classes", () => {
    expect(cn("btn btn-primary", "tw:p-2", { "tw:p-4": true })).toBe("btn btn-primary tw:p-4");
  });
});
