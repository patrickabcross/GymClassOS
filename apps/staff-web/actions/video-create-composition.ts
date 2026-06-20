// video-create-composition — CV3-01
//
// Draft a new video composition. Accepts:
//   - fromClass: build spec via specForClassPromo (agent "15-second promo" path)
//   - spec: a complete VideoSpec object (validated before persist)
//   - neither: use defaultSpec()
//   - id: optional client-generated id for optimistic UI
//   - title: optional title (defaults "Untitled")
//
// Status is always 'draft'. spec stored as JSON.stringify(VideoSpec).
//
// Agent-callable mutation: no `http` key (POST to /_agent-native/actions/video-create-composition).
// DIRECT — no propose-action gate. Staff-only authoring, like content-create-document.
//
// Two-exposure: defined here (auto-registered) AND named in agent-chat.ts
// Video tab section AND documented in apps/staff-web/AGENTS.md.

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { writeAppState } from "@agent-native/core/application-state";
import { nanoid } from "nanoid";
import { slugify } from "../server/lib/content-slug.js";
import {
  VideoSpecSchema,
  defaultSpec,
  specForClassPromo,
} from "../server/lib/video-spec.js";

const FromClassSchema = z.object({
  className: z.string().min(1),
  classTime: z.string().optional(),
  offer: z.string().optional(),
  catchphrase: z.string().optional(),
});

export default defineAction({
  description:
    "Draft a new video composition (always 'draft'). " +
    "Three paths for the initial spec: " +
    "(1) fromClass: { className, classTime?, offer?, catchphrase? } → agent builds a ~15-second promo " +
    "spec automatically (specForClassPromo). Use for 'draft a promo for our HIIT class'. " +
    "(2) spec: a complete VideoSpec JSON object (validated; rejected if malformed). " +
    "(3) neither → minimal two-scene default spec. " +
    "An optional id can be supplied for optimistic UI (the caller generates it, navigates immediately, " +
    "this action persists the row). title defaults to 'Untitled'. " +
    "Returns {id, title, status, slug}.",
  schema: z.object({
    id: z.string().optional().describe("Pre-generated id for optimistic UI"),
    title: z.string().max(500).optional().describe("Composition title (defaults 'Untitled')"),
    spec: VideoSpecSchema.optional().describe(
      "Complete VideoSpec object to store (validated). If omitted and fromClass not supplied, uses defaultSpec.",
    ),
    fromClass: FromClassSchema.optional().describe(
      "Build spec from class details — className required, rest optional.",
    ),
  }),

  run: async ({ id: suppliedId, title: suppliedTitle, spec: suppliedSpec, fromClass }) => {
    const db = getDb();
    const id = suppliedId ?? nanoid();
    const title = suppliedTitle ?? "Untitled";
    const slug = slugify(title) || id;
    const now = new Date().toISOString();

    // Build the spec
    let spec = defaultSpec();

    if (fromClass) {
      spec = specForClassPromo(fromClass);
    } else if (suppliedSpec !== undefined) {
      // Validate the caller-supplied spec
      const parsed = VideoSpecSchema.safeParse(suppliedSpec);
      if (!parsed.success) {
        return { error: "INVALID_SPEC", issues: parsed.error.issues };
      }
      spec = parsed.data;
    }

    // guard:allow-unscoped — single-tenant video
    await db.insert(schema.videoCompositions).values({
      id,
      title,
      spec: JSON.stringify(spec),
      status: "draft",
      slug,
      createdAt: now,
      updatedAt: now,
    });

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { id, title, status: "draft", slug };
  },
});
