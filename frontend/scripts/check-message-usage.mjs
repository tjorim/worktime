import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseSync, Visitor } from "oxc-parser";

/** Return the base-locale catalogue keys that no application source file references. */
export function unusedMessages(root) {
  const sourceRoot = path.join(root, "src");
  const settings = JSON.parse(
    fs.readFileSync(path.join(root, "project.inlang/settings.json"), "utf8"),
  );
  const cataloguePath = settings["plugin.inlang.messageFormat"].pathPattern.replace(
    "{locale}",
    settings.baseLocale,
  );
  const catalogue = JSON.parse(fs.readFileSync(path.join(root, cataloguePath), "utf8"));
  const used = new Set();

  // Count application references. Generated exports and test expectations cannot keep a key alive.
  for (const entry of fs.readdirSync(sourceRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const [sourceDirectory] = path.relative(sourceRoot, file).split(path.sep);
    if (sourceDirectory === "paraglide" || sourceDirectory === "api-schema") continue;
    const source = fs.readFileSync(file, "utf8");
    if (!source.includes("paraglide")) continue;

    const { program, errors } = parseSync(file, source);
    if (errors.length) throw new Error(`${file}: ${errors[0].message}`);
    const namespaces = new Set();
    for (const node of program.body) {
      if (
        node.type !== "ImportDeclaration" ||
        node.importKind === "type" ||
        !/\/paraglide\/messages(?:\.js)?$/.test(node.source.value)
      )
        continue;

      for (const specifier of node.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);
        if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type")
          used.add(specifier.imported.name ?? specifier.imported.value);
      }
    }

    new Visitor({
      MemberExpression(node) {
        if (!namespaces.has(node.object.name)) return;
        const key = node.computed ? node.property.value : node.property.name;
        if (typeof key !== "string") {
          throw new Error(
            `${path.relative(root, file)}: use explicit message references in lookup maps.`,
          );
        }
        used.add(key);
      },
    }).visit(program);
  }

  return Object.keys(catalogue).filter((key) => key !== "$schema" && !used.has(key));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const unused = unusedMessages(fileURLToPath(new URL("../", import.meta.url)));
  if (unused.length) {
    process.stderr.write(`Unused message keys:\n${unused.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("All catalogue messages are referenced in frontend/src.\n");
  }
}
