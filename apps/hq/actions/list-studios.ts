// apps/hq/actions/list-studios.ts
//
// defineAction: list-studios
//
// Returns all studios with latest telemetry snapshot aggregates, 30-day token
// spend, and a deterministic health classification (no LLM, D-01).
//
// The agent (HQB Brain/Dispatcher) uses this tool to:
//   - List all operator studio customers with health signals
//   - Identify at-risk studios (dormant / under-messaging / low-retention)
//   - Identify power-user studios (high engagement + healthy retention)
//   - Check which studios have stale/missing telemetry (HQB-03)
//
// Schema is intentionally minimal — the agent can filter/sort client-side.
// No member identifiers are present (HQ Neon contains only aggregate telemetry).

import { defineAction } from "@agent-native/core";
import { z } from "zod";
import {
  queryStudiosWithHealth,
  type StudiosResponse,
} from "../server/lib/list-studios-query.js";

export default defineAction({
  description:
    "List all provisioned studio customers with their health classification and " +
    "telemetry aggregates. Returns one row per studio including: health status " +
    "(healthy/at-risk/stale), cohort (power-user/at-risk/healthy/unknown), " +
    "active members, messages sent, retention rate, 30-day token spend, and " +
    "the human-readable signals array explaining any at-risk classification. " +
    "Use this to identify studios that need operator attention.",
  schema: z.object({}).strict(),
  http: { method: "GET" },
  readOnly: true,
  run: async (): Promise<StudiosResponse> => {
    const studios = await queryStudiosWithHealth();
    return { studios };
  },
});
