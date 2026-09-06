/**
 * Integration tests for the .hday helper.
 *
 * Spawns the real `src/main.ts` as a child process (exactly how a user runs it)
 * against a throwaway SHARE_DIR, then exercises it over real HTTP. This is
 * deliberately black-box: it validates the behavior a client actually depends
 * on — routing, path-traversal defense, conflict detection, CORS — without
 * requiring any test-only exports or refactoring of the production script.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { networkInterfaces, tmpdir } from "os";
import { join } from "path";

const MAIN_TS = join(import.meta.dir, "..", "src", "main.ts");
const ALLOWED_ORIGIN = "http://allowed.example";

// Some sandboxed/CI environments have no IPv6 loopback at all (no "::1"
// route) — probe for it once at collection time so the IPv6 test below can
// skip itself there instead of failing on an environment limitation.
const ipv6LoopbackAvailable = (() => {
  try {
    const probe = Bun.serve({ hostname: "::1", port: 0, fetch: () => new Response(null, { status: 204 }) });
    probe.stop();
    return true;
  } catch {
    return false;
  }
})();

let shareDir: string;
let port: number;
let baseUrl: string;
let proc: ReturnType<typeof Bun.spawn>;

/**
 * Best-effort cleanup for the one test (below) that lets a real self-restart
 * detach an untracked replacement process: finds whatever PID currently owns
 * `port` via `lsof`, checks its command line actually references this repo's
 * `main.ts` (via `ps`), and only then kills it — so a coincidental, unrelated
 * process occupying the same randomly-chosen port is never touched. Silently
 * gives up if `lsof`/`ps` aren't available or nothing matches.
 */
async function killOwnHelperProcessOnPort(port: number): Promise<void> {
  try {
    const lsof = Bun.spawnSync(["lsof", "-ti", `tcp:${port}`], { stdout: "pipe", stderr: "ignore" });
    const pids = new TextDecoder()
      .decode(lsof.stdout)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const pid of pids) {
      const ps = Bun.spawnSync(["ps", "-p", pid, "-o", "args="], { stdout: "pipe", stderr: "ignore" });
      const cmdline = new TextDecoder().decode(ps.stdout);
      if (cmdline.includes(MAIN_TS)) {
        Bun.spawnSync(["kill", "-9", pid], { stdout: "ignore", stderr: "ignore" });
      }
    }
  } catch {
    // lsof/ps not available on this platform — nothing more we can do here.
  }
}

async function waitForServer(url: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 503) return;
    } catch {
      // Not accepting connections yet.
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Minimal SSE reader for tests: opens the stream and resolves with the parsed
 * `data` payload of the first event matching `eventName` (and, if given,
 * `matches`), or rejects if none arrives within `timeoutMs`. Deliberately
 * hand-rolled rather than pulling in a parsing library — the helper itself
 * has no dependencies, and this repo's tests are meant to exercise it exactly
 * as a real HTTP client would.
 */
async function readNextSseEvent(
  response: Response,
  eventName: string,
  timeoutMs = 3000,
  matches: (data: unknown) => boolean = () => true,
): Promise<unknown> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), deadline - Date.now()),
        ),
      ]);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      for (const block of buffer.split("\n\n")) {
        const eventLine = block.split("\n").find((line) => line.startsWith("event: "));
        const dataLine = block.split("\n").find((line) => line.startsWith("data: "));
        if (eventLine?.slice("event: ".length) === eventName && dataLine) {
          const data = JSON.parse(dataLine.slice("data: ".length));
          if (matches(data)) return data;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new Error(`Timed out waiting for SSE event "${eventName}"`);
}

beforeAll(async () => {
  shareDir = mkdtempSync(join(tmpdir(), "hday-helper-test-"));
  mkdirSync(join(shareDir, "config"), { recursive: true });

  // Team fixtures: two sections via <h2> headers.
  writeFileSync(join(shareDir, "config", "eng.conf"), "costcentername=CC000000\ngroupname=Engineering\nregion=XX\n");
  writeFileSync(
    join(shareDir, "config", "eng.people"),
    "<h2>Management</h2>\nalice,Alice Anderson\n\n<h2>Engineers</h2>\nbob,Bob Baker\ncarol,Carol Clark\n",
  );
  // Team with no section headers at all.
  writeFileSync(join(shareDir, "config", "flat.conf"), "groupname=Flat Team\n");
  writeFileSync(join(shareDir, "config", "flat.people"), "dave,Dave Davis\n");

  // Pre-existing .hday files (carol has none, to exercise the missing-file path).
  writeFileSync(join(shareDir, "alice.hday"), "2025/01/15 # Vacation\n");
  writeFileSync(join(shareDir, "bob.hday"), "2025/02/01-2025/02/03 # Course\n");

  port = 20000 + Math.floor(Math.random() * 20000);
  baseUrl = `http://127.0.0.1:${port}`;

  proc = Bun.spawn(["bun", MAIN_TS], {
    env: {
      ...process.env,
      SHARE_DIR: shareDir,
      PORT: String(port),
      HOST: "127.0.0.1",
      CORS_ORIGINS: ALLOWED_ORIGIN,
    },
    stdout: "ignore",
    stderr: "ignore",
  });

  await waitForServer(`${baseUrl}/health`);
}, 15000);

afterAll(() => {
  proc.kill();
  rmSync(shareDir, { recursive: true, force: true });
});

describe("GET /health", () => {
  test("reports ok status, version, and share accessibility", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.share).toBe("accessible");
    expect(body.share_dir).toBe(shareDir);
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
  });
});

describe("GET /hday/:username", () => {
  test("returns raw content, etag, and parsed events for an existing file", async () => {
    const res = await fetch(`${baseUrl}/hday/alice`);
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toMatch(/^sha256:/);
    const body = await res.json();
    expect(body.username).toBe("alice");
    expect(body.raw).toBe("2025/01/15 # Vacation\n");
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe("range");
  });

  test("returns 404 for a user with no .hday file", async () => {
    const res = await fetch(`${baseUrl}/hday/nobody`);
    expect(res.status).toBe(404);
  });

  // A literal "/hday/.." isn't a meaningful case to send here: fetch()/URL
  // normalize ".." path segments away client-side per RFC 3986 before the
  // request is ever sent, so the server never sees it. Encoding the traversal
  // (as any real attacker would have to) is what actually reaches the handler.
  test("rejects a URL-encoded traversal attempt", async () => {
    const res = await fetch(`${baseUrl}/hday/${encodeURIComponent("../../etc/passwd")}`);
    expect(res.status).toBe(400);
  });

  test("rejects a username containing an embedded '..' segment", async () => {
    const res = await fetch(`${baseUrl}/hday/alice..bob`);
    expect(res.status).toBe(400);
  });

  test("405s on unsupported methods", async () => {
    const res = await fetch(`${baseUrl}/hday/alice`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });
});

describe("PUT /hday/:username", () => {
  test("creates a new file and the content is readable afterward", async () => {
    const res = await fetch(`${baseUrl}/hday/erin`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: "2025/03/01 # Training\n" }),
    });
    expect(res.status).toBe(200);
    const { etag } = await res.json();
    expect(etag).toMatch(/^sha256:/);

    const getRes = await fetch(`${baseUrl}/hday/erin`);
    const body = await getRes.json();
    expect(body.raw).toBe("2025/03/01 # Training\n");
    expect(body.etag).toBe(etag);
  });

  test("serializes an events array instead of raw when both would apply", async () => {
    const res = await fetch(`${baseUrl}/hday/frank`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw: "ignored\n",
        events: [{ type: "weekly", weekday: 3, flags: [], title: "", raw: "" }],
      }),
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`${baseUrl}/hday/frank`);
    const body = await getRes.json();
    expect(body.raw).not.toContain("ignored");
  });

  test("409s creating a file that already exists (etag omitted)", async () => {
    const res = await fetch(`${baseUrl}/hday/alice`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: "2099/01/01 # Overwrite attempt\n" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    // Conflict response hands back the *current* state, not the rejected write.
    expect(body.raw).toBe("2025/01/15 # Vacation\n");
  });

  test("409s updating with a stale etag, and does not modify the file", async () => {
    const res = await fetch(`${baseUrl}/hday/bob`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: "2099/01/01 # Stale write\n", etag: "sha256:not-the-real-one" }),
    });
    expect(res.status).toBe(409);

    const onDisk = readFileSync(join(shareDir, "bob.hday"), "utf-8");
    expect(onDisk).toBe("2025/02/01-2025/02/03 # Course\n");
  });

  test("succeeds updating with the correct current etag", async () => {
    const getRes = await fetch(`${baseUrl}/hday/bob`);
    const { etag: currentEtag } = await getRes.json();

    const putRes = await fetch(`${baseUrl}/hday/bob`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: "2025/02/01-2025/02/03 # Course (rescheduled)\n", etag: currentEtag }),
    });
    expect(putRes.status).toBe(200);

    const onDisk = readFileSync(join(shareDir, "bob.hday"), "utf-8");
    expect(onDisk).toBe("2025/02/01-2025/02/03 # Course (rescheduled)\n");
  });

  test("422s when neither raw nor events is provided", async () => {
    const res = await fetch(`${baseUrl}/hday/grace`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  test("400s on invalid JSON", async () => {
    const res = await fetch(`${baseUrl}/hday/grace`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  test("only one of two concurrent creates for the same new user succeeds", async () => {
    const make = () =>
      fetch(`${baseUrl}/hday/henry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: "2025/04/01 # Concurrent\n" }),
      });
    const [a, b] = await Promise.all([make(), make()]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  test("413s a chunked oversized body with no Content-Length header", async () => {
    // ReadableStream body forces fetch to use chunked transfer encoding, so
    // there's no Content-Length header for the server to (dis)trust up front —
    // this is the case the streaming size cap has to catch on its own.
    const bigChunk = new TextEncoder().encode(`{"raw":"${"x".repeat(11 * 1024 * 1024)}"}`);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bigChunk);
        controller.close();
      },
    });
    const res = await fetch(`${baseUrl}/hday/ivan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: stream,
      // @ts-expect-error duplex is required by undici/Bun for streaming bodies but missing from lib.dom types
      duplex: "half",
    });
    expect(res.status).toBe(413);

    const getRes = await fetch(`${baseUrl}/hday/ivan`);
    expect(getRes.status).toBe(404);
  });
});

describe("GET /hday/:username/events", () => {
  test("opens an event-stream response for a valid username", async () => {
    const res = await fetch(`${baseUrl}/hday/judy/events`, {
      headers: { Accept: "text/event-stream" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel();
  });

  test("400s on an invalid username", async () => {
    const res = await fetch(`${baseUrl}/hday/${encodeURIComponent("../../etc/passwd")}/events`);
    expect(res.status).toBe(400);
  });

  test("405s on a non-GET request", async () => {
    const res = await fetch(`${baseUrl}/hday/judy/events`, { method: "PUT" });
    expect(res.status).toBe(405);
  });

  test("notifies a connected subscriber with the new etag after a PUT", async () => {
    const stream = await fetch(`${baseUrl}/hday/kevin/events`, {
      headers: { Accept: "text/event-stream" },
    });
    // Give the subscription (and the underlying directory watcher) a moment to
    // register before the write below, so the watcher doesn't miss it.
    await new Promise((r) => setTimeout(r, 100));

    const eventPromise = readNextSseEvent(stream, "hday_changed");

    const putRes = await fetch(`${baseUrl}/hday/kevin`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: "2025/05/01 # Notified\n" }),
    });
    const { etag: putEtag } = await putRes.json();

    const event = (await eventPromise) as { type: string; username: string; etag: string };
    expect(event.type).toBe("hday_changed");
    expect(event.username).toBe("kevin");
    expect(event.etag).toBe(putEtag);
  });

  test("does not notify a subscriber watching a different username", async () => {
    const streamForLeo = await fetch(`${baseUrl}/hday/leo/events`, {
      headers: { Accept: "text/event-stream" },
    });
    await new Promise((r) => setTimeout(r, 100));

    const leoNeverFires = readNextSseEvent(streamForLeo, "hday_changed", 1000).then(
      () => "fired",
      () => "timed-out",
    );

    await fetch(`${baseUrl}/hday/mia`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: "2025/06/01 # Someone else's file\n" }),
    });

    expect(await leoNeverFires).toBe("timed-out");
  });

  test("notifies a fresh subscriber of a deletion instead of suppressing its first (null-etag) event", async () => {
    // A brand-new subscriber's "last sent etag" starts as null purely as a
    // sentinel for "nothing sent yet" — it must not be mistaken for "already
    // told them the file is gone" when the file's actual first-ever
    // notification also happens to carry a null etag (i.e. a delete).
    await fetch(`${baseUrl}/hday/nina`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: "2025/08/01 # Before delete\n" }),
    });

    const stream = await fetch(`${baseUrl}/hday/nina/events`, {
      headers: { Accept: "text/event-stream" },
    });
    await new Promise((r) => setTimeout(r, 100));

    const eventPromise = readNextSseEvent(stream, "hday_changed");
    rmSync(join(shareDir, "nina.hday"));

    const event = (await eventPromise) as { type: string; username: string; etag: string | null };
    expect(event.type).toBe("hday_changed");
    expect(event.username).toBe("nina");
    expect(event.etag).toBeNull();
  });
});

describe("GET /team/:teamId", () => {
  test("returns team name and members grouped into sections", async () => {
    const res = await fetch(`${baseUrl}/team/eng`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.team_id).toBe("eng");
    expect(body.name).toBe("Engineering");
    expect(body.sections).toHaveLength(2);
    expect(body.sections[0].title).toBe("Management");
    expect(body.sections[0].members).toEqual([{ username: "alice", display_name: "Alice Anderson" }]);
    expect(body.sections[1].title).toBe("Engineers");
    expect(body.sections[1].members).toHaveLength(2);
    expect(body.members).toHaveLength(3);
  });

  test("returns a single null-titled section when the people file has no headers", async () => {
    const res = await fetch(`${baseUrl}/team/flat`);
    const body = await res.json();
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].title).toBeNull();
  });

  test("404s for an unknown team", async () => {
    const res = await fetch(`${baseUrl}/team/nonexistent`);
    expect(res.status).toBe(404);
  });

  test("400s on an invalid team_id", async () => {
    const res = await fetch(`${baseUrl}/team/${encodeURIComponent("../etc")}`);
    expect(res.status).toBe(400);
  });
});

describe("GET /team/:teamId/hday", () => {
  test("aggregates each member's .hday data, including members with no file", async () => {
    const res = await fetch(`${baseUrl}/team/eng/hday`);
    expect(res.status).toBe(200);
    const body = await res.json();

    const byUsername = Object.fromEntries(body.members.map((m: { username: string }) => [m.username, m]));
    expect(byUsername.alice.raw).toBe("2025/01/15 # Vacation\n");
    expect(byUsername.alice.etag).toMatch(/^sha256:/);
    // carol has no .hday file on disk — should degrade to empty data, not error.
    expect(byUsername.carol.raw).toBe("");
    expect(byUsername.carol.etag).toBeNull();
    expect(byUsername.carol.events).toEqual([]);
  });

  test("preserves section grouping in the aggregated response", async () => {
    const res = await fetch(`${baseUrl}/team/eng/hday`);
    const body = await res.json();
    expect(body.sections.map((s: { title: string | null }) => s.title)).toEqual(["Management", "Engineers"]);
  });
});

describe("CORS", () => {
  test("OPTIONS preflight succeeds with no route matching required", async () => {
    const res = await fetch(`${baseUrl}/hday/anyone`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });

  test("echoes Access-Control-Allow-Origin for an allowed origin", async () => {
    const res = await fetch(`${baseUrl}/health`, { headers: { Origin: ALLOWED_ORIGIN } });
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
  });

  test("omits Access-Control-Allow-Origin for a disallowed origin", async () => {
    const res = await fetch(`${baseUrl}/health`, { headers: { Origin: "http://evil.example" } });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("unknown routes", () => {
  test("404s with a JSON body", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBeDefined();
  });
});

describe("GET /logs", () => {
  test("returns recent request lines as plain text by default", async () => {
    // Exercise a request first so there's guaranteed to be something logged.
    await fetch(`${baseUrl}/health`);

    const res = await fetch(`${baseUrl}/logs`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain("GET /health -> 200");
  });

  test("returns an HTML viewer when the client accepts text/html", async () => {
    const res = await fetch(`${baseUrl}/logs`, { headers: { Accept: "text/html" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("<pre id=\"log\">");
    expect(body).toContain("/logs/events");
  });

  test("405s on unsupported methods", async () => {
    const res = await fetch(`${baseUrl}/logs`, { method: "POST" });
    expect(res.status).toBe(405);
  });
});

describe("GET /logs/events", () => {
  test("streams a log_line event for a subsequent request", async () => {
    // Cancelling the reader (as readNextSseEvent's own cleanup does) stops
    // local reads but doesn't reliably close the underlying connection —
    // aborting the fetch itself does, which keeps this subscriber from
    // lingering and counting against the cap tested below.
    const controller = new AbortController();
    const stream = await fetch(`${baseUrl}/logs/events`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
    try {
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")).toContain("text/event-stream");

      // Connecting itself produces a "GET /logs/events -> 200" log line that
      // broadcasts to this very subscriber, so filter for the /health line
      // specifically rather than assuming it's the first log_line received.
      const eventPromise = readNextSseEvent(
        stream,
        "log_line",
        3000,
        (data) => (data as { line: string }).line.includes("GET /health"),
      );
      await fetch(`${baseUrl}/health`);

      const event = (await eventPromise) as { type: string; line: string };
      expect(event.type).toBe("log_line");
      expect(event.line).toContain("GET /health");
    } finally {
      controller.abort();
    }
  });

  test("405s on a non-GET request", async () => {
    const res = await fetch(`${baseUrl}/logs/events`, { method: "POST" });
    expect(res.status).toBe(405);
  });

  test("rejects a new connection once the concurrent subscriber cap is reached", async () => {
    // Unauthenticated and reachable over the LAN (HOST=0.0.0.0) — must match
    // MAX_LOG_SSE_SUBSCRIBERS in src/main.ts, kept in sync manually since
    // this suite deliberately has no test-only exports.
    const MAX_LOG_SSE_SUBSCRIBERS = 50;
    const controllers: AbortController[] = [];
    try {
      for (let i = 0; i < MAX_LOG_SSE_SUBSCRIBERS; i++) {
        const controller = new AbortController();
        const res = await fetch(`${baseUrl}/logs/events`, {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });
        expect(res.status).toBe(200);
        controllers.push(controller);
      }
      const overflow = await fetch(`${baseUrl}/logs/events`, { headers: { Accept: "text/event-stream" } });
      expect(overflow.status).toBe(503);
    } finally {
      // Abort rather than cancel the response body — cancelling only stops
      // local reads and doesn't reliably close the connection, which would
      // leave these subscribers counted against the cap for later tests.
      for (const controller of controllers) {
        controller.abort();
      }
    }
  }, 15000);
});

describe("GET/POST /settings", () => {
  // These tests use their own dedicated helper instance (rather than the
  // shared `proc`/`baseUrl` above) because a valid POST /settings triggers a
  // full self-restart of the process handling it — sharing the main
  // instance would take down every other describe block in this file.
  // HDAY_HELPER_SKIP_RESTART_FOR_TESTS=1 disables the actual restart (which
  // detaches a second, untracked OS process) while leaving every other part
  // of the request/response cycle — validation, the rewritten .env file, the
  // response body — real and observable.
  let settingsShareDir: string;
  let settingsPort: number;
  let settingsBaseUrl: string;
  let settingsProc: ReturnType<typeof Bun.spawn>;
  let envPath: string;

  beforeAll(async () => {
    settingsShareDir = mkdtempSync(join(tmpdir(), "hday-helper-settings-test-"));
    settingsPort = 20000 + Math.floor(Math.random() * 20000);
    settingsBaseUrl = `http://127.0.0.1:${settingsPort}`;
    envPath = join(settingsShareDir, ".env");

    settingsProc = Bun.spawn(["bun", MAIN_TS], {
      env: {
        ...process.env,
        SHARE_DIR: settingsShareDir,
        PORT: String(settingsPort),
        HOST: "127.0.0.1",
        CORS_ORIGINS: ALLOWED_ORIGIN,
        HDAY_HELPER_SKIP_RESTART_FOR_TESTS: "1",
      },
      cwd: settingsShareDir,
      stdout: "ignore",
      stderr: "ignore",
    });

    await waitForServer(`${settingsBaseUrl}/health`);
  }, 15000);

  afterAll(() => {
    settingsProc.kill();
    rmSync(settingsShareDir, { recursive: true, force: true });
  });

  test("GET renders a form pre-filled with the current configuration", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain(`value="${settingsShareDir}"`);
    expect(body).toContain(`value="${settingsPort}"`);
    expect(body).toContain(`value="${ALLOWED_ORIGIN}"`);
  });

  test("GET shows a copy-paste-able helper URL for the current HOST/PORT", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`);
    const body = await res.text();
    expect(body).toContain(`http://127.0.0.1:${settingsPort}`);
    expect(body).toContain("copy-btn");
  });

  test("405s on unsupported methods", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  test("POST rejects an out-of-range PORT without writing .env", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        SHARE_DIR: settingsShareDir,
        HOST: "127.0.0.1",
        PORT: "999999",
        CORS_ORIGINS: "",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("PORT must be");
    expect(existsSync(envPath)).toBe(false);
  });

  test("POST rejects an empty SHARE_DIR", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ SHARE_DIR: "  ", HOST: "127.0.0.1", PORT: "8080", CORS_ORIGINS: "" }),
    });
    expect(res.status).toBe(400);
    expect(existsSync(envPath)).toBe(false);
  });

  test("rejects a value containing a line break, without writing .env", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        // A literal newline here would let this value inject an extra line
        // (and thus an extra or shadowing key) into the rewritten .env file.
        SHARE_DIR: `${settingsShareDir}\nEVIL=1`,
        HOST: "127.0.0.1",
        PORT: String(settingsPort),
        CORS_ORIGINS: "",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("line breaks");
    expect(existsSync(envPath)).toBe(false);
  });

  test("413s an oversized body sent without a Content-Length header", async () => {
    const bigBody = `SHARE_DIR=${"x".repeat(100 * 1024)}`;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bigBody));
        controller.close();
      },
    });
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      body: stream,
      // @ts-expect-error duplex is required by undici/Bun for streaming bodies but missing from lib.dom types
      duplex: "half",
    });
    expect(res.status).toBe(413);
    expect(existsSync(envPath)).toBe(false);
  });

  test("403s a cross-origin POST (CSRF defense) without writing .env", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // A same-origin browser form POST never sets an Origin that mismatches
        // the target's own Host — this simulates a cross-site form submission.
        Origin: "http://attacker.example",
      },
      body: new URLSearchParams({
        SHARE_DIR: "/tmp/attacker-controlled",
        HOST: "0.0.0.0",
        PORT: String(settingsPort),
        CORS_ORIGINS: "*",
      }),
    });
    expect(res.status).toBe(403);
    expect(existsSync(envPath)).toBe(false);
  });

  test("rejects a HOST that can't be bound, without writing .env or disrupting the running instance", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        SHARE_DIR: settingsShareDir,
        // TEST-NET-3 (RFC 5737): reserved for documentation, never assigned
        // to a local interface, so binding to it reliably fails everywhere.
        HOST: "203.0.113.1",
        PORT: String(settingsPort),
        CORS_ORIGINS: "",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain("Could not bind");
    expect(existsSync(envPath)).toBe(false);

    const healthRes = await fetch(`${settingsBaseUrl}/health`);
    expect(healthRes.status).toBe(200);
  });

  test("rejects a HOST change to a distinct address already held by another process, without writing .env", async () => {
    // The running instance holds 127.0.0.1:settingsPort. A HOST-only change
    // to a *different*, non-wildcard address on the same port must still be
    // probed on the exact (host, port) pair — otherwise a real conflicting
    // listener there would go undetected (it previously did, when any HOST
    // change was probed on port 0 instead).
    const squatter = Bun.serve({
      hostname: "127.0.0.2",
      port: settingsPort,
      fetch: () => new Response(null, { status: 204 }),
    });
    try {
      const res = await fetch(`${settingsBaseUrl}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          SHARE_DIR: settingsShareDir,
          HOST: "127.0.0.2",
          PORT: String(settingsPort),
          CORS_ORIGINS: "",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("Could not bind");
      expect(existsSync(envPath)).toBe(false);
    } finally {
      await squatter.stop();
    }
  });

  test("rejects a SHARE_DIR that points at a file, without writing .env", async () => {
    const filePath = join(tmpdir(), `hday-helper-not-a-dir-${Date.now()}`);
    writeFileSync(filePath, "not a directory");
    try {
      const res = await fetch(`${settingsBaseUrl}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          SHARE_DIR: filePath,
          HOST: "127.0.0.1",
          PORT: String(settingsPort),
          CORS_ORIGINS: "",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).toContain("is not a directory");
      expect(existsSync(envPath)).toBe(false);
    } finally {
      rmSync(filePath, { force: true });
    }
  });

  // These two tests perform a real (non-rejected) save, so they must run
  // after every test above that asserts .env doesn't exist yet.
  test("accepts a fresh SHARE_DIR that doesn't exist yet, creating it", async () => {
    const freshDir = join(tmpdir(), `hday-helper-fresh-sharedir-${Date.now()}`);
    expect(existsSync(freshDir)).toBe(false);
    try {
      const res = await fetch(`${settingsBaseUrl}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          SHARE_DIR: freshDir,
          HOST: "127.0.0.1",
          PORT: String(settingsPort),
          CORS_ORIGINS: "",
        }),
      });
      expect(res.status).toBe(200);
      // An empty, freshly created share is the expected first-run state —
      // the settings save shouldn't require it to already contain anything.
      expect(existsSync(freshDir)).toBe(true);
    } finally {
      rmSync(freshDir, { recursive: true, force: true });
    }
  });

  test("accepts a HOST-only change on the same PORT without a false bind collision", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        SHARE_DIR: settingsShareDir,
        // Binds every interface, including the one the still-running
        // instance already holds on this same port — naively probing the
        // exact (host, port) pair here would collide with our own listener
        // and wrongly report the combination as unbindable.
        HOST: "0.0.0.0",
        PORT: String(settingsPort),
        CORS_ORIGINS: "",
      }),
    });
    expect(res.status).toBe(200);
  });

  test("allows a POST whose Origin matches the request's own Host", async () => {
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: settingsBaseUrl,
      },
      body: new URLSearchParams({
        SHARE_DIR: settingsShareDir,
        HOST: "127.0.0.1",
        PORT: String(settingsPort),
        CORS_ORIGINS: "",
      }),
    });
    expect(res.status).toBe(200);
  });

  test("POST with valid values rewrites .env, logs the change, and does not disrupt the running instance", async () => {
    const newShareDir = join(settingsShareDir, "moved");
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        SHARE_DIR: newShareDir,
        HOST: "127.0.0.1",
        PORT: String(settingsPort),
        CORS_ORIGINS: "http://new.example",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Restarting");

    const envContent = readFileSync(envPath, "utf-8");
    expect(envContent).toContain(`SHARE_DIR=${newShareDir}`);
    expect(envContent).toContain(`PORT=${settingsPort}`);
    expect(envContent).toContain("HOST=127.0.0.1");
    expect(envContent).toContain("CORS_ORIGINS=http://new.example");

    // The real restart is skipped in this test process, so the original
    // instance (still serving its original SHARE_DIR) must still be up.
    const healthRes = await fetch(`${settingsBaseUrl}/health`);
    expect(healthRes.status).toBe(200);

    const logsRes = await fetch(`${settingsBaseUrl}/logs`);
    const logsBody = await logsRes.text();
    expect(logsBody).toContain("Settings saved via /settings");
  });

  test("escapes a literal dollar sign in SHARE_DIR before writing .env", async () => {
    const dollarShareDir = join(settingsShareDir, "with$dollar");
    const res = await fetch(`${settingsBaseUrl}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        SHARE_DIR: dollarShareDir,
        HOST: "127.0.0.1",
        PORT: String(settingsPort),
        CORS_ORIGINS: "",
      }),
    });
    expect(res.status).toBe(200);

    // Bun's own .env loader expands an unescaped "$dollar" as a variable
    // reference the next time it reads this file — "\$" is its escape for a
    // literal dollar sign, so the written line must carry it escaped.
    const envContent = readFileSync(envPath, "utf-8");
    expect(envContent).toContain(`SHARE_DIR=${settingsShareDir}/with\\$dollar`);
    expect(envContent).not.toContain(`SHARE_DIR=${dollarShareDir}\n`);
  });
});

describe("POST /settings full restart", () => {
  // Unlike the suite above, this test does NOT set
  // HDAY_HELPER_SKIP_RESTART_FOR_TESTS — it exercises the real self-restart
  // (server.stop() + a detached respawn of the same script) end to end, on
  // its own dedicated process/port so it can't disrupt any other test.
  test("actually restarts and serves the new configuration afterward", async () => {
    const shareDir = mkdtempSync(join(tmpdir(), "hday-helper-restart-test-"));
    const newShareDir = mkdtempSync(join(tmpdir(), "hday-helper-restart-test-new-"));
    const port = 20000 + Math.floor(Math.random() * 20000);
    const url = `http://127.0.0.1:${port}`;

    const proc = Bun.spawn(["bun", MAIN_TS], {
      env: { ...process.env, SHARE_DIR: shareDir, PORT: String(port), HOST: "127.0.0.1", CORS_ORIGINS: "" },
      cwd: shareDir,
      stdout: "ignore",
      stderr: "ignore",
    });

    try {
      await waitForServer(`${url}/health`);

      const postRes = await fetch(`${url}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          SHARE_DIR: newShareDir,
          HOST: "127.0.0.1",
          PORT: String(port),
          CORS_ORIGINS: "",
        }),
      });
      expect(postRes.status).toBe(200);

      // The original process now stops and exits; a detached replacement
      // rebinds the same port and should report the new share_dir once up.
      const deadline = Date.now() + 15000;
      let lastBody: { share_dir?: string } = {};
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${url}/health`);
          if (res.ok) {
            lastBody = await res.json();
            if (lastBody.share_dir === newShareDir) break;
          }
        } catch {
          // Old process may already be down and the new one not bound yet.
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(lastBody.share_dir).toBe(newShareDir);
    } finally {
      // `proc` itself already exited as part of the restart (this only
      // matters if the test failed before that happened); the detached
      // replacement process is a different, untracked PID. Best-effort clean
      // it up so it doesn't linger as a background process across local test
      // runs — but verify *which* process holds the port and that it's ours
      // (its command line references this test's main.ts) before killing it,
      // rather than killing whatever unrelated process happens to occupy
      // this randomly-chosen port.
      await killOwnHelperProcessOnPort(port);
      proc.kill();
      rmSync(shareDir, { recursive: true, force: true });
      rmSync(newShareDir, { recursive: true, force: true });
    }
  }, 20000);
});

describe("GET /settings with HOST=0.0.0.0", () => {
  test("offers loopback and every non-internal IPv4 address instead of the literal 0.0.0.0", async () => {
    // "0.0.0.0" isn't something a browser/fetch can dial — it means "every
    // interface", not an address a client connects to — so pasting it into
    // Worktime's helper-URL field would never work. The settings page must
    // substitute real, dialable addresses instead.
    const shareDir = mkdtempSync(join(tmpdir(), "hday-helper-wildcard-host-test-"));
    const port = 20000 + Math.floor(Math.random() * 20000);
    const proc = Bun.spawn(["bun", MAIN_TS], {
      env: { ...process.env, SHARE_DIR: shareDir, PORT: String(port), HOST: "0.0.0.0", CORS_ORIGINS: "" },
      cwd: shareDir,
      stdout: "ignore",
      stderr: "ignore",
    });

    try {
      const baseUrl = `http://127.0.0.1:${port}`;
      await waitForServer(`${baseUrl}/health`);

      const res = await fetch(`${baseUrl}/settings`);
      const body = await res.text();

      expect(body).toContain(`http://127.0.0.1:${port}`);
      expect(body).not.toContain(`http://0.0.0.0:${port}`);

      const lanAddresses = Object.values(networkInterfaces())
        .flat()
        .filter((addr): addr is NonNullable<typeof addr> => !!addr && addr.family === "IPv4" && !addr.internal);
      for (const addr of lanAddresses) {
        expect(body).toContain(`http://${addr.address}:${port}`);
      }

      // Exactly one "Copy" button per offered URL: loopback plus every LAN address.
      const copyButtonCount = (body.match(/class="copy-btn"/g) ?? []).length;
      expect(copyButtonCount).toBe(1 + lanAddresses.length);
    } finally {
      proc.kill();
      rmSync(shareDir, { recursive: true, force: true });
    }
  }, 15000);
});

describe("GET /settings with HOST=::1 (IPv6)", () => {
  test.skipIf(!ipv6LoopbackAvailable)(
    "brackets the IPv6 literal in the copy-paste helper URL",
    async () => {
      // An unbracketed "http://::1:PORT" is not a valid URL — the literal's
      // own colons are indistinguishable from the URL's port separator.
      const shareDir = mkdtempSync(join(tmpdir(), "hday-helper-ipv6-host-test-"));
      const port = 20000 + Math.floor(Math.random() * 20000);
      const proc = Bun.spawn(["bun", MAIN_TS], {
        env: { ...process.env, SHARE_DIR: shareDir, PORT: String(port), HOST: "::1", CORS_ORIGINS: "" },
        cwd: shareDir,
        stdout: "ignore",
        stderr: "ignore",
      });

      try {
        const baseUrl = `http://[::1]:${port}`;
        await waitForServer(`${baseUrl}/health`);

        const res = await fetch(`${baseUrl}/settings`);
        const body = await res.text();

        expect(body).toContain(`http://[::1]:${port}`);
        expect(body).not.toContain(`http://::1:${port}`);
      } finally {
        proc.kill();
        rmSync(shareDir, { recursive: true, force: true });
      }
    },
    15000,
  );
});
