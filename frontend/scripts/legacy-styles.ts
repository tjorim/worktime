import { compile } from "sass";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

export function legacyClasses() {
  const root = resolve(import.meta.dirname, "..");
  const css = compile(resolve(root, "src/styles/_legacy.scss"), {
    loadPaths: [resolve(root, "node_modules")],
    quietDeps: true,
  }).css;
  const classes = new Set<string>();
  for (const source of [
    css,
    readFileSync(resolve(root, "src/features/calendar/calendar.css"), "utf8"),
    ...[
      "bootstrap-icons/font/bootstrap-icons.css",
      "frappe-gantt/dist/frappe-gantt.css",
      "@schedule-x/theme-default/dist/index.css",
    ].map((file) => readFileSync(resolve(root, "node_modules", file), "utf8")),
  ]) {
    postcss.parse(source).walkRules((rule) => {
      selectorParser((selectors) => {
        selectors.walkClasses((node) => {
          classes.add(node.value);
        });
      }).processSync(rule.selector);
    });
  }
  return [...classes].sort();
}
