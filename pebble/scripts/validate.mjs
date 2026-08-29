import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repoRoot = resolve(root, "..");
const requiredFiles = [
  "wscript",
  "src/c/mdbl.c",
  "src/embeddedjs/main.js",
  "src/embeddedjs/manifest.json",
  "src/pkjs/index.js",
  "scripts/mock-server.py",
  "scripts/check-screenshot.py",
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) throw new Error(`Missing Alloy file: ${file}`);
}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(
  readFileSync(resolve(root, "src/embeddedjs/manifest.json"), "utf8"),
);

if (pkg.pebble?.projectType !== "moddable") throw new Error("projectType must be moddable");
if (!pkg.dependencies?.["@moddable/pebbleproxy"]) {
  throw new Error("@moddable/pebbleproxy dependency is required");
}
if (JSON.stringify(pkg.pebble?.targetPlatforms) !== JSON.stringify(["emery", "gabbro"])) {
  throw new Error("Alloy targets must be emery and gabbro");
}
for (const key of ["API_BASE_URL", "AUTH_TOKEN"]) {
  if (!pkg.pebble?.messageKeys?.includes(key)) throw new Error(`Missing message key: ${key}`);
}
if (manifest.modules?.["*"] !== "./main") throw new Error("Embedded main module is missing");

const watchSource = readFileSync(resolve(root, "src/embeddedjs/main.js"), "utf8");
const phoneSource = readFileSync(resolve(root, "src/pkjs/index.js"), "utf8");
const pairingSource = readFileSync(
  resolve(repoRoot, "frontend/src/pages/PebblePairPage.tsx"),
  "utf8",
);
const tokenServiceSource = readFileSync(
  resolve(repoRoot, "backend/app/services/access_token_service.py"),
  "utf8",
);
const mockSource = readFileSync(resolve(root, "scripts/mock-server.py"), "utf8");
const routerSource = readFileSync(resolve(repoRoot, "backend/app/routers/pebble.py"), "utf8");

if (!watchSource.includes("fetch(")) throw new Error("Watch code must use Alloy fetch()");
// The SDK does not fall back to a nearby system-font size. An unsupported
// combination throws while constructing the Style and leaves a blank watchapp.
const gothicRegularSizes = new Set([9, 14, 18, 24, 28, 36]);
for (const match of watchSource.matchAll(/font:\s*"(?:(bold)\s+)?(\d+)px Gothic"/g)) {
  const [, weight, rawSize] = match;
  const size = Number(rawSize);
  const supported = weight ? size === 18 : gothicRegularSizes.has(size);
  if (!supported) {
    throw new Error(`Unsupported Pebble system font: ${weight ? "bold " : ""}${size}px Gothic`);
  }
}
// The watch, the mock backend used for emulator/hardware runs, and the router
// must agree on every path; a silent drift there is invisible until a device test.
for (const [path, routerPath] of [
  ["/api/pebble/dashboard", '"/dashboard"'],
  ["/api/pebble/actions/clock-in", '"/actions/clock-in"'],
  ["/api/pebble/actions/clock-out", '"/actions/clock-out"'],
]) {
  if (!watchSource.includes(path)) throw new Error(`Watch code is missing ${path}`);
  if (!mockSource.includes(path)) throw new Error(`Mock server is missing ${path}`);
  if (!routerSource.includes(routerPath)) {
    throw new Error(`Pebble router no longer declares ${routerPath}`);
  }
}
if (!watchSource.includes("localStorage.setItem(SNAPSHOT_KEY") || !watchSource.includes("loadSnapshot(")) {
  throw new Error("Watch code must persist and restore the offline dashboard snapshot");
}
if (!watchSource.includes("runExclusive(toggleClock)")) {
  throw new Error("Clock actions must go through the exclusive-action guard");
}
if (!watchSource.includes('from "pebble/vibes"') || !watchSource.includes("Vibes.doublePulse()")) {
  throw new Error("Watch code must vibrate for the planned-task-starting-soon reminder");
}
if (!phoneSource.includes("@moddable/pebbleproxy")) {
  throw new Error("Phone code must initialize the official Alloy network proxy");
}
if (/,\s*[)\]]/.test(phoneSource)) {
  throw new Error("Trailing comma in src/pkjs/index.js: the SDK's PKJS bundler cannot parse it");
}
if (/Pebble\.sendAppMessage\s*\(/.test(phoneSource)) {
  throw new Error("Use moddableProxy.sendAppMessage() so sends are queued behind proxy traffic");
}
if (!phoneSource.includes("/pebble-pair") || !pairingSource.includes("pebblejs://close")) {
  throw new Error("Phone and web code must use the authenticated Pebble pairing flow");
}
for (const scope of ["pebble:read", "pebble:write"]) {
  if (!tokenServiceSource.includes(scope)) {
    throw new Error(`Pairing token must include required scope: ${scope}`);
  }
}

for (const file of ["src/embeddedjs/main.js", "src/pkjs/index.js"]) {
  execFileSync(process.execPath, ["--check", resolve(root, file)], { stdio: "inherit" });
}

console.log(`Validated ${pkg.pebble.displayName} Alloy package`);
