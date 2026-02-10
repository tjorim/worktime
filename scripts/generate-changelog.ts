#!/usr/bin/env tsx

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { changelogData, futurePlans } from "../src/data/changelog";

/**
 * Build the repository changelog content as a single Markdown string.
 *
 * Includes an "Unreleased" Future Enhancements section, per-version sections
 * (Added, Changed, Fixed, Planned, and optional technical details), a
 * "Version Planning" footer constructed from future plans, and Keep a Changelog
 * style comparison links for each version.
 *
 * @returns The complete changelog content formatted as Markdown
 */
function generateChangelog(): string {
  const header = `# Changelog

All notable changes to Worktime will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Future Enhancements

### Planned

${Object.entries(futurePlans)
  .filter(([key]) => key.startsWith("v"))
  .flatMap(([version, plan]) => {
    void version;
    return plan.features;
  })
  .map((feature) => `- ${feature}`)
  .join("\n")}

`;

  const versions = changelogData
    .map((version) => {
      let versionSection = `## [${version.version}] - ${version.date}\n\n`;

      if (version.added.length > 0) {
        versionSection += "### Added\n\n";
        version.added.forEach((item) => {
          versionSection += `- ${item}\n`;
        });
        versionSection += "\n";
      }

      if (version.changed.length > 0) {
        versionSection += "### Changed\n\n";
        version.changed.forEach((item) => {
          versionSection += `- ${item}\n`;
        });
        versionSection += "\n";
      }

      if (version.fixed.length > 0) {
        versionSection += "### Fixed\n\n";
        version.fixed.forEach((item) => {
          versionSection += `- ${item}\n`;
        });
        versionSection += "\n";
      }

      if (version.planned && version.planned.length > 0) {
        versionSection += "### Planned\n\n";
        version.planned.forEach((item) => {
          versionSection += `- ${item}\n`;
        });
        versionSection += "\n";
      }

      if (version.technicalDetails) {
        versionSection += `### ${version.technicalDetails.title}\n\n`;
        versionSection += `${version.technicalDetails.description}\n\n`;
      }

      return versionSection;
    })
    .join("");

  // Generate version links for Keep a Changelog format
  const versionLinks =
    changelogData.length === 0
      ? []
      : [
          `[Unreleased]: https://github.com/tjorim/worktime/compare/v${changelogData[0].version}...HEAD`,
          ...changelogData.slice(0, -1).map((version, index) => {
            const nextVersion = changelogData[index + 1];
            return `[${version.version}]: https://github.com/tjorim/worktime/compare/v${nextVersion.version}...v${version.version}`;
          }),
          // Last version compared to initial release
          `[${changelogData[changelogData.length - 1].version}]: https://github.com/tjorim/worktime/releases/tag/v${changelogData[changelogData.length - 1].version}`,
        ];

  const footer = `---

## Version Planning

${Object.entries(futurePlans)
  .filter(([key]) => key.startsWith("v"))
  .map(
    ([version, plan]) =>
      `### ${version} - ${plan.title}\n\n${plan.features.map((feature) => `- ${feature}`).join("\n")}`,
  )
  .join("\n\n")}

### ${futurePlans.future.title}\n\n${futurePlans.future.features.map((feature) => `- ${feature}`).join("\n")}

${versionLinks.join("\n")}
`;

  return header + versions + footer;
}

/**
 * Generate the project CHANGELOG.md file and persist it to the repository root.
 *
 * Builds the changelog content with `generateChangelog()`, writes it to
 * `CHANGELOG.md` in the current working directory using UTF‑8 encoding, and
 * prints a success message to stdout.
 */
function main() {
  const changelog = generateChangelog();
  const changelogPath = join(process.cwd(), "CHANGELOG.md");

  writeFileSync(changelogPath, changelog, "utf8");
  console.log("✅ CHANGELOG.md generated successfully");
}

// Run the generator
try {
  main();
} catch (error) {
  console.error("❌ Error generating changelog:", (error as Error).message);
  process.exit(1);
}
