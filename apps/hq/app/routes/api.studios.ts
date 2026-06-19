// apps/hq/app/routes/api.studios.ts
//
// React Router v7 resource route -- GET /api/studios
//
// HQB-01: Returns one row per studio with latest snapshot aggregates,
// 30-day token spend, and a computed classifyStudioHealth result.
// Powers the operator console table (BD3-02 UI) and the list-studios agent
// action.
//
// Staleness-first (HQB-03, D-02): studios with null or stale
// last_telemetry_received_at are classified "stale"/"unknown" — they are
// never shown as "healthy" in the classification engine.
//
// No LLM in the trust path (D-01): health classification is pure TS over
// telemetry aggregates.
//
// guard:allow-unscoped -- HQ tables are operator-scoped (single super-admin)

import { data, type LoaderFunctionArgs } from "react-router";
import {
  queryStudiosWithHealth,
  type StudioConsoleRow,
  type StudiosResponse,
} from "../../server/lib/list-studios-query.js";

// Re-export types so UI routes can import them from this resource module.
export type { StudioConsoleRow, StudiosResponse };

// ---------------------------------------------------------------------------
// Loader (resource route — returns JSON, not HTML)
// ---------------------------------------------------------------------------

export async function loader(_args: LoaderFunctionArgs) {
  const studios = await queryStudiosWithHealth();
  return data<StudiosResponse>({ studios });
}
