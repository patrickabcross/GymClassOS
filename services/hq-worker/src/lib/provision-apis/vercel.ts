/**
 * Vercel SDK adapter — implements VercelApi interface.
 *
 * Find-or-create idempotency: Vercel enforces project-name uniqueness per team,
 * but using getProjects({ search }) before createProject avoids a 400/409 on
 * retry and is the safer idempotency pattern (Pitfall P-01 analogue for Vercel).
 *
 * Deployment readiness is polled via the deployment ID (not the custom subdomain)
 * to avoid false failures during DNS propagation (Pitfall P-05 / Research Pattern 2).
 *
 * CRITICAL D-13: setEnvVars receives the dbUrl from the saga caller.
 * This adapter NEVER writes any connection string to an HQ DB column.
 */

import { Vercel } from "@vercel/sdk";
import type { VercelApi } from "./types.js";

/** Maximum time to wait for a deployment to reach READY state (10 minutes). */
const DEPLOY_TIMEOUT_MS = 600_000;
/** Polling interval while waiting for deployment readiness. */
const DEPLOY_POLL_INTERVAL_MS = 10_000;

export function createVercelApi(env: {
  VERCEL_BEARER_TOKEN?: string | undefined;
  VERCEL_TEAM_ID?: string | undefined;
}): VercelApi {
  if (!env.VERCEL_BEARER_TOKEN) {
    throw new Error(
      "[provision] deferred-on-external-dependency: VERCEL_BEARER_TOKEN is not set. " +
        "Set it via `fly secrets set VERCEL_BEARER_TOKEN=<value> -a gymos-hq-worker`. " +
        "Unit tests use the mock adapter instead.",
    );
  }

  const client = new Vercel({ bearerToken: env.VERCEL_BEARER_TOKEN });
  const teamId = env.VERCEL_TEAM_ID;

  return {
    /**
     * Search for an existing gymos-{slug} Vercel project.
     * Returns null if none found — caller proceeds to createProject.
     *
     * Uses getProjects({ search }) + exact name match to avoid false positives
     * from prefix collisions.
     *
     * NOTE: The SDK response is GetProjectsResponseBody2 | GetProjectsResponseBody3 |
     * Array<GetProjectsResponseBody1>. We normalise to the paginated shape which
     * has a `projects` field containing the matched items.
     */
    async findProjectBySlug(slug: string) {
      const projectName = `gymos-${slug}`;
      try {
        const resp = await client.projects.getProjects({
          search: projectName,
          limit: "10",
          ...(teamId ? { teamId } : {}),
        });
        // GetProjectsResponseBody can be an Array (older format) or { projects: [...] }
        const projectList: Array<{ name: string; id: string }> = Array.isArray(
          resp,
        )
          ? (resp as Array<{ name: string; id: string }>)
          : ((resp as { projects?: Array<{ name: string; id: string }> })
              .projects ?? []);

        const existing = projectList.find((p) => p.name === projectName);
        if (!existing) return null;
        return { projectId: existing.id };
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 404) return null;
        throw err;
      }
    },

    /**
     * Create a Vercel project for the studio.
     * Framework: react-router (matches the staff-web app in this repo).
     */
    async createProject(slug: string) {
      const projectName = `gymos-${slug}`;
      const proj = await client.projects.createProject({
        ...(teamId ? { teamId } : {}),
        requestBody: {
          name: projectName,
          framework: "react-router" as never,
        },
      });
      return { projectId: proj.id };
    },

    /**
     * Set (or update) environment variables on a Vercel project.
     * Uses upsert="true" so repeated calls are idempotent.
     *
     * Values include the Neon connection string — NEVER written to HQ DB (D-13).
     */
    async setEnvVars(projectId: string, vars: Record<string, string>) {
      const envEntries = Object.entries(vars).map(([key, value]) => ({
        key,
        value,
        type: "encrypted" as const,
        target: ["production", "preview"] as ["production", "preview"],
      }));

      await client.projects.createProjectEnv({
        idOrName: projectId,
        upsert: "true",
        ...(teamId ? { teamId } : {}),
        requestBody: envEntries as never,
      });
    },

    /**
     * Trigger a deployment from the main branch.
     */
    async deploy(projectId: string) {
      const deploy = await client.deployments.createDeployment({
        ...(teamId ? { teamId } : {}),
        requestBody: {
          name: projectId,
          gitSource: {
            type: "github",
            ref: "main",
          } as never,
        },
      });
      return { deployId: deploy.id };
    },

    /**
     * Poll until the deployment reaches READY state.
     *
     * CRITICAL (Pitfall P-05): Polls via the Vercel deployment ID, NOT the custom
     * subdomain. DNS propagation takes 30-120 seconds and causes false failures.
     */
    async waitForDeploy(deployId: string) {
      const deadline = Date.now() + DEPLOY_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const d = await client.deployments.getDeployment({
          idOrUrl: deployId,
          ...(teamId ? { teamId } : {}),
        });

        const state = d.readyState as string;
        if (state === "READY") return;
        if (state === "ERROR" || state === "CANCELED" || state === "BLOCKED") {
          throw new Error(
            `[vercel] Deployment ${deployId} reached terminal state: ${state}`,
          );
        }

        await new Promise((r) => setTimeout(r, DEPLOY_POLL_INTERVAL_MS));
      }
      throw new Error(
        `[vercel] Deployment ${deployId} timed out after ${DEPLOY_TIMEOUT_MS}ms`,
      );
    },

    /**
     * Attach a custom domain (e.g. slug.gymclassos.com) to the project.
     */
    async attachDomain(projectId: string, domain: string) {
      await client.projects.addProjectDomain({
        idOrName: projectId,
        ...(teamId ? { teamId } : {}),
        requestBody: { name: domain },
      });
    },

    /**
     * Delete a Vercel project (LIFO rollback compensation).
     * Treats 404 as success — idempotent rollback.
     */
    async deleteProject(projectId: string) {
      try {
        await client.projects.deleteProject({
          idOrName: projectId,
          ...(teamId ? { teamId } : {}),
        });
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status !== 404) throw err;
      }
    },
  };
}
