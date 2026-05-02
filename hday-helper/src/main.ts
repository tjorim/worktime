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
 * ## API (mirrors backend/app/routers/hday.py)
 *
 * GET  /health                        — health + share-directory status
 * GET  /hday/:username[?format=raw]   — read a user's .hday file
 * GET  /hday/:username?format=parsed  — read + parse a user's .hday file
 * PUT  /hday/:username                — create or update a user's .hday file
 */

import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { basename, join, resolve, sep } from "path";
// These imports use relative paths to reuse the frontend .hday parser directly.
// `bun build --compile` bundles all resolved modules into the output binary, so the
// relative paths work at build time even though the EXE has no filesystem access.
import { parseHday } from "../../frontend/src/lib/hday/parser";
import { toLine } from "../../frontend/src/lib/hday/serializer";
import type { HdayEvent } from "../../frontend/src/lib/hday/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SHARE_DIR = resolve(process.env.SHARE_DIR ?? "./hday_files");
const PORT = parseInt(process.env.PORT ?? "8080", 10);
const HOST = process.env.HOST ?? "127.0.0.1";
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
  if (!filePath.startsWith(resolvedShare + sep)) {
    throw new RangeError("Invalid username format");
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
    readdirSync(SHARE_DIR); // probe read access
  } catch (err) {
    if (err instanceof ShareNotAccessibleError) throw err;
    throw new ShareNotAccessibleError(`Share directory not accessible: ${err}`);
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

function writeHdayFile(username: string, content: string, expectedEtag: string | null): string {
  checkShareAccessible();

  const filePath = getHdayPath(username);
  const fileExists = existsSync(filePath);

  // Conflict detection
  if (expectedEtag !== null) {
    if (!fileExists) {
      // The client expected a file at this etag, but it no longer exists.
      // This is a precondition failure and maps to HTTP 409 in the handler.
      throw new HdayFileNotFoundError(username);
    }
    const currentRaw = readFileSync(filePath, "utf-8");
    if (computeEtag(currentRaw) !== expectedEtag) {
      throw new HdayConflictError();
    }
  }

  // Atomic write: write to temp file then rename
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, filePath);

  return computeEtag(content);
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function eventsToText(events: HdayEvent[]): string {
  return events.map((e) => toLine(e)).join("\n") + "\n";
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
      { status: "ok", share: shareOk ? "accessible" : "inaccessible", share_dir: SHARE_DIR },
      shareOk ? 200 : 503,
      corsHeaders,
    );
  }

  // /hday/:username
  const hdayMatch = pathname.match(/^\/hday\/([^/]+)$/);
  if (!hdayMatch) {
    return jsonResponse({ detail: "Not found" }, 404, corsHeaders);
  }

  const username = decodeURIComponent(hdayMatch[1] ?? "");

  try {
    // validate early — getHdayPath throws RangeError on bad username
    getHdayPath(username);
  } catch {
    return jsonResponse({ detail: "Invalid username format" }, 400, corsHeaders);
  }

  // GET /hday/:username[?format=raw|parsed]
  if (req.method === "GET") {
    const format = url.searchParams.get("format") ?? "raw";
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

    let events: HdayEvent[] | null = null;
    let parseMs = 0;
    if (format === "parsed") {
      const t1 = performance.now();
      try {
        events = parseHday(raw);
      } catch {
        events = [];
      }
      parseMs = performance.now() - t1;
    }

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
    let body: { raw?: string; events?: HdayEvent[]; etag?: string | null };
    try {
      body = (await req.json()) as { raw?: string; events?: HdayEvent[]; etag?: string | null };
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

    // events takes precedence over raw when both are provided
    const content = body.events != null ? eventsToText(body.events) : (body.raw as string);
    const expectedEtag = body.etag ?? null;

    try {
      const newEtag = writeHdayFile(username, content, expectedEtag);
      return jsonResponse({ etag: newEtag }, 200, corsHeaders);
    } catch (err) {
      if (err instanceof HdayConflictError || err instanceof HdayFileNotFoundError) {
        // Return current file state for the client to resolve the conflict.
        // HdayFileNotFoundError here means the client provided an etag but the file
        // has since been deleted — this is a precondition failure (409).
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
          return jsonResponse({ raw: "", events: [], etag: "" }, 409, corsHeaders);
        }
      }
      return jsonResponse({ detail: "Share directory not accessible" }, 503, corsHeaders);
    }
  }

  return jsonResponse({ detail: "Method not allowed" }, 405, corsHeaders);
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

Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch: handleRequest,
});

console.log("============================================================");
console.log("Worktime .hday Helper");
console.log("============================================================");
console.log(`Host:      ${HOST}`);
console.log(`Port:      ${PORT}`);
console.log(`Share dir: ${SHARE_DIR}`);
console.log(`CORS:      ${CORS_ORIGINS.join(", ")}`);
console.log("============================================================");
console.log(`Listening on http://${HOST}:${PORT}`);
