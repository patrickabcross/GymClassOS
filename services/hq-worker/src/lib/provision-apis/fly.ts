/**
 * Fly Machines REST API + flyctl execa adapter — implements FlyApi interface.
 *
 * App lifecycle uses the Machines REST API (api.machines.dev).
 * Secrets MUST use `flyctl secrets set` via execa array args (NOT the REST
 * /secrets endpoint — that path is restricted to Fly KMS, not GA as of 2026-06).
 *
 * Security invariants:
 *   - execa is always called with ARRAY args (["flyctl", [...], opts]) — never
 *     a shell string. Array form prevents shell injection (Research Pattern 3).
 *   - Logger receives key NAMES only (`pairs.map(p => p.split("=")[0])`),
 *     never secret values (Pitfall P-04).
 *
 * Ordering rule (Pitfall P-02):
 *   (1) createApp  →  (2) setSecrets --stage  →  (3) createMachine
 * The machine picks up staged secrets on first start.
 *
 * CRITICAL D-13: setSecrets receives a `secrets` object containing the Neon
 * connection string passed by the saga. This adapter NEVER writes that value
 * to any HQ DB column.
 */

import { execa } from "execa";
import { getLogger } from "../logger.js";
import type { FlyApi } from "./types.js";

const FLY_API = "https://api.machines.dev";

/** Prefix applied to all Fly app names managed by GymClassOS. */
function appName(slug: string): string {
  return `gymos-${slug}-worker`;
}

export function createFlyApi(env: {
  FLY_API_TOKEN?: string | undefined;
  FLY_ORG_SLUG?: string | undefined;
  GYMOS_WORKER_IMAGE?: string | undefined;
}): FlyApi {
  const token = env.FLY_API_TOKEN;
  if (!token) {
    throw new Error(
      "[provision] deferred-on-external-dependency: FLY_API_TOKEN is not set. " +
        "Must be an org-scoped token created via: " +
        "fly tokens create org -n gymos-provisioner -o <org>. " +
        "Set it via `fly secrets set FLY_API_TOKEN=<value> -a gymos-hq-worker`. " +
        "Unit tests use the mock adapter instead.",
    );
  }

  const authHeader = { Authorization: `Bearer ${token}` } as const;

  return {
    /**
     * Returns true if the Fly app gymos-{slug}-worker already exists.
     * Used for find-or-create idempotency before createApp.
     *
     * 200 → exists, 404 → does not exist, anything else → throw.
     */
    async appExists(slug: string): Promise<boolean> {
      const resp = await fetch(`${FLY_API}/v1/apps/${appName(slug)}`, {
        headers: authHeader,
      });
      if (resp.ok) return true;
      if (resp.status === 404) return false;
      throw new Error(
        `[fly] Unexpected status ${resp.status} checking app ${appName(slug)}`,
      );
    },

    /**
     * Create the Fly app.
     * Must be called BEFORE setSecrets or createMachine (Pitfall P-02).
     */
    async createApp(slug: string): Promise<void> {
      if (!env.FLY_ORG_SLUG) {
        throw new Error(
          "[provision] deferred-on-external-dependency: FLY_ORG_SLUG is not set.",
        );
      }
      const resp = await fetch(`${FLY_API}/v1/apps`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          app_name: appName(slug),
          org_slug: env.FLY_ORG_SLUG,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(
          `[fly] createApp failed (${resp.status}): ${body}`,
        );
      }
    },

    /**
     * Set secrets on the Fly app via `flyctl secrets set --stage`.
     *
     * SECURITY: execa is called with an ARRAY of args (never a shell string).
     * Array form prevents shell injection — each key=value pair is a separate
     * array element. A value containing `;rm -rf` is a single opaque string
     * element, not a shell command.
     *
     * LOGGING: Only key names are logged, NEVER secret values (Pitfall P-04).
     */
    async setSecrets(
      slug: string,
      secrets: Record<string, string>,
    ): Promise<void> {
      const log = getLogger();

      // Build "KEY=value" pairs as individual array elements (injection-safe).
      const pairs: string[] = Object.entries(secrets).map(
        ([k, v]) => `${k}=${v}`,
      );

      // Log KEY NAMES ONLY — never values (Pitfall P-04).
      log.info(
        {
          app: appName(slug),
          keys: pairs.map((p) => p.split("=")[0]),
        },
        "[fly] setting secrets",
      );

      // Shell out via execa with ARRAY args (NOT a template string).
      // Each pair is a separate element; no shell interpolation occurs.
      await execa(
        "flyctl",
        ["secrets", "set", "--app", appName(slug), "--stage", ...pairs],
        {
          env: {
            ...process.env,
            FLY_API_TOKEN: token,
          },
        },
      );
    },

    /**
     * Create a Fly machine for the studio worker app.
     * Returns the machine ID used by waitForMachineStart.
     *
     * Call AFTER setSecrets so the machine starts with secrets already staged
     * (Pitfall P-02: app-before-secrets-before-machine ordering).
     */
    async createMachine(
      slug: string,
      image: string,
    ): Promise<{ machineId: string }> {
      const resp = await fetch(
        `${FLY_API}/v1/apps/${appName(slug)}/machines`,
        {
          method: "POST",
          headers: { ...authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({
            config: {
              image,
              guest: { cpu_kind: "shared", cpus: 1, memory_mb: 512 },
              auto_destroy: false,
            },
          }),
        },
      );
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(
          `[fly] createMachine failed (${resp.status}): ${body}`,
        );
      }
      const machine = (await resp.json()) as { id: string };
      return { machineId: machine.id };
    },

    /**
     * Wait until the machine reaches the `started` state (max 60s per poll cycle).
     * Returns on success; throws on HTTP error.
     */
    async waitForMachineStart(
      slug: string,
      machineId: string,
    ): Promise<void> {
      const resp = await fetch(
        `${FLY_API}/v1/apps/${appName(slug)}/machines/${machineId}/wait?state=started&timeout=60`,
        { headers: authHeader },
      );
      if (!resp.ok) {
        throw new Error(
          `[fly] waitForMachineStart failed (${resp.status}) for ${machineId}`,
        );
      }
    },

    /**
     * Delete the Fly app (LIFO rollback compensation).
     * Treats 404 as success — idempotent rollback.
     */
    async deleteApp(slug: string): Promise<void> {
      const resp = await fetch(`${FLY_API}/v1/apps/${appName(slug)}`, {
        method: "DELETE",
        headers: authHeader,
      });
      if (!resp.ok && resp.status !== 404) {
        const body = await resp.text();
        throw new Error(
          `[fly] deleteApp failed (${resp.status}): ${body}`,
        );
      }
    },
  };
}
