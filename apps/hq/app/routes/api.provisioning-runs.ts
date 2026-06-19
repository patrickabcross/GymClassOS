// apps/hq/app/routes/api.provisioning-runs.ts
//
// React Router v7 resource route -- GET /api/provisioning-runs
//
// Operator-only: returns recent provisioning runs joined to studio metadata,
// with per-step status (step_1_at..step_8_at) for the operator dashboard.
// Protected by the HQ auth guard (not in publicPaths).
//
// guard:allow-unscoped -- HQ tables are operator-scoped (no ownableColumns).
// All data is operator-visible (single super-admin deployment model).

import { data, type LoaderFunctionArgs } from "react-router";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProvisioningRunRow {
  id: string;
  studioId: string;
  slug: string;
  displayName: string;
  ownerEmail: string;
  studioStatus: string;
  runStatus: string;
  step1At: string | null;
  step2At: string | null;
  step3At: string | null;
  step4At: string | null;
  step5At: string | null;
  step6At: string | null;
  step7At: string | null;
  step8At: string | null;
  compensationErrors: string;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface ProvisioningRunsResponse {
  runs: ProvisioningRunRow[];
}

// ---------------------------------------------------------------------------
// Loader (resource route -- returns JSON, not HTML)
// ---------------------------------------------------------------------------

export async function loader(_args: LoaderFunctionArgs) {
  const db = getDb();

  // Fetch recent provisioning runs (most recent first, last 50).
  // Joined to hq_studios for slug + displayName + ownerEmail.
  const runRows = await db
    .select({
      id: schema.hqProvisioningRuns.id,
      studioId: schema.hqProvisioningRuns.studioId,
      slug: schema.hqStudios.slug,
      displayName: schema.hqStudios.displayName,
      ownerEmail: schema.hqStudios.ownerEmail,
      studioStatus: schema.hqStudios.status,
      runStatus: schema.hqProvisioningRuns.status,
      step1At: schema.hqProvisioningRuns.step1At,
      step2At: schema.hqProvisioningRuns.step2At,
      step3At: schema.hqProvisioningRuns.step3At,
      step4At: schema.hqProvisioningRuns.step4At,
      step5At: schema.hqProvisioningRuns.step5At,
      step6At: schema.hqProvisioningRuns.step6At,
      step7At: schema.hqProvisioningRuns.step7At,
      step8At: schema.hqProvisioningRuns.step8At,
      compensationErrors: schema.hqProvisioningRuns.compensationErrors,
      startedAt: schema.hqProvisioningRuns.startedAt,
      completedAt: schema.hqProvisioningRuns.completedAt,
      updatedAt: schema.hqProvisioningRuns.updatedAt,
    })
    .from(schema.hqProvisioningRuns)
    .innerJoin(
      schema.hqStudios,
      eq(schema.hqProvisioningRuns.studioId, schema.hqStudios.id),
    )
    .orderBy(desc(schema.hqProvisioningRuns.startedAt))
    .limit(50);

  const runs: ProvisioningRunRow[] = runRows.map((r) => ({
    id: r.id,
    studioId: r.studioId,
    slug: r.slug,
    displayName: r.displayName,
    ownerEmail: r.ownerEmail,
    studioStatus: r.studioStatus,
    runStatus: r.runStatus,
    step1At: r.step1At,
    step2At: r.step2At,
    step3At: r.step3At,
    step4At: r.step4At,
    step5At: r.step5At,
    step6At: r.step6At,
    step7At: r.step7At,
    step8At: r.step8At,
    compensationErrors: r.compensationErrors,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    updatedAt: r.updatedAt,
  }));

  return data<ProvisioningRunsResponse>({ runs });
}
