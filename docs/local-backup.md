# Local backup restore

The Settings backup format supports version 1 only. Unsupported versions and
invalid records are rejected before preferences or collections are replaced.
Record IDs must be nonempty and unique within their domain. Dates, time values,
optional fields and references must be valid. Errors identify the section and
one-based record position; position 0 identifies the section or format itself.

An omitted section leaves that domain untouched. An explicitly empty array (or
empty work-location object) replaces the domain with no records, including
server-only records when signed in. A preferences-only restore needs no domain
sync. Export continues omitting empty domains for compatibility; clearing a domain
requires an explicitly present empty section.

Task-to-Gantt and Gantt-to-label links survive export and restore. For partial
backups, a referenced target must exist either in the included replacement target
domain or, when that domain is omitted, in the current local collection. Missing
targets reject the entire restore rather than silently removing links. Sync the
destination first or include the target domain in the backup before trying again.
Older backups whose exports already lost these fields cannot recover the links.
