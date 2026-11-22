# Worktime documentation

## Architecture and data contracts

- [Architecture](ARCHITECTURE.md) describes the source layout across the web, backend, Android and Pebble apps.
- [Authorisation model](authorization-model.md) covers permissions and access boundaries.
- [API errors](api-errors.md) defines the error response and request ID conventions.
- [Sync data safety](sync-data-safety.md) explains conflict resolution and protection against data loss.
- [Idempotency contract](idempotency-contract.md) specifies stable identities and retry behaviour.
- [Browser persistence contract](browser-persistence-contract.md) describes browser storage and its lifecycle.
- [Local backup](local-backup.md) describes export and restore behaviour.
- [Live updates](../AGENTS.md#live-updates) documents SSE and Android background wake signals.

## Formats and integrations

- [.hday format specification](hday-format-spec.md)
- [Local MCP server](integrations/LOCAL_MCP_SERVER.md)
- [Play Store listing](play-store/store_listing.md) and [data safety declarations](play-store/data_safety.csv)

## Development and maintenance

- [Toolchain](toolchain.md) covers Node and pnpm.
- [UI maintenance](ui-maintenance.md) covers Base UI and shadcn updates.
- [shadcn adoption audit](shadcn-adoption-audit.md) records which UI compositions to keep, extend or replace.
- [Bundle budgets](bundle-budgets.md) covers frontend size limits.
- [Redact compatibility](redact-compatibility.md) covers the browser compatibility workflow.

## Archive

[Finished migrations, audits and past plans](archive/) record the decisions and conditions at the time they were written.
