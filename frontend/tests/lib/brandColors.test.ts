import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

/** Value of `--name` inside the first rule whose selector matches `selector`. */
function token(css: string, selector: RegExp, name: string): string {
  const block = css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, "m"));
  const value = block?.[1]?.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\b`))?.[1];
  if (!value) throw new Error(`token ${name} not found for ${selector}`);
  return value.toLowerCase();
}

const normalize = (hex: string) => {
  const lower = hex.toLowerCase();
  return lower.length === 4 ? `#${[...lower.slice(1)].map((c) => c + c).join("")}` : lower;
};

/**
 * The browser chrome colour is hand-written in several places that cannot import the CSS
 * tokens (the HTML shell, the web app manifest, the icon generator). This pins them to the
 * tokens so a palette change can't leave one of them behind.
 */
describe("brand colours outside the stylesheet", () => {
  const tokens = read("src/styles/tokens.css");
  const lightNavbar = normalize(token(tokens, /^:root/, "--wt-navbar-bg"));
  const darkNavbar = normalize(token(tokens, /^:root\[data-theme="dark"\]/, "--wt-navbar-bg"));
  const lightBody = normalize(token(tokens, /^:root/, "--wt-body-bg"));

  it("sets the browser theme-color to the navbar colour in each scheme", () => {
    const html = read("index.html");
    const meta = (scheme: string) =>
      html.match(
        new RegExp(
          `<meta\\s+name="theme-color"\\s+content="(#[0-9a-fA-F]+)"\\s+media="\\(prefers-color-scheme: ${scheme}\\)"`,
        ),
      )?.[1];

    expect(normalize(meta("light") ?? "")).toBe(lightNavbar);
    expect(normalize(meta("dark") ?? "")).toBe(darkNavbar);
  });

  it("uses the light navbar and body colours in the web app manifest", () => {
    const config = read("vite.config.ts");
    const manifestColor = (key: string) =>
      config.match(new RegExp(`${key}:\\s*"(#[0-9a-fA-F]+)"`))?.[1] ?? "";

    expect(normalize(manifestColor("theme_color"))).toBe(lightNavbar);
    expect(normalize(manifestColor("background_color"))).toBe(lightBody);
  });

  it("paints the generated icons with the primary colour", () => {
    const primary = normalize(token(tokens, /^:root/, "--wt-primary"));
    const generator = read("scripts/generate-icons.ts");

    expect(normalize(generator.match(/gradientEnd:\s*"(#[0-9a-fA-F]+)"/)?.[1] ?? "")).toBe(primary);
  });
});
