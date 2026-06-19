import { createGetDb } from "@agent-native/core/db";
import { schema } from "@agent-native/dispatch/db";
import * as brainSchema from "./brain-schema.js";
import { registerShareableResource } from "@agent-native/core/sharing";

const mergedSchema = { ...schema, ...brainSchema };

export const getDb = createGetDb(mergedSchema);

export { mergedSchema as schema };

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
