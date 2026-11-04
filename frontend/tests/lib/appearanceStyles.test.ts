import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { contrastRatio } from "@tests/utils/eventPalette";

const css = readFileSync(path.resolve(__dirname, "../../src/styles/base.css"), "utf8");
it("globally reduces motion including utility animations and keeps lifecycle events", () => {
  const fallback = css.slice(css.indexOf("/* Keep lifecycle"));
  expect(fallback).toContain("@media (prefers-reduced-motion: reduce)");
  for (const rule of [
    "animation-duration: 0.01ms !important",
    "animation-iteration-count: 1 !important",
    "transition-duration: 0.01ms !important",
    "scroll-behavior: auto !important",
  ])
    expect(fallback).toContain(rule);
  expect(fallback).toContain("*::before");
  expect(fallback).toContain("*::after");
});
it("scales the root relative to the browser default", () => {
  expect(css).toMatch(/data-font-scale="large"[^}]*font-size: 112.5%/);
  expect(css).toMatch(/data-font-scale="larger"[^}]*font-size: 125%/);
});
it("high contrast text, links and borders contrast with theme surfaces", () => {
  const tokens = readFileSync(path.resolve(__dirname, "../../src/styles/tokens.css"), "utf8");
  for (const [selector, surfaces] of [
    [':root[data-high-contrast="true"]', ["#ffffff", "#f8f9fa", "#e9ecef"]],
    [':root[data-high-contrast="true"][data-theme="dark"]', ["#181a1b", "#262b31", "#333a42"]],
  ] as const) {
    const block = tokens.slice(tokens.indexOf(selector)).split("}")[0]!;
    const value = (key: string) => block.match(new RegExp(key + ": (#[a-f0-9]{6})"))![1]!;
    for (const surface of surfaces) {
      for (const key of ["--wt-body-color", "--wt-secondary-color", "--wt-link-color"])
        expect(contrastRatio(value(key), surface), key).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(value("--wt-border-color"), surface)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(value("--wt-focus-color"), surface)).toBeGreaterThanOrEqual(3);
    }
  }
});
