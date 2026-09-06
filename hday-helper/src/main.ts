/**
 * Worktime .hday Helper — lightweight local file server
 *
 * Reads and writes `.hday` files from a local or network-share directory and
 * exposes them as JSON over HTTP.  Intentionally minimal: no database, no OIDC,
 * no authentication — designed to be compiled to a single Windows EXE with
 * `bun build --compile`.
 *
 * ## Configuration (env vars, also loadable via a `.env` file)
 *
 * | Variable       | Default               | Description                         |
 * |----------------|-----------------------|-------------------------------------|
 * | SHARE_DIR      | ./hday_files          | Directory that holds `*.hday` files |
 * | PORT           | 8080                  | HTTP port to listen on              |
 * | HOST           | 127.0.0.1             | Bind address                        |
 * | CORS_ORIGINS   | http://localhost:5173 | Comma-separated allowed origins     |
 *
 * ## API
 *
 * GET  /health              — health, own version, and share-directory status
 * GET  /hday/:username      — read a user's .hday file (always includes parsed events)
 * PUT  /hday/:username      — create or update a user's .hday file
 * GET  /hday/:username/events — SSE stream: notifies when that user's file changes on disk
 * GET  /team/:teamId        — read team config + member list
 * GET  /team/:teamId/hday   — read aggregated team .hday files (always includes parsed events)
 * GET  /settings            — HTML form to view/edit SHARE_DIR/PORT/HOST/CORS_ORIGINS
 * POST /settings            — rewrite .env with the submitted values and restart
 * GET  /logs                — recent log lines (plain text, or an HTML viewer for a browser)
 * GET  /logs/events         — SSE stream: new log lines as they're written
 */

import { createHash } from "crypto";
import {
  accessSync,
  appendFileSync,
  constants,
  existsSync,
  mkdirSync,
  renameSync,
  readFileSync,
  statSync,
  unlinkSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "fs";
import { readFile } from "fs/promises";
import { networkInterfaces } from "os";
import { basename, join, resolve, sep } from "path";
// These imports use relative paths to reuse the frontend .hday parser directly.
// `bun build --compile` bundles all resolved modules into the output binary, so the
// relative paths work at build time even though the EXE has no filesystem access.
import { parseHday } from "../../frontend/src/lib/hday/parser";
import { toLine } from "../../frontend/src/lib/hday/serializer";
import type { HdayEvent } from "../../frontend/src/lib/hday/types";
// `with { type: "text" }` embeds the file's contents as a string constant at bundle
// time (verified to survive `bun build --compile` too), so the compiled EXE reports
// the version of the source tree it was built from, not whatever's on the host disk.
import VERSION_FILE from "../../VERSION" with { type: "text" };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HELPER_VERSION = VERSION_FILE.trim();
const SHARE_DIR = resolve(process.env.SHARE_DIR ?? "./hday_files");
const PORT = parseInt(process.env.PORT || "8080", 10) || 8080;
const HOST = process.env.HOST || "127.0.0.1";
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024; // 10 MiB
const MAX_SETTINGS_BODY_BYTES = 64 * 1024; // form submissions are tiny; this is generous
const ENV_FILE_PATH = join(process.cwd(), ".env");
const ENV_KEYS = ["SHARE_DIR", "PORT", "HOST", "CORS_ORIGINS"] as const;
type EnvKey = (typeof ENV_KEYS)[number];
// Set by tests only, so a valid POST /settings can be exercised over real HTTP
// without the test process detaching a second, untracked OS process — see
// hday-helper/tests/helper.test.ts's "GET/POST /settings" suite.
const SKIP_RESTART_FOR_TESTS = process.env.HDAY_HELPER_SKIP_RESTART_FOR_TESTS === "1";

// ---------------------------------------------------------------------------
// Per-user write mutex — serializes concurrent writes to the same .hday file
// ---------------------------------------------------------------------------

const writeLocks = new Map<string, Promise<unknown>>();

function withUserLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(filePath) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Non-rejecting tail used as chain anchor; pruned from the map on completion
  // to prevent unbounded growth. Guard ensures we don't prune a newer entry.
  let tail: Promise<unknown>;
  const cleanup = () => { if (writeLocks.get(filePath) === tail) writeLocks.delete(filePath); };
  tail = next.then(cleanup, cleanup);
  writeLocks.set(filePath, tail);
  return next;
}

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

class HdayFileNotFoundError extends Error {
  constructor(username: string) {
    super(`File not found for user: ${username}`);
    this.name = "HdayFileNotFoundError";
  }
}

class HdayConflictError extends Error {
  constructor() {
    super("Conflict: file has changed since last read");
    this.name = "HdayConflictError";
  }
}

class ShareNotAccessibleError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ShareNotAccessibleError";
  }
}

class TeamNotFoundError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "TeamNotFoundError";
  }
}

class PayloadTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the maximum allowed size");
    this.name = "PayloadTooLargeError";
  }
}

// ---------------------------------------------------------------------------
// Etag helpers
// ---------------------------------------------------------------------------

function computeEtag(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Username sanitization + path resolution
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function getHdayPath(username: string): string {
  if (!USERNAME_RE.test(username) || username.includes("..")) {
    throw new RangeError("Invalid username format");
  }

  // basename() acts as an additional path-injection sanitizer
  const safeFilename = basename(`${username}.hday`);

  const resolvedShare = resolve(SHARE_DIR);
  const filePath = resolve(join(resolvedShare, safeFilename));

  // Ensure the resolved path stays inside the share directory
  if (!filePath.startsWith(resolvedShare.endsWith(sep) ? resolvedShare : resolvedShare + sep)) {
    throw new RangeError("Invalid username format");
  }

  return filePath;
}

// ---------------------------------------------------------------------------
// Team path helpers — config files live in {SHARE_DIR}/config/
// ---------------------------------------------------------------------------

function getConfigDir(): string {
  return resolve(join(SHARE_DIR, "config"));
}

function getTeamFilePath(teamId: string, ext: string): string {
  if (!USERNAME_RE.test(teamId) || teamId.includes("..")) {
    throw new RangeError("Invalid team_id format");
  }
  const safeFilename = basename(`${teamId}.${ext}`);
  const configDir = getConfigDir();
  const filePath = resolve(join(configDir, safeFilename));
  if (!filePath.startsWith(configDir.endsWith(sep) ? configDir : configDir + sep)) {
    throw new RangeError("Invalid team_id format");
  }
  return filePath;
}

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

function checkShareAccessible(): void {
  try {
    const stat = statSync(SHARE_DIR);
    if (!stat.isDirectory()) {
      throw new ShareNotAccessibleError("Share path is not a directory");
    }
    accessSync(SHARE_DIR, constants.R_OK | constants.W_OK);
  } catch (err) {
    if (err instanceof ShareNotAccessibleError) throw err;
    throw new ShareNotAccessibleError(
      `Share directory not accessible: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function isShareAccessible(): boolean {
  try {
    checkShareAccessible();
    return true;
  } catch {
    return false;
  }
}

function readHdayFile(username: string): { raw: string; etag: string } {
  checkShareAccessible();

  const filePath = getHdayPath(username);

  if (!existsSync(filePath)) {
    throw new HdayFileNotFoundError(username);
  }

  const raw = readFileSync(filePath, "utf-8");
  return { raw, etag: computeEtag(raw) };
}

async function readHdayFileAsync(username: string): Promise<{ raw: string; etag: string }> {
  checkShareAccessible();

  const filePath = getHdayPath(username);

  try {
    const raw = await readFile(filePath, "utf-8");
    return { raw, etag: computeEtag(raw) };
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      throw new HdayFileNotFoundError(username);
    }
    throw err;
  }
}

function writeHdayFile(username: string, content: string, expectedEtag: string | null): Promise<string> {
  checkShareAccessible();

  const filePath = getHdayPath(username);
  return withUserLock(filePath, async () => {
    const fileExists = existsSync(filePath);

    // Conflict detection (inside lock so ETag check and write are atomic)
    if (expectedEtag === null) {
      // No etag means "create new file" — must not already exist.
      if (fileExists) {
        throw new HdayConflictError();
      }
    } else {
      if (!fileExists) {
        // Client sent an etag but the file no longer exists — precondition failure.
        throw new HdayConflictError();
      }
      const currentRaw = readFileSync(filePath, "utf-8");
      if (computeEtag(currentRaw) !== expectedEtag) {
        throw new HdayConflictError();
      }
    }

    // Unique temp path prevents concurrent requests from clobbering each other's tmp file
    const tmpPath = `${filePath}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      writeFileSync(tmpPath, content, "utf-8");
      renameSync(tmpPath, filePath);
    } finally {
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch {
        // ignore cleanup failure
      }
    }

    return computeEtag(content);
  });
}

// ---------------------------------------------------------------------------
// Change notifications — SSE stream for GET /hday/:username/events
//
// Mirrors the main app's own notify-then-pull SSE contract (`sync_changed`
// over `GET /api/sync/events`): the event is only a freshness hint carrying
// the file's current etag, not the file content itself. Clients that already
// know that etag (e.g. because they just pushed it themselves) can ignore
// the notification instead of re-fetching.
//
// A single `fs.watch` on SHARE_DIR is shared across every connected client —
// not one watcher per connection — created lazily on the first subscriber
// and closed once the last one disconnects.
// ---------------------------------------------------------------------------

const HDAY_SSE_KEEPALIVE_MS = 15_000;
// A single write (temp file + rename, see writeHdayFile) fires more than one
// raw fs.watch event for the same logical change; debounce them into one
// broadcast instead of reading the file and notifying twice.
const HDAY_SSE_DEBOUNCE_MS = 250;
const SSE_ENCODER = new TextEncoder();

interface HdaySseSubscriber {
  controller: ReadableStreamDefaultController<Uint8Array>;
  /** Last etag sent to this subscriber, so directory-watch noise that doesn't
   * actually change the file's content doesn't trigger a redundant event.
   * `null` is a real, distinct value here (the file was deleted) — `hasSent`
   * is what distinguishes "haven't notified yet" from "last notified: gone",
   * so a fresh subscriber isn't mistaken for one that already saw a delete. */
  lastSentEtag: string | null;
  hasSent: boolean;
}

const hdaySseSubscribers = new Map<string, Set<HdaySseSubscriber>>();
const hdaySsePendingChecks = new Map<string, ReturnType<typeof setTimeout>>();
let shareDirWatcher: FSWatcher | null = null;

function formatSseEvent(event: string, data: unknown): Uint8Array {
  return SSE_ENCODER.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcastHdayChanged(username: string): void {
  const subscribers = hdaySseSubscribers.get(username);
  if (!subscribers || subscribers.size === 0) return;

  let etag: string | null;
  try {
    etag = readHdayFile(username).etag;
  } catch {
    // Deleted, or the share briefly dropped — either way there's no current
    // etag to report; a null etag still tells the client "something changed".
    etag = null;
  }

  const payload = formatSseEvent("hday_changed", { type: "hday_changed", username, etag });
  for (const subscriber of subscribers) {
    if (subscriber.hasSent && subscriber.lastSentEtag === etag) continue;
    subscriber.lastSentEtag = etag;
    subscriber.hasSent = true;
    try {
      subscriber.controller.enqueue(payload);
    } catch {
      // Client disconnected between the watch event and this broadcast;
      // the stream's cancel() callback (below) removes it from the map.
    }
  }
}

function scheduleHdayChangeCheck(username: string): void {
  const existing = hdaySsePendingChecks.get(username);
  if (existing) clearTimeout(existing);
  hdaySsePendingChecks.set(
    username,
    setTimeout(() => {
      hdaySsePendingChecks.delete(username);
      broadcastHdayChanged(username);
    }, HDAY_SSE_DEBOUNCE_MS),
  );
}

// writeHdayFile() writes to a temp file and rename()s it over the target
// (see its comment for why). A rename between two names in the same watched
// directory only surfaces as a single fs.watch event, and which of the two
// names it reports is runtime/platform-dependent — observed as the temp
// file's own name (not the target's) under Bun on Linux. Recognizing that
// pattern too means the watcher still fires from this server's own writes,
// not just from a direct external overwrite of "<username>.hday".
const TEMP_HDAY_FILENAME_RE = /^(.+)\.hday\.[^.]+\.tmp$/;

function usernameFromWatchedFilename(name: string): string | null {
  if (name.endsWith(".hday")) return name.slice(0, -".hday".length);
  const tmpMatch = name.match(TEMP_HDAY_FILENAME_RE);
  return tmpMatch ? tmpMatch[1]! : null;
}

function ensureShareDirWatcherStarted(): void {
  if (shareDirWatcher) return;
  try {
    shareDirWatcher = watch(SHARE_DIR, (_eventType, filename) => {
      if (!filename) return; // not every platform/event supplies one
      const username = usernameFromWatchedFilename(filename.toString());
      if (username && hdaySseSubscribers.has(username)) {
        scheduleHdayChangeCheck(username);
      }
    });
  } catch (err) {
    console.error("Failed to watch share directory for .hday changes:", err);
  }
}

function stopShareDirWatcherIfIdle(): void {
  if (hdaySseSubscribers.size === 0 && shareDirWatcher) {
    shareDirWatcher.close();
    shareDirWatcher = null;
  }
}

/** Register a subscriber for one user's change notifications; returns an unsubscribe function. */
function subscribeToHdayChanges(
  username: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
): () => void {
  let subscribers = hdaySseSubscribers.get(username);
  if (!subscribers) {
    subscribers = new Set();
    hdaySseSubscribers.set(username, subscribers);
  }
  const subscriber: HdaySseSubscriber = { controller, lastSentEtag: null, hasSent: false };
  subscribers.add(subscriber);
  ensureShareDirWatcherStarted();

  return () => {
    subscribers!.delete(subscriber);
    if (subscribers!.size === 0) {
      hdaySseSubscribers.delete(username);
    }
    stopShareDirWatcherIfIdle();
  };
}

// ---------------------------------------------------------------------------
// Logging — fans each per-request log line out to the console (as before),
// an in-memory ring buffer (backs GET /logs' initial view and survives
// nothing — it's just cheap to serve from), and a size-capped rotating file
// on disk (survives a restart or crash even with no console attached).
// ---------------------------------------------------------------------------

const LOG_RING_BUFFER_SIZE = 500;
// Unauthenticated and reachable over the LAN (HOST=0.0.0.0) — cap concurrent
// /logs/events connections so opening many of them can't exhaust file
// descriptors/memory (each holds an open controller and a keepalive timer).
const MAX_LOG_SSE_SUBSCRIBERS = 50;
const LOG_FILE_PATH = join(process.cwd(), "hday-helper.log");
const LOG_FILE_BACKUP_PATH = `${LOG_FILE_PATH}.1`;
const LOG_FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB

const logRingBuffer: string[] = [];
const logSseSubscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();

function broadcastLogLine(line: string): void {
  if (logSseSubscribers.size === 0) return;
  const payload = formatSseEvent("log_line", { type: "log_line", line });
  for (const controller of logSseSubscribers) {
    try {
      controller.enqueue(payload);
    } catch {
      // Client disconnected between the log call and this broadcast; its
      // stream's cancel() callback removes it from the set.
    }
  }
}

function appendToLogFile(line: string): void {
  try {
    const stat = existsSync(LOG_FILE_PATH) ? statSync(LOG_FILE_PATH) : null;
    if (stat && stat.size + line.length + 1 > LOG_FILE_MAX_BYTES) {
      // Best-effort rotation: keep exactly one backup, overwriting any older one.
      try {
        renameSync(LOG_FILE_PATH, LOG_FILE_BACKUP_PATH);
      } catch {
        // Backup path unrenameable (e.g. held open on Windows) — truncate in
        // place instead. Losing this batch of history is better than leaving
        // the cap unenforced: every future write would otherwise re-attempt
        // (and re-fail) the same rotation and grow the file without bound.
        try {
          writeFileSync(LOG_FILE_PATH, "", "utf-8");
        } catch {
          // Nothing more we can do; fall through and let the append below run.
        }
      }
    }
    appendFileSync(LOG_FILE_PATH, line + "\n", "utf-8");
  } catch (err) {
    // Logging must never take down request handling (disk full, permissions, ...).
    console.error("Failed to write hday-helper.log:", err);
  }
}

// Pushes an already-formatted line to the ring buffer, log file, and any
// connected /logs/events subscribers — the three sinks reachable over HTTP.
function recordLogLine(line: string): void {
  logRingBuffer.push(line);
  if (logRingBuffer.length > LOG_RING_BUFFER_SIZE) logRingBuffer.shift();
  appendToLogFile(line);
  broadcastLogLine(line);
}

function logLine(message: string, isError = false): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  if (isError) console.error(line);
  else console.log(line);
  recordLogLine(line);
}

// ---------------------------------------------------------------------------
// Settings — GET/POST /settings rewrites .env from scratch with just the four
// known keys, then triggers a full self-restart so PORT/HOST changes take
// effect (rather than distinguishing which settings are hot-reloadable).
// ---------------------------------------------------------------------------

interface SettingsFormValues {
  SHARE_DIR: string;
  HOST: string;
  PORT: string;
  CORS_ORIGINS: string;
}

function writeEnvFile(values: Record<EnvKey, string>): void {
  // Bun's .env loader expands unescaped $NAME references when it next reads
  // this file — a SHARE_DIR like "/mnt/Q$/shared" would silently turn into
  // something else after the very restart this save triggers. "\$" is Bun's
  // own escape for a literal dollar sign.
  //
  // Deliberately not also escaping literal backslashes: Bun's .env parser
  // has no general "\\" -> "\" unescape, it *only* special-cases a backslash
  // directly before "$". Doubling every backslash here would leave a stray
  // literal backslash in front of any plain one on reload — corrupting every
  // ordinary Windows/UNC path (e.g. "\\server\C$\worktime", where "C$" is a
  // literal Windows admin share name, is expected input). Prefixing exactly
  // one "\" before each "$" round-trips correctly regardless of how many
  // backslashes already precede it, since Bun's escape only ever consumes
  // the single backslash immediately adjacent to the "$" — see the restart
  // test covering a backslash-adjacent "$" in helper.test.ts.
  const lines = ENV_KEYS.map((key) => `${key}=${values[key].replace(/\$/g, "\\$")}`);
  writeFileSync(ENV_FILE_PATH, lines.join("\n") + "\n", "utf-8");
}

function validateSettingsForm(values: SettingsFormValues): string | null {
  // writeEnvFile() interpolates each value directly into a "KEY=value" .env
  // line; an embedded \r or \n would inject extra lines that a dotenv parser
  // reads as additional (or duplicate, shadowing) keys.
  for (const key of ENV_KEYS) {
    if (/[\r\n\0]/.test(values[key])) {
      return `${key} must not contain line breaks or null characters.`;
    }
  }
  if (!values.SHARE_DIR.trim()) return "SHARE_DIR must not be empty.";
  if (!values.HOST.trim()) return "HOST must not be empty.";
  const port = Number(values.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "PORT must be a whole number between 1 and 65535.";
  }
  return null;
}

// CSRF defense for POST /settings: browsers attach an `Origin` header to
// cross-origin POSTs (form submissions included) even though this endpoint
// has no CORS preflight to gate them — without this check, any website the
// user's browser visits could silently reconfigure and restart the helper.
// A same-origin request either omits Origin (older browsers, curl, direct
// tools) or sends one matching Host; only a present-and-mismatched Origin
// means cross-origin, so that's the only case rejected.
function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (origin === null) return true;
  const host = req.headers.get("Host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Verifying a HOST/PORT change can actually bind *before* the current (known
// good) server is stopped for it — otherwise an unbindable value would pass
// validation, get written to .env, and strand the helper: the old server is
// already gone, the detached replacement fails to start, and every future
// launch keeps loading the same bad .env. An unchanged HOST/PORT is skipped
// since it's already proven bindable — trying to rebind it here would always
// collide with the currently running server.
//
// Probing the exact (host, port) pair directly would falsely collide with
// our own still-running listener only when HOST changes, PORT does not, and
// one of the two addresses is the 0.0.0.0 wildcard (which covers every
// interface, including whatever specific address the other one names) — that
// combination is probed on an OS-picked port (port: 0) instead, which only
// proves the new host is bindable *somewhere*, not on the exact target port.
// Every other change (a different PORT is always a different port than the
// one we hold; two distinct non-wildcard hosts never overlap) is probed on
// the exact pair, which also catches an unrelated process already squatting
// on it — something the weaker port-0 probe can't detect. That residual gap
// (0.0.0.0 involved, same PORT) is tracked in #1295: closing it fully means
// not stopping the current server until a replacement has confirmed binding,
// a materially bigger change than a settings-validation fix.
async function checkAddressBindable(host: string, port: number): Promise<string | null> {
  if (host === HOST && port === PORT) return null;

  const couldCollideWithOurListener =
    host !== HOST && port === PORT && (host === "0.0.0.0" || HOST === "0.0.0.0");

  try {
    if (couldCollideWithOurListener) {
      const hostProbe = Bun.serve({ hostname: host, port: 0, fetch: () => new Response(null, { status: 204 }) });
      await hostProbe.stop();
    } else {
      const probe = Bun.serve({ hostname: host, port, fetch: () => new Response(null, { status: 204 }) });
      await probe.stop();
    }
    return null;
  } catch (err) {
    return `Could not bind to ${host}:${port} (${err instanceof Error ? err.message : String(err)}). Settings were not saved.`;
  }
}

// Verifying a candidate SHARE_DIR is usable *before* committing to a restart
// — same rationale as checkAddressBindable for HOST/PORT: catch a bad value
// here, with the current (working) instance still up to report it, rather
// than only discovering it via a 503 from /health after restarting into it.
// A directory with nothing in it yet is fine — that's how a fresh or newly
// emptied share gets populated — so this only checks the path can actually
// be created/read/written, not that it already contains any files.
function checkShareDirUsable(dir: string): string | null {
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!statSync(dir).isDirectory()) {
      return `SHARE_DIR "${dir}" is not a directory. Settings were not saved.`;
    }
    accessSync(dir, constants.R_OK | constants.W_OK);
    return null;
  } catch (err) {
    return `SHARE_DIR "${dir}" is not accessible (${err instanceof Error ? err.message : String(err)}). Settings were not saved.`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PAGE_STYLE = `
  body { font: 14px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
  nav { margin-bottom: 1.5rem; }
  nav a { margin-right: 1rem; }
  label { display: block; margin-bottom: 1rem; }
  input { display: block; width: 100%; box-sizing: border-box; padding: 0.4rem; margin-top: 0.25rem; }
  button { padding: 0.5rem 1rem; }
  .error { color: #b00020; }
  .warn { color: #8a6100; }
  .helper-urls { background: #f0f4f8; border-radius: 4px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; }
  .helper-urls ul { list-style: none; padding: 0; margin: 0.5rem 0 0; }
  .helper-urls li { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
  .helper-urls code { background: #fff; border: 1px solid #ccc; border-radius: 3px; padding: 0.15rem 0.4rem; }
  .helper-urls button { padding: 0.15rem 0.6rem; }
`;

// An IPv6 literal must be bracketed inside a URL ("http://[::1]:8080") —
// its own colons would otherwise be indistinguishable from the URL's
// port separator. IPv4 addresses and hostnames never contain a colon.
function formatHostForUrl(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

// The value pasted into Worktime's Developer Options has to be something a
// browser/fetch can actually dial — "0.0.0.0" itself isn't (it means "every
// interface", not an address a client connects to). When bound that way,
// offer loopback (for Worktime running on this same machine) plus every
// non-internal IPv4 address (other machines on the LAN, the actual reason to
// bind 0.0.0.0 in the first place) instead of the raw HOST value. Any other
// HOST is already a concrete, dialable address, so it's used as-is.
function candidateHelperUrls(host: string, port: number): string[] {
  if (host !== "0.0.0.0") return [`http://${formatHostForUrl(host)}:${port}`];

  const urls = [`http://127.0.0.1:${port}`];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        urls.push(`http://${addr.address}:${port}`);
      }
    }
  }
  return urls;
}

function renderHelperUrls(): string {
  const urls = candidateHelperUrls(HOST, PORT);
  return `<div class="helper-urls">
  <p>Paste one of these into Worktime → Settings → About → Developer Options as the <code>.hday</code> helper URL:</p>
  <ul>
    ${urls
      .map(
        (url) =>
          `<li><code>${escapeHtml(url)}</code><button type="button" class="copy-btn" data-url="${escapeHtml(url)}">Copy</button></li>`,
      )
      .join("\n    ")}
  </ul>
</div>
<script>
(function () {
  // navigator.clipboard requires a secure context (HTTPS, or the
  // localhost/127.0.0.1 origin) — a LAN address loaded over plain HTTP,
  // exactly the case these 0.0.0.0-derived URLs exist for, doesn't qualify.
  // Fall back to the legacy execCommand("copy") technique there.
  function copyText(text) {
    if (window.isSecureContext && navigator.clipboard) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
    return Promise.resolve();
  }

  document.querySelectorAll(".copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      copyText(btn.dataset.url).then(function () {
        var original = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = original; }, 1500);
      });
    });
  });
})();
</script>`;
}

function renderSettingsPage(values: SettingsFormValues, error: string | null): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>.hday Helper — Settings</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<nav><a href="/settings">Settings</a><a href="/logs">Logs</a></nav>
<h1>.hday Helper Settings</h1>
${renderHelperUrls()}
<p class="warn">Saving rewrites <code>.env</code> with just these four keys — any other lines or
comments in your existing <code>.env</code> file will not be preserved. Saving restarts the helper
immediately.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
<form method="POST" action="/settings">
  <label>SHARE_DIR
    <input type="text" name="SHARE_DIR" value="${escapeHtml(values.SHARE_DIR)}" required>
  </label>
  <label>HOST
    <input type="text" name="HOST" value="${escapeHtml(values.HOST)}" required>
  </label>
  <label>PORT
    <input type="number" name="PORT" min="1" max="65535" value="${escapeHtml(values.PORT)}" required>
  </label>
  <label>CORS_ORIGINS
    <input type="text" name="CORS_ORIGINS" value="${escapeHtml(values.CORS_ORIGINS)}">
  </label>
  <button type="submit">Save &amp; restart</button>
</form>
</body>
</html>`;
}

function renderRestartingPage(newPort: number): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>.hday Helper — Restarting…</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<h1>Restarting…</h1>
<p id="status">Settings saved. Waiting for the helper to come back up…</p>
<script>
(function () {
  // location.hostname reports an IPv6 literal unbracketed (e.g. "::1"), which
  // must be re-bracketed to build a valid URL — same fix as formatHostForUrl().
  var hostname = location.hostname.indexOf(":") !== -1 ? "[" + location.hostname + "]" : location.hostname;
  var newOrigin = "http://" + hostname + ":" + ${JSON.stringify(newPort)};
  var deadline = Date.now() + 20000;
  function poll() {
    fetch(newOrigin + "/health", { mode: "no-cors", cache: "no-store" })
      .then(function () { location.href = newOrigin + "/settings"; })
      .catch(function () {
        if (Date.now() > deadline) {
          document.getElementById("status").textContent =
            "Still not reachable at " + newOrigin + " — check the port isn't blocked and reload manually.";
          return;
        }
        setTimeout(poll, 500);
      });
  }
  setTimeout(poll, 1000);
})();
</script>
</body>
</html>`;
}

function renderLogsPage(initialLines: string[]): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>.hday Helper — Logs</title>
<style>
  body { font: 13px/1.5 ui-monospace, monospace; margin: 0; padding: 1rem; background: #111; color: #ddd; }
  nav { margin-bottom: 1rem; font-family: system-ui, sans-serif; }
  nav a { color: #8ab4f8; margin-right: 1rem; }
  pre { white-space: pre-wrap; word-break: break-all; margin: 0; }
</style>
</head>
<body>
<nav><a href="/settings">Settings</a><a href="/logs">Logs</a></nav>
<pre id="log">${escapeHtml(initialLines.join("\n"))}</pre>
<script>
(function () {
  var pre = document.getElementById("log");
  var es = new EventSource("/logs/events");
  es.addEventListener("log_line", function (e) {
    var data = JSON.parse(e.data);
    pre.textContent += (pre.textContent ? "\\n" : "") + data.line;
    window.scrollTo(0, document.body.scrollHeight);
  });
})();
</script>
</body>
</html>`;
}

let httpServer: ReturnType<typeof Bun.serve> | null = null; // assigned once at bootstrap

async function restartWithNewSettings(): Promise<void> {
  logLine("Settings changed via /settings — restarting to apply new configuration");
  try {
    await httpServer?.stop();
  } catch (err) {
    logLine(`Failed to stop server cleanly before restart: ${err instanceof Error ? err.message : String(err)}`, true);
  }

  // Strip the keys we just rewrote in .env from the child's inherited env so
  // it re-reads them from disk instead of keeping this process's now-stale
  // values — Bun's built-in .env loading does not override already-set
  // environment variables.
  const childEnv = { ...process.env };
  for (const key of ENV_KEYS) delete childEnv[key];

  try {
    const child = Bun.spawn([process.execPath, ...process.argv.slice(1)], {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    });
    child.unref();
  } catch (err) {
    logLine(`Failed to spawn replacement process: ${err instanceof Error ? err.message : String(err)}`, true);
  }

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function eventsToText(events: HdayEvent[]): string {
  return events.map((e) => toLine(e)).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Team types
// ---------------------------------------------------------------------------

interface TeamMember {
  username: string;
  display_name: string;
}

interface TeamSection {
  title: string | null;
  members: TeamMember[];
}

interface TeamMemberHdayData {
  username: string;
  display_name: string;
  raw: string;
  events: HdayEvent[];
  etag: string | null;
}

interface TeamSectionHdayData {
  title: string | null;
  members: TeamMemberHdayData[];
}

// ---------------------------------------------------------------------------
// Team file parsers
// ---------------------------------------------------------------------------

function parseTeamConfig(teamId: string): string {
  checkShareAccessible();

  const configDir = getConfigDir();
  if (!existsSync(configDir) || !statSync(configDir).isDirectory()) {
    throw new TeamNotFoundError("Config directory not found");
  }

  const configPath = getTeamFilePath(teamId, "conf");
  if (!existsSync(configPath)) {
    throw new TeamNotFoundError("Team configuration not found");
  }

  const content = readFileSync(configPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const eqIdx = trimmed.indexOf("=");
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key === "groupname" && value) return value;
  }

  throw new TeamNotFoundError("groupname field not found in config file");
}

interface ParsedPeople {
  sections: TeamSection[];
  members: TeamMember[];
}

function parsePeopleFile(teamId: string): ParsedPeople {
  checkShareAccessible();

  const peoplePath = getTeamFilePath(teamId, "people");
  if (!existsSync(peoplePath)) {
    throw new TeamNotFoundError("Team members file not found");
  }

  const content = readFileSync(peoplePath, "utf-8");
  const sections: TeamSection[] = [];
  const allMembers: TeamMember[] = [];
  let currentTitle: string | null = null;
  let currentMembers: TeamMember[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(/^<h([1-6])\b[^>]*>(.*)<\/h\1>\s*$/i);
    if (headingMatch) {
      if (currentMembers.length > 0) {
        sections.push({ title: currentTitle, members: currentMembers });
        currentMembers = [];
      }
      currentTitle = headingMatch[2].trim();
      continue;
    }

    if (!line.includes(",")) continue;
    const commaIdx = line.indexOf(",");
    const username = line.slice(0, commaIdx).trim();
    const displayName = line.slice(commaIdx + 1).trim();
    if (username) {
      const member: TeamMember = { username, display_name: displayName };
      currentMembers.push(member);
      allMembers.push(member);
    }
  }

  if (currentMembers.length > 0) {
    sections.push({ title: currentTitle, members: currentMembers });
  }
  if (sections.length === 0 && allMembers.length > 0) {
    sections.push({ title: null, members: allMembers });
  }

  return { sections, members: allMembers };
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    CORS_ORIGINS.includes("*") || (origin !== null && CORS_ORIGINS.includes(origin));

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
    "Access-Control-Expose-Headers": "ETag, X-File-Read-Ms, X-Parse-Time-Ms",
  };

  if (allowed && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

// ---------------------------------------------------------------------------
// Request body helpers
// ---------------------------------------------------------------------------

// Reads the request body as UTF-8 text, aborting once more than `maxBytes` have
// actually been received. Content-Length is client-supplied and not trustworthy
// on its own — a client that omits it or lies about it can otherwise stream an
// unbounded amount of data into memory via req.json()/req.text(). This caps the
// real byte count regardless of what the header claims.
async function readBodyTextWithLimit(req: Request, maxBytes: number): Promise<string> {
  if (!req.body) return "";

  const reader = req.body.getReader();
  // Decode incrementally (stream: true carries partial multi-byte UTF-8
  // sequences across chunk boundaries) instead of collecting raw chunks and
  // concatenating them into a second full-size buffer before decoding —
  // avoids holding two complete copies of a near-limit body in memory at once.
  const decoder = new TextDecoder("utf-8");
  const parts: string[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  parts.push(decoder.decode());

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET /health
  if (req.method === "GET" && pathname === "/health") {
    const shareOk = isShareAccessible();
    return jsonResponse(
      {
        status: "ok",
        version: HELPER_VERSION,
        share: shareOk ? "accessible" : "inaccessible",
        share_dir: SHARE_DIR,
      },
      shareOk ? 200 : 503,
      corsHeaders,
    );
  }

  // GET/POST /settings
  if (pathname === "/settings") {
    if (req.method === "GET") {
      const values: SettingsFormValues = {
        SHARE_DIR,
        HOST,
        PORT: String(PORT),
        CORS_ORIGINS: CORS_ORIGINS.join(","),
      };
      return new Response(renderSettingsPage(values, null), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (req.method === "POST") {
      if (!isSameOriginRequest(req)) {
        return jsonResponse({ detail: "Cross-origin settings changes are not allowed" }, 403, {});
      }

      // A url-encoded form body is plain text, so the same streaming byte cap
      // used for PUT /hday/:username bodies applies here too — this also
      // catches an oversized body sent without a (trustworthy) Content-Length.
      const declaredLength = parseInt(req.headers.get("content-length") ?? "0", 10);
      if (!Number.isNaN(declaredLength) && declaredLength > MAX_SETTINGS_BODY_BYTES) {
        return jsonResponse({ detail: "Payload too large" }, 413, {});
      }

      let bodyText: string;
      try {
        bodyText = await readBodyTextWithLimit(req, MAX_SETTINGS_BODY_BYTES);
      } catch (err) {
        if (err instanceof PayloadTooLargeError) {
          return jsonResponse({ detail: "Payload too large" }, 413, {});
        }
        return jsonResponse({ detail: "Invalid form body" }, 400, {});
      }

      const form = new URLSearchParams(bodyText);
      const values: SettingsFormValues = {
        SHARE_DIR: form.get("SHARE_DIR") ?? "",
        HOST: form.get("HOST") ?? "",
        PORT: form.get("PORT") ?? "",
        CORS_ORIGINS: form.get("CORS_ORIGINS") ?? "",
      };

      const error = validateSettingsForm(values);
      if (error) {
        return new Response(renderSettingsPage(values, error), {
          status: 400,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      const newShareDir = values.SHARE_DIR.trim();
      const shareDirError = checkShareDirUsable(newShareDir);
      if (shareDirError) {
        return new Response(renderSettingsPage(values, shareDirError), {
          status: 400,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      const newPort = Number(values.PORT);
      const newHost = values.HOST.trim();
      const bindError = await checkAddressBindable(newHost, newPort);
      if (bindError) {
        return new Response(renderSettingsPage(values, bindError), {
          status: 400,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      writeEnvFile({
        SHARE_DIR: newShareDir,
        HOST: newHost,
        PORT: String(newPort),
        CORS_ORIGINS: values.CORS_ORIGINS.trim(),
      });

      logLine(`Settings saved via /settings; restarting on ${newHost}:${newPort}`);

      if (!SKIP_RESTART_FOR_TESTS) {
        setTimeout(() => {
          void restartWithNewSettings();
        }, 50);
      }

      return new Response(renderRestartingPage(newPort), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return jsonResponse({ detail: "Method not allowed" }, 405, {});
  }

  // GET /logs — plain text for scripts/curl, an HTML viewer for a browser
  if (pathname === "/logs") {
    if (req.method !== "GET") {
      return jsonResponse({ detail: "Method not allowed" }, 405, {});
    }
    const acceptsHtml = (req.headers.get("Accept") ?? "").includes("text/html");
    if (!acceptsHtml) {
      const body = logRingBuffer.length > 0 ? logRingBuffer.join("\n") + "\n" : "";
      return new Response(body, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return new Response(renderLogsPage(logRingBuffer), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // GET /logs/events — SSE stream of new log lines as they're written
  if (pathname === "/logs/events") {
    if (req.method !== "GET") {
      return jsonResponse({ detail: "Method not allowed" }, 405, {});
    }
    if (logSseSubscribers.size >= MAX_LOG_SSE_SUBSCRIBERS) {
      return jsonResponse({ detail: "Too many /logs/events subscribers" }, 503, {});
    }

    let cleanup: (() => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(SSE_ENCODER.encode(": connected\n\n"));
        logSseSubscribers.add(controller);
        const keepaliveTimer = setInterval(() => {
          try {
            controller.enqueue(SSE_ENCODER.encode(": keepalive\n\n"));
          } catch {
            // Client already gone; cancel() (below) runs cleanup().
          }
        }, HDAY_SSE_KEEPALIVE_MS);
        cleanup = () => {
          clearInterval(keepaliveTimer);
          logSseSubscribers.delete(controller);
        };
      },
      cancel() {
        cleanup?.();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // GET /hday/:username/events — SSE change-notification stream
  const hdayEventsMatch = pathname.match(/^\/hday\/([^/]+)\/events$/);
  if (hdayEventsMatch) {
    const username = decodeURIComponent(hdayEventsMatch[1] ?? "");

    try {
      getHdayPath(username);
    } catch {
      return jsonResponse({ detail: "Invalid username format" }, 400, corsHeaders);
    }

    if (req.method !== "GET") {
      return jsonResponse({ detail: "Method not allowed" }, 405, corsHeaders);
    }

    let cleanup: (() => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(SSE_ENCODER.encode(": connected\n\n"));
        const unsubscribe = subscribeToHdayChanges(username, controller);
        const keepaliveTimer = setInterval(() => {
          try {
            controller.enqueue(SSE_ENCODER.encode(": keepalive\n\n"));
          } catch {
            // Client already gone; cancel() (below) will run cleanup().
          }
        }, HDAY_SSE_KEEPALIVE_MS);
        cleanup = () => {
          clearInterval(keepaliveTimer);
          unsubscribe();
        };
      },
      cancel() {
        cleanup?.();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // /hday/:username
  const hdayMatch = pathname.match(/^\/hday\/([^/]+)$/);
  if (hdayMatch) {
    const username = decodeURIComponent(hdayMatch[1] ?? "");

    try {
      // validate early — getHdayPath throws RangeError on bad username
      getHdayPath(username);
    } catch {
      return jsonResponse({ detail: "Invalid username format" }, 400, corsHeaders);
    }

    // GET /hday/:username
    if (req.method === "GET") {
      const t0 = performance.now();

      let raw: string;
      let etag: string;
      try {
        ({ raw, etag } = readHdayFile(username));
      } catch (err) {
        if (err instanceof HdayFileNotFoundError) {
          return jsonResponse({ detail: err.message }, 404, corsHeaders);
        }
        return jsonResponse({ detail: "Share directory not accessible" }, 503, corsHeaders);
      }

      const fileReadMs = performance.now() - t0;

      const parseT0 = performance.now();
      let events: HdayEvent[] = [];
      try {
        events = parseHday(raw);
      } catch {
        // malformed file — return empty events
      }
      const parseMs = performance.now() - parseT0;

      return jsonResponse(
        { username, raw, etag, events },
        200,
        {
          ...corsHeaders,
          ETag: etag,
          "X-File-Read-Ms": fileReadMs.toFixed(3),
          "X-Parse-Time-Ms": parseMs.toFixed(3),
        },
      );
    }

    // PUT /hday/:username
    if (req.method === "PUT") {
      // Fast-path rejection when the client declares an oversized body up front.
      // readBodyTextWithLimit() below is the authoritative cap regardless — this
      // just avoids reading anything at all from an honestly-labeled huge request.
      const declaredLength = parseInt(req.headers.get("content-length") ?? "0", 10);
      if (!Number.isNaN(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
        return jsonResponse({ detail: "Payload too large" }, 413, corsHeaders);
      }

      let bodyText: string;
      try {
        bodyText = await readBodyTextWithLimit(req, MAX_REQUEST_BODY_BYTES);
      } catch (err) {
        if (err instanceof PayloadTooLargeError) {
          return jsonResponse({ detail: "Payload too large" }, 413, corsHeaders);
        }
        return jsonResponse({ detail: "Invalid request body" }, 400, corsHeaders);
      }

      let body: { raw?: string; events?: HdayEvent[]; etag?: string | null };
      try {
        body = JSON.parse(bodyText) as { raw?: string; events?: HdayEvent[]; etag?: string | null };
      } catch {
        return jsonResponse({ detail: "Invalid JSON body" }, 400, corsHeaders);
      }

      if (body.raw == null && body.events == null) {
        return jsonResponse(
          { detail: "Either 'raw' or 'events' must be provided" },
          422,
          corsHeaders,
        );
      }

      if (body.raw != null && typeof body.raw !== "string") {
        return jsonResponse({ detail: "'raw' must be a string" }, 400, corsHeaders);
      }

      if (body.events != null && !Array.isArray(body.events)) {
        return jsonResponse({ detail: "'events' must be an array" }, 422, corsHeaders);
      }

      // events takes precedence over raw when both are provided
      let content: string;
      if (body.events != null) {
        try {
          content = eventsToText(body.events);
        } catch {
          return jsonResponse({ detail: "Failed to serialize events" }, 422, corsHeaders);
        }
      } else {
        content = body.raw as string;
      }
      const expectedEtag = body.etag ?? null;

      try {
        const newEtag = await writeHdayFile(username, content, expectedEtag);
        return jsonResponse({ etag: newEtag }, 200, corsHeaders);
      } catch (err) {
        if (err instanceof HdayConflictError) {
          // Return current file state for the client to resolve the conflict.
          try {
            const { raw: currentRaw, etag: currentEtag } = readHdayFile(username);
            let currentEvents: HdayEvent[] = [];
            try {
              currentEvents = parseHday(currentRaw);
            } catch {
              // return empty list on parse failure
            }
            return jsonResponse(
              { raw: currentRaw, events: currentEvents, etag: currentEtag },
              409,
              corsHeaders,
            );
          } catch {
            return jsonResponse({ raw: "", events: [], etag: null }, 409, corsHeaders);
          }
        }
        return jsonResponse({ detail: "Share directory not accessible" }, 503, corsHeaders);
      }
    }

    return jsonResponse({ detail: "Method not allowed" }, 405, corsHeaders);
  }

  // /team/:teamId[/hday]
  const teamMatch = pathname.match(/^\/team\/([^/]+)(\/hday)?$/);
  if (teamMatch) {
    const teamId = decodeURIComponent(teamMatch[1] ?? "");
    const isHdayRoute = !!teamMatch[2];

    try {
      getTeamFilePath(teamId, "conf");
    } catch {
      return jsonResponse({ detail: "Invalid team_id format" }, 400, corsHeaders);
    }

    if (req.method !== "GET") {
      return jsonResponse({ detail: "Method not allowed" }, 405, corsHeaders);
    }

    // GET /team/:teamId
    if (!isHdayRoute) {
      try {
        const teamName = parseTeamConfig(teamId);
        const { sections, members } = parsePeopleFile(teamId);
        return jsonResponse({ team_id: teamId, name: teamName, sections, members }, 200, corsHeaders);
      } catch (err) {
        if (err instanceof TeamNotFoundError) {
          return jsonResponse({ detail: err.message }, 404, corsHeaders);
        }
        return jsonResponse({ detail: "Share directory not accessible" }, 503, corsHeaders);
      }
    }

    // GET /team/:teamId/hday
    try {
      const teamName = parseTeamConfig(teamId);
      const { sections, members } = parsePeopleFile(teamId);

      const fileReadT0 = performance.now();
      const memberData = await Promise.all(
        members.map(async (member): Promise<TeamMemberHdayData> => {
          try {
            const { raw, etag } = await readHdayFileAsync(member.username);
            return { ...member, raw, etag, events: [] };
          } catch (err) {
            if (err instanceof ShareNotAccessibleError) throw err;
            // File missing or invalid username — return empty data for this member
            return { ...member, raw: "", etag: null, events: [] };
          }
        }),
      );
      const memberDataMap = new Map(memberData.map((data) => [data.username, data]));
      const fileReadMs = performance.now() - fileReadT0;

      const parseT0 = performance.now();
      for (const data of memberDataMap.values()) {
        if (data.raw) {
          try { data.events = parseHday(data.raw); } catch { data.events = []; }
        }
      }
      const parseMs = performance.now() - parseT0;

      const sectionsWithHday: TeamSectionHdayData[] = sections.map((s) => ({
        title: s.title,
        members: s.members.map((m) => memberDataMap.get(m.username)!),
      }));

      return jsonResponse(
        {
          team_id: teamId,
          name: teamName,
          sections: sectionsWithHday,
          members: members.map((m) => memberDataMap.get(m.username)!),
        },
        200,
        {
          ...corsHeaders,
          "X-File-Read-Ms": fileReadMs.toFixed(3),
          "X-Parse-Time-Ms": parseMs.toFixed(3),
        },
      );
    } catch (err) {
      if (err instanceof TeamNotFoundError) {
        return jsonResponse({ detail: err.message }, 404, corsHeaders);
      }
      return jsonResponse({ detail: "Share directory not accessible" }, 503, corsHeaders);
    }
  }

  return jsonResponse({ detail: "Not found" }, 404, corsHeaders);
}

// ---------------------------------------------------------------------------
// Request logging — the only diagnostic output available to someone running
// this as a standalone EXE with no other way to see what it's doing.
// ---------------------------------------------------------------------------

async function loggedHandleRequest(req: Request): Promise<Response> {
  const start = performance.now();
  const { pathname } = new URL(req.url);
  try {
    const response = await handleRequest(req);
    const ms = (performance.now() - start).toFixed(1);
    logLine(`${req.method} ${pathname} -> ${response.status} (${ms}ms)`);
    return response;
  } catch (err) {
    const ms = (performance.now() - start).toFixed(1);
    const summary = `${req.method} ${pathname} -> unhandled error (${ms}ms)`;
    // The full error (stack included, which can contain local filesystem
    // paths) stays console-only. /logs and /logs/events are unauthenticated
    // and network-reachable (including over the LAN with HOST=0.0.0.0), so
    // the ring buffer/file/SSE fan-out only gets the bare message.
    console.error(summary + ":", err);
    const detail = err instanceof Error ? err.message : String(err);
    recordLogLine(`[${new Date().toISOString()}] ${summary}: ${detail}`);
    // Every known error path in handleRequest already returns a CORS-headered
    // response — this only catches genuine bugs. Respond ourselves (with CORS
    // headers) rather than letting it fall through to Bun's default handling,
    // which would omit them and surface to the browser as an opaque "CORS
    // error" that hides the real problem.
    return jsonResponse(
      { detail: "Internal server error" },
      500,
      getCorsHeaders(req.headers.get("Origin")),
    );
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// Create the share directory on first run if it doesn't exist
if (!existsSync(SHARE_DIR)) {
  try {
    mkdirSync(SHARE_DIR, { recursive: true });
    console.log(`Created share directory: ${SHARE_DIR}`);
  } catch (err) {
    console.warn(`Warning: could not create share directory "${SHARE_DIR}": ${err}`);
  }
}

// A self-restart (see restartWithNewSettings) spawns the replacement before
// this process's own `server.stop()` is guaranteed to have fully released the
// port on every platform — retry binding for a few seconds instead of
// failing immediately on EADDRINUSE.
const BIND_RETRY_ATTEMPTS = 20;
const BIND_RETRY_DELAY_MS = 150;

async function startServer(): Promise<ReturnType<typeof Bun.serve>> {
  for (let attempt = 1; attempt <= BIND_RETRY_ATTEMPTS; attempt++) {
    try {
      return Bun.serve({
        hostname: HOST,
        port: PORT,
        fetch: loggedHandleRequest,
      });
    } catch (err) {
      const isAddrInUse = err instanceof Error && "code" in err && err.code === "EADDRINUSE";
      if (isAddrInUse && attempt < BIND_RETRY_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, BIND_RETRY_DELAY_MS));
        continue;
      }
      if (isAddrInUse) {
        console.error(
          `\nCould not start: port ${PORT} is already in use on ${HOST}.\n` +
            `Either stop whatever else is using it, or set PORT to a different value ` +
            `(e.g. PORT=8081) in your .env file next to the executable.\n`,
        );
      } else {
        console.error("\nCould not start the .hday helper:", err, "\n");
      }
      process.exit(1);
    }
  }
  // Unreachable: the loop above always either returns or calls process.exit(1).
  throw new Error("unreachable");
}

httpServer = await startServer();

console.log("============================================================");
console.log("Worktime .hday Helper");
console.log("============================================================");
console.log(`Version:   ${HELPER_VERSION}`);
console.log(`Host:      ${HOST}`);
console.log(`Port:      ${PORT}`);
console.log(`Share dir: ${SHARE_DIR}`);
console.log(`CORS:      ${CORS_ORIGINS.join(", ")}`);
console.log("============================================================");
console.log(`Listening on http://${HOST}:${PORT}`);
