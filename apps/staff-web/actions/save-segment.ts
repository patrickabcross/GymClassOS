// save-segment — AEM-04
//
// Build (save) a named Campaigns segment from filter criteria. The segment is
// a stored FILTER SPEC (not a materialized member list) in the framework
// application_state table under the key gymos-campaign-segments — NO schema
// change. Filters are AND-composed. The UI-driven builder writes the IDENTICAL
// spec via the same action HTTP endpoint, so UI and agent stay in sync (D-04).
//
// Agent-only mutation: no `http` key (a GET would suppress the live-refresh
// source:"action" signal the Campaigns tab listens for).

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import {
  readAppState,
  writeAppState,
} from "@agent-native/core/application-state";
import { nanoid } from "nanoid";

// Single app-state key holding an array of segment specs (one fetch returns all).
const SEGMENTS_KEY = "gymos-campaign-segments";

export default defineAction({
  description:
    "Build (save) a named Campaigns segment from filter criteria. Filters are AND-composed: " +
    "minClassesAttended (>= N attended bookings), notAttendedInDays (last attended before now-N days, or never), " +
    "inquiryBefore / inquiryAfter (member created_at before/after an ISO date). All filters optional, but supply " +
    "at least one. The saved segment appears on the Campaigns tab without a reload. " +
    "Returns {saved:true, segmentId, name} | {error}.",
  schema: z
    .object({
      name: z.string().min(1).max(80),
      minClassesAttended: z.number().int().min(1).max(10000).optional(),
      notAttendedInDays: z.number().int().min(1).max(365).optional(),
      inquiryBefore: z.string().optional(), // ISO date string
      inquiryAfter: z.string().optional(), // ISO date string
    })
    .strict(),
  run: async ({
    name,
    minClassesAttended,
    notAttendedInDays,
    inquiryBefore,
    inquiryAfter,
  }) => {
    const filters = {
      minClassesAttended,
      notAttendedInDays,
      inquiryBefore,
      inquiryAfter,
    };
    // Require at least one filter so we never save an "everyone" segment by accident.
    const hasFilter = Object.values(filters).some((v) => v !== undefined);
    if (!hasFilter) return { error: "NO_FILTERS" };

    // guard:allow-unscoped — application_state is framework-scoped, no ownable gym table touched
    const existing = (await readAppState(SEGMENTS_KEY)) as {
      segments?: unknown[];
    } | null;
    const segments = Array.isArray(existing?.segments)
      ? existing!.segments!
      : [];

    const segmentId = `seg_${nanoid()}`;
    segments.push({
      id: segmentId,
      name,
      filters,
      createdAt: new Date().toISOString(),
    });

    // Pass the object directly — writeAppState JSON.stringifies internally.
    // guard:allow-unscoped — application_state is framework-scoped
    await writeAppState(SEGMENTS_KEY, { segments });
    return { saved: true, segmentId, name };
  },
});
