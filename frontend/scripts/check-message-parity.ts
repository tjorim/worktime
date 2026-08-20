import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

type InlangSettings = {
  baseLocale: string;
  locales: string[];
  "plugin.inlang.messageFormat": {
    pathPattern: string;
  };
};

const root = process.cwd();

const settingsRaw = readFileSync(resolve(root, "project.inlang/settings.json"), "utf8");
const settings = JSON.parse(settingsRaw) as InlangSettings;

const { baseLocale, locales } = settings;
const pathPattern = settings["plugin.inlang.messageFormat"].pathPattern;

function loadMessageKeys(locale: string): Set<string> {
  const path = resolve(root, pathPattern.replace("{locale}", locale));
  const raw = readFileSync(path, "utf8");
  const messages = JSON.parse(raw) as Record<string, unknown>;
  return new Set(Object.keys(messages));
}

const messageFiles = readdirSync(resolve(root, "messages")).filter((file) =>
  file.endsWith(".json"),
);
const knownFiles = new Set(locales.map((locale) => `${locale}.json`));
const untrackedFiles = messageFiles.filter((file) => !knownFiles.has(file));

const baseKeys = loadMessageKeys(baseLocale);

const failures: string[] = [];

if (untrackedFiles.length > 0) {
  failures.push(
    `messages/ contains files not listed in project.inlang/settings.json locales: ${untrackedFiles.join(", ")}.`,
  );
}

for (const locale of locales) {
  if (locale === baseLocale) continue;

  const localeKeys = loadMessageKeys(locale);
  const missing = [...baseKeys].filter((key) => !localeKeys.has(key)).sort();
  const extra = [...localeKeys].filter((key) => !baseKeys.has(key)).sort();

  if (missing.length > 0) {
    failures.push(
      `${locale}.json is missing ${missing.length} key(s) present in ${baseLocale}.json:\n  - ${missing.join("\n  - ")}`,
    );
  }

  if (extra.length > 0) {
    failures.push(
      `${locale}.json has ${extra.length} extra key(s) not present in ${baseLocale}.json:\n  - ${extra.join("\n  - ")}`,
    );
  }
}

if (failures.length > 0) {
  process.stderr.write("❌ Message parity check failed:\n\n");
  failures.forEach((failure) => {
    process.stderr.write(`${failure}\n\n`);
  });
  process.exit(1);
}

process.stdout.write(
  `✅ Message parity check passed (${locales.length} locales, ${baseKeys.size} keys in ${baseLocale}.json).\n`,
);
