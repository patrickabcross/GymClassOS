/**
 * apps/hq/server/db/index.ts
 *
 * HQ Drizzle database client.
 *
 * Mirrors the apps/staff-web/server/db/index.ts pattern exactly:
 *   createGetDb(schema) + db Proxy + export { schema }
 *
 * Schema composition:
 *   - Dispatch tables   — from @agent-native/dispatch/db (framework Dispatch)
 *   - Brain tables      — from ./brain-schema.ts (Brain template copy-out)
 *   - HQ schema tables  — from ./schema.ts → @gymos/hq-schema (hq_app_meta;
 *                         BD2 will add studio_registry, provisioning_runs, etc.)
 *
 * The merged schema is passed to createGetDb so every HQ server route can
 * query any of these tables through a single `db` handle.
 */

import { createGetDb } from "@agent-native/core/db";
import { schema as dispatchSchema } from "@agent-native/dispatch/db";
import * as brainSchema from "./brain-schema.js";
import * as hqSchema from "./schema.js";
import { registerShareableResource } from "@agent-native/core/sharing";

export const schema = { ...dispatchSchema, ...brainSchema, ...hqSchema };

export const getDb = createGetDb(schema);

// Backwards compat — many files import `db` directly
export const db = new Proxy({} as any, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});

// Register Brain shareable resources
registerShareableResource({
  type: "brain-source",
  resourceTable: brainSchema.brainSources,
  sharesTable: brainSchema.brainSourceShares,
  displayName: "Brain Source",
  titleColumn: "title",
  getResourcePath: (source) => `/brain/sources/${source.id}`,
  getDb,
});

registerShareableResource({
  type: "brain-knowledge",
  resourceTable: brainSchema.brainKnowledge,
  sharesTable: brainSchema.brainKnowledgeShares,
  displayName: "Brain Knowledge",
  titleColumn: "title",
  getResourcePath: (knowledge) => `/brain/knowledge/${knowledge.id}`,
  getDb,
});

registerShareableResource({
  type: "brain-proposal",
  resourceTable: brainSchema.brainProposals,
  sharesTable: brainSchema.brainProposalShares,
  displayName: "Brain Proposal",
  titleColumn: "title",
  getResourcePath: (proposal) => `/brain/review/${proposal.id}`,
  getDb,
});
