// Pure helpers for brain-init — no framework / DB imports.
// Exported separately so unit tests can import without pulling in
// @agent-native/core (which uses CJS React, breaking ESM vitest).

/** Serialise class definition rows into the catalog JSON body.
 *  Each entry: { name, description, durationMin, category }. */
export function buildCatalogBody(
  defs: {
    name: string;
    description: string | null;
    durationMin: number;
    category: string | null;
  }[],
): string {
  return JSON.stringify(
    defs.map((d) => ({
      name: d.name,
      description: d.description,
      durationMin: d.durationMin,
      category: d.category,
    })),
  );
}
