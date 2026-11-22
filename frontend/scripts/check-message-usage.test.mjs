import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { unusedMessages } from "./check-message-usage.mjs";

const roots = [];

function project(catalogue, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "message-usage-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "project.inlang"));
  fs.mkdirSync(path.join(root, "messages"));
  fs.writeFileSync(
    path.join(root, "project.inlang/settings.json"),
    JSON.stringify({
      baseLocale: "en",
      locales: ["en"],
      "plugin.inlang.messageFormat": { pathPattern: "./messages/{locale}.json" },
    }),
  );
  fs.writeFileSync(path.join(root, "messages/en.json"), JSON.stringify(catalogue));
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, "src", file)), { recursive: true });
    fs.writeFileSync(path.join(root, "src", file), source);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it("counts namespace imports, renamed named imports and string-literal lookups", () => {
  const root = project(
    { $schema: "x", a: "A", b: "B", c: "C", d: "D" },
    {
      "one.ts": 'import * as m from "@/paraglide/messages";\nm.a(); m["b"]();',
      "two.ts": 'import { c as renamed } from "@/paraglide/messages.js";\nrenamed();',
    },
  );
  expect(unusedMessages(root)).toEqual(["d"]);
});

it("ignores type-only imports, generated output, unrelated objects and files without Paraglide", () => {
  const root = project(
    { $schema: "x", a: "A", b: "B", c: "C" },
    {
      "type.ts": 'import type { a } from "@/paraglide/messages";',
      "paraglide/generated.ts": 'import * as m from "@/paraglide/messages";\nm.b();',
      "other.ts": "const m = { c: () => 1 };\nm.c();",
    },
  );
  expect(unusedMessages(root)).toEqual(["a", "b", "c"]);
});

it("rejects computed lookups that cannot be resolved statically", () => {
  const root = project(
    { a: "A" },
    { "dynamic.ts": 'import * as m from "@/paraglide/messages";\nm[name]();' },
  );
  expect(() => unusedMessages(root)).toThrow(/explicit message references/);
});
