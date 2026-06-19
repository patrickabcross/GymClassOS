/**
 * Neon Management API adapter — implements NeonApi interface.
 *
 * Find-or-create idempotency: Neon does NOT enforce project-name uniqueness
 * at the API level (GET-before-POST is the ONLY safe path — Pitfall P-01).
 * Every createProject call is preceded by findProjectBySlug.
 *
 * CRITICAL D-13: createProject RETURNS the dbUrl to the caller.
 * The connection string is NEVER written to any HQ DB row — it passes
 * directly to the Vercel/Fly env steps inside the saga.
 */

import { createApiClient } from "@neondatabase/api-client";
import type { NeonApi } from "./types.js";

const REGION_ID = "aws-eu-west-2" as const;
const PG_VERSION = 16 as const;
const DATABASE_NAME = "neondb" as const;
const ROLE_NAME = "neondb_owner" as const;

export function createNeonApi(env: {
  NEON_API_KEY?: string | undefined;
}): NeonApi {
  const apiKey = env.NEON_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[provision] deferred-on-external-dependency: NEON_API_KEY is not set. " +
        "Set it via `fly secrets set NEON_API_KEY=<value> -a gymos-hq-worker`. " +
        "Unit tests use the mock adapter instead.",
    );
  }

  const client = createApiClient({ apiKey });

  return {
    /**
     * Search for an existing gymos-{slug} project.
     * Returns null if none found — caller proceeds to createProject.
     *
     * NOTE: Neon listProjects({ search }) does a substring match on name/id.
     * We then exact-match on `name === "gymos-{slug}"` to avoid false positives
     * from prefix collisions (e.g. "gymos-test" matching "gymos-test-2").
     */
    async findProjectBySlug(slug: string) {
      const projectName = `gymos-${slug}`;
      const resp = await client.listProjects({ search: projectName });
      const existing = resp.data.projects.find(
        (p: { name: string; id: string }) => p.name === projectName,
      );
      if (!existing) return null;
      return { projectId: existing.id };
    },

    /**
     * Create a new Neon project for the studio.
     *
     * Returns:
     *   projectId   — stored in hq_provisioning_runs.neon_project_id (not a DSN)
     *   dbUrl       — pooled connection string (passed to Vercel/Fly env, never HQ)
     *   dbUrlUnpooled — unpooled connection string (passed to Fly env, never HQ)
     *
     * D-13: Neither dbUrl nor dbUrlUnpooled is written to any HQ DB column.
     */
    async createProject(slug: string) {
      const projectName = `gymos-${slug}`;
      const createResp = await client.createProject({
        project: {
          name: projectName,
          region_id: REGION_ID,
          pg_version: PG_VERSION,
        },
      });

      const projectId = createResp.data.project.id;

      // The create response includes connection_uris[0] for the unpooled URL
      const dbUrlUnpooled =
        createResp.data.connection_uris[0]?.connection_uri ?? "";

      // Pooled URL requires a separate GET — research confirmed this is a distinct call
      const pooledUri = await this.getPooledConnectionUri(projectId);

      return {
        projectId,
        dbUrl: pooledUri,
        dbUrlUnpooled,
      };
    },

    /**
     * Fetch the pooled (PgBouncer) connection URI for an existing project.
     * Used both during createProject and when resuming a partially-complete saga step.
     */
    async getPooledConnectionUri(projectId: string): Promise<string> {
      const uriResp = await client.getConnectionUri({
        projectId,
        database_name: DATABASE_NAME,
        role_name: ROLE_NAME,
        pooled: true,
      });
      return uriResp.data.uri;
    },

    /**
     * Delete a Neon project (LIFO rollback compensation).
     * Treats 404 as success — idempotent rollback.
     */
    async deleteProject(projectId: string): Promise<void> {
      try {
        await client.deleteProject(projectId);
      } catch (err: unknown) {
        // 404 means already deleted — treat as success (idempotent rollback)
        const status = (err as { status?: number })?.status;
        if (status !== 404) throw err;
      }
    },
  };
}
