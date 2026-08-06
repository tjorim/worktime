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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const MAIN_TS = join(import.meta.dir, "..", "src", "main.ts");
const ALLOWED_ORIGIN = "http://allowed.example";

let shareDir: string;
let port: number;
let baseUrl: string;
let proc: ReturnType<typeof Bun.spawn>;

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
