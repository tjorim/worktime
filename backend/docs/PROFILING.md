# Profiling Slow Requests and MCP Calls

Python 3.15 ships a sampling profiler in the standard library, `profiling.sampling` ("Tachyon"). It reads the interpreter's stacks from outside the process, so the backend needs no code changes, no extra dependency and no restart to be profiled. Use it to investigate a specific slow route or MCP tool locally. It is **not enabled in production** (see [Production](#production)).

## Find the slow request first

Start from the request log, not the profiler. Every response carries `Server-Timing: app;dur=…, db;desc="N queries";dur=…` (visible in the browser devtools Network tab), and a request slower than 300 ms is logged as a warning with its method, route template, status, duration and query count (`app/middleware/request_timing.py`). Many queries for one request is an N+1 pattern that the SQL log explains better than a profile does. A high `app` time with few queries is what a profile is for. `X-Request-ID` ties the response to the structured request log ([OBSERVABILITY.md](OBSERVABILITY.md)).

## Local setup

Run the backend against a local PostgreSQL with the dev auth bypass, so requests can be replayed with a fixed bearer token:

```bash
cd backend
export ENVIRONMENT=development \
  DATABASE_URL=postgresql+asyncpg://worktime:worktime@127.0.0.1:5432/worktime \
  DEV_AUTH_BYPASS_TOKEN=dev-profiling \
  RATE_LIMIT_ENABLED=false
uv run alembic upgrade head
```

`RATE_LIMIT_ENABLED=false` keeps a replay loop from being cut off at 200 requests per minute.

## Choose the mode

Worktime's handlers are `async def`, so one event loop thread does nearly all the work.

| Target | Flags | Why |
|---|---|---|
| REST routes and MCP tools (`async def`) | `--async-aware` | Reconstructs stacks per asyncio task, so the flamegraph shows the request's call path (middleware → route or tool → SQLAlchemy) instead of only the idle loop. |
| CPU-bound work (JWT verification, serialization) | `--mode cpu` | Counts on-CPU time only. The default wall-clock mode is dominated by the idle event loop (`asyncio.Runner.run`). |
| A request that hangs | `dump <pid>` | Prints what every thread is doing right now. |

## Profile a fresh server

Start uvicorn under the profiler for a fixed duration, then replay the slow request while it runs:

```bash
uv run python -m profiling.sampling run --async-aware -d 30 \
  --flamegraph -o /tmp/time-off.html \
  -m uvicorn app.main:app --port 8000

# in another shell
for i in $(seq 300); do
  curl -s -o /dev/null -H 'Authorization: Bearer dev-profiling' http://localhost:8000/api/time-off
done
```

The server stops when the window ends and the report is written then. Open the HTML in a browser, or use `--pstats -o /tmp/api.pstats` and read it from the terminal:

```bash
uv run python -c "import pstats; pstats.Stats('/tmp/api.pstats').sort_stats('cumulative').print_stats(r'app/', 25)"
```

MCP tools reject the dev bypass token, so create a managed integration key once (it is shown only in this response):

```bash
curl -s -X POST http://localhost:8000/api/integration-clients \
  -H 'Authorization: Bearer dev-profiling' -H 'Content-Type: application/json' \
  -d '{"name": "profiling"}'
```

Then call the same `search_tools` / `call_tool` sequence through a FastMCP client against `http://localhost:8000/mcp/` with `Authorization: Bearer <key>` while the profiler runs. Integration keys are limited to 120 requests per minute (`rate_limit_per_minute` on the client), independently of `RATE_LIMIT_ENABLED`, so a long load loop with one key starts failing after that. Use a few keys or shorter bursts.

## Attach to a running server

To catch a slowdown that only appears after the server has been up a while, attach by PID instead of restarting. Use the PID of the Python process that listens on the port (`ss -ltnp | grep :8000`), not the `uv run` wrapper that started it:

```bash
uv run python -m profiling.sampling attach --async-aware -d 15 --flamegraph -o /tmp/attach.html <uvicorn-pid>
uv run python -m profiling.sampling dump <uvicorn-pid>
```

Attaching needs ptrace permission on the target. Locally that means the same user and `kernel.yama.ptrace_scope` 0, or running the profiler as root.

## Reading the output

- Run one profiler at a time. Concurrent attaches raise the reported error rate (samples that could not be read). A single `--async-aware` run stays in the low single digits; thread sampling (`-a`) reads higher.
- Compare against a baseline when checking a fix: record it with `--binary -o before.bin`, then run `--diff-flamegraph before.bin` on the second run.
- A profile holds function names, file paths, line numbers and sample counts, not argument or variable values. The flamegraph HTML also embeds the source lines of the sampled frames. Treat both as local diagnostics rather than something to publish.

## Production

Not enabled. Attaching to a container's PID 1 depends on the host's ptrace policy (`kernel.yama.ptrace_scope`), the container's seccomp profile and capabilities (`CAP_SYS_PTRACE`), and a collection and retention policy for profiles, which does not exist yet. Those belong to `tjorim/apps` and need their own review before anything changes there. Reproduce locally with production-like data volumes instead.

Measurements and decisions from the Python 3.15 upgrade are recorded in #1481.
