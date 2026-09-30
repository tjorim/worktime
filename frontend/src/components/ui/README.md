Generate Base UI primitives here with `pnpm dlx shadcn@latest add <component>`.
`components.json` pins the Base UI style, Lucide icons, the `tw` prefix and `@/lib/utils`.
Restyle generated code with Worktime tokens and run lint before using it.

Shared forms use `Field`, `FieldLabel` and `FieldDescription` with explicit input
IDs; checkbox/switch values use Base UI `onCheckedChange`. `Grid` and `GridItem`
provide responsive twelve-column layouts. Use semantic badge/alert variants and
`buttonVariants` for links. Dialog bodies use `tw:min-h-0 tw:overflow-y-auto tw:p-4`.
See `docs/shared-controls-migration.md` for retained select and toast behaviour.
