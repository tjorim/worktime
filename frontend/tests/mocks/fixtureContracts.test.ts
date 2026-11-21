import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

type Node = { type: string; start: number; end: number; [key: string]: unknown };
function visit(value: unknown, callback: (node: Node) => void) {
  if (!value || typeof value !== "object") return;
  const node = value as Node;
  if (node.type) callback(node);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => visit(item, callback));
    else if (child && typeof child === "object") visit(child, callback);
  }
}

function violations(source: string, filename = "fixture.ts") {
  const failures: string[] = [];
  const text = (node: unknown) => {
    const { start, end } = node as Node;
    return source.slice(start, end);
  };
  // A property's static name: `json`, `"json"` and `["json"]` all name the same key; `[json]` names nothing.
  const keyName = (property: Node) => {
    const key = property.key as Node & { name?: string; value?: unknown };
    if (key.type === "Identifier" && !property.computed) return key.name;
    if (key.type === "Literal" && typeof key.value === "string") return key.value;
    if (key.type === "TemplateLiteral" && (key.expressions as unknown[]).length === 0)
      return (key.quasis as { value: { cooked?: string } }[])[0]?.value.cooked ?? undefined;
    return undefined;
  };
  visit(parseSync(filename, source).program, (node) => {
    const args = node.arguments as Node[] | undefined;
    const callee = node.callee ? text(node.callee) : "";
    let invalid = false;
    if (node.type === "CallExpression") {
      if (["jsonResponse", "jsonBody", "routeJson", "HttpResponse.json"].includes(callee)) {
        invalid = !node.typeArguments;
      } else if (callee === "Response.json") {
        invalid = args?.[0]?.type !== "TSSatisfiesExpression";
      } else if (callee.endsWith(".fulfill") && args?.[0]?.type === "ObjectExpression") {
        // Helper-service responses are outside this backend's OpenAPI contract.
        const properties = args[0].properties as Node[];
        invalid =
          properties.some((p) => /^(json|body)$/.test(keyName(p) ?? "")) &&
          !text(node).includes("fixture-contract: hday-helper");
      }
    } else if (node.type === "NewExpression" && ["Response", "HttpResponse"].includes(callee)) {
      const first = args?.[0];
      if (first && text(first) !== "null") {
        invalid =
          !(
            first.type === "CallExpression" &&
            text(first.callee) === "JSON.stringify" &&
            (first.arguments as Node[])[0]?.type === "TSSatisfiesExpression"
          ) && !/fixture-contract: (error|sse|persistence|control)/.test(text(node));
      }
    } else if (node.type === "Property" && keyName(node) === "json") {
      const value = node.value as Node;
      if (value.type === "ArrowFunctionExpression" || value.type === "FunctionExpression") {
        const body = value.body as Node;
        invalid =
          body.type !== "CallExpression" ||
          !["jsonBody", "uncheckedBody"].includes(text(body.callee));
      }
    }
    if (invalid)
      failures.push(
        `${filename}:${source.slice(0, node.start).split("\n").length}: ${callee || "json double"}`,
      );
  });
  return failures;
}

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe("fixture contract enforcement", () => {
  it("rejects inferred successes through MSW, fetch doubles and browser fulfilment", () => {
    for (const source of [
      "HttpResponse.json({ anything: true })",
      "jsonResponse({ anything: true })",
      "jsonBody({ anything: true })",
      "routeJson({ anything: true })",
      "Response.json({ anything: true })",
      "new Response(JSON.stringify({ anything: true }))",
      'new Response("{}")',
      "new Response(arbitraryBody)",
      "new HttpResponse(JSON.stringify({ anything: true }))",
      "route.fulfill({ json: { anything: true } })",
      'route.fulfill({ ["json"]: { anything: true } })',
      'route.fulfill({ "json": { anything: true } })',
      "route.fulfill({ [`body`]: JSON.stringify({ anything: true }) })",
      'const response = { ok: true, ["json"]: async () => ({ anything: true }) }',
      "const response = { ok: true, json: async () => ({ anything: true }) }",
    ])
      expect(violations(source), source).toHaveLength(1);
  });

  it("accepts named contracts and explicit exceptions", () => {
    expect(violations("HttpResponse.json<SyncPushResponse>({ results: {} })")).toEqual([]);
    expect(
      violations(
        "const response = { json: async () => jsonBody<SyncPushResponse>({ results: {} }) }",
      ),
    ).toEqual([]);
    expect(violations('uncheckedJson("malformed", { deliberately: "incomplete" })')).toEqual([]);
    expect(violations("Response.json({ results: {} } satisfies SyncPushResponse)")).toEqual([]);
  });

  it("checks all shared, local and browser fixtures", () => {
    const failures = ["src/mocks", "tests", "e2e"]
      .flatMap(sources)
      .filter(
        (file) =>
          ![
            "src/mocks/response.ts",
            "tests/mocks/fixtureContracts.test.ts",
            "tests/utils/apiFixtures.ts",
          ].includes(file),
      )
      .flatMap((file) => violations(readFileSync(file, "utf8"), file));
    expect(failures).toEqual([]);
  });
});
