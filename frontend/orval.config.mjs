// Orval writes the API types: one file per schema in the backend's OpenAPI document, no client code.
// `scripts/api-types.mjs` runs it (`pnpm api:generate` / `pnpm api:check`) and may point `API_SCHEMA_DIR`
// at a scratch directory to compare a fresh generation with the committed one.
//
// `useTypeOverInterfaces` makes every record a `type` alias, so a record is assignable to a generic row
// (`Record<string, unknown>`) the way the screens pass them; an interface is not.
export default {
  api: {
    input: {
      target: "./openapi.json",
      override: {
        // Keep compatibility operations in OpenAPI and generate web types from canonical routes.
        transformer: (spec) => {
          const paths = Object.fromEntries(
            Object.entries(spec.paths).flatMap(([path, operations]) => {
              const canonical = Object.entries(operations).filter(
                ([, operation]) => !operation.deprecated,
              );
              return canonical.length ? [[path, Object.fromEntries(canonical)]] : [];
            }),
          );
          return { ...spec, paths };
        },
      },
    },
    output: {
      schemas: process.env.API_SCHEMA_DIR ?? "./src/api-schema",
      override: { useTypeOverInterfaces: true },
    },
  },
};
