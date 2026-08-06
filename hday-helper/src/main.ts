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
 * GET  /team/:teamId        — read team config + member list
 * GET  /team/:teamId/hday   — read aggregated team .hday files (always includes parsed events)
 */

import { createHash } from "crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  renameSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { readFile } from "fs/promises";
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
    console.log(`${req.method} ${pathname} -> ${response.status} (${ms}ms)`);
    return response;
  } catch (err) {
    const ms = (performance.now() - start).toFixed(1);
    console.error(`${req.method} ${pathname} -> unhandled error (${ms}ms):`, err);
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

try {
  Bun.serve({
    hostname: HOST,
    port: PORT,
    fetch: loggedHandleRequest,
  });
} catch (err) {
  if (err instanceof Error && "code" in err && err.code === "EADDRINUSE") {
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
