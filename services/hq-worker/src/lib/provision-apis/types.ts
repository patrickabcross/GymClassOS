/**
 * Adapter interfaces for the three cloud providers used in the provisioning saga.
 *
 * Every external call in the saga goes through one of these interfaces,
 * making the saga fully unit-testable with mock implementations (D-12).
 * Real adapters are in neon.ts / vercel.ts / fly.ts; mocks are in
 * src/__tests__/mocks/provision-apis.ts.
 *
 * VERBATIM from BD2-RESEARCH.md Pattern 9.
 */

export interface NeonApi {
  /** Find a project by studio slug. Returns null if none exists. */
  findProjectBySlug(slug: string): Promise<{ projectId: string } | null>;
  /**
   * Create a Neon project for the studio.
   * Returns dbUrl (pooled) and dbUrlUnpooled — NEVER stored in HQ DB (D-13).
   */
  createProject(
    slug: string,
  ): Promise<{ projectId: string; dbUrl: string; dbUrlUnpooled: string }>;
  /** Delete a Neon project. Treats 404 as success (idempotent rollback). */
  deleteProject(projectId: string): Promise<void>;
  /** Return the pooled connection URI for an existing project. */
  getPooledConnectionUri(projectId: string): Promise<string>;
}

export interface VercelApi {
  /** Find a Vercel project by studio slug. Returns null if none exists. */
  findProjectBySlug(slug: string): Promise<{ projectId: string } | null>;
  /** Create a Vercel project (framework: react-router, gitRepository wired). */
  createProject(slug: string): Promise<{ projectId: string }>;
  /**
   * Set environment variables on a Vercel project (upsert=true — idempotent).
   * vars values include the Neon connection string — NEVER stored in HQ DB (D-13).
   */
  setEnvVars(projectId: string, vars: Record<string, string>): Promise<void>;
  /** Trigger a deployment from the main branch. */
  deploy(projectId: string): Promise<{ deployId: string }>;
  /**
   * Poll until the deployment reaches READY state.
   * Throws on ERROR / CANCELED or timeout.
   * Polls via the Vercel deploy URL (NOT the custom subdomain — Pitfall P-05).
   */
  waitForDeploy(deployId: string): Promise<void>;
  /** Attach a custom domain (e.g. slug.gymclassos.com) to the project. */
  attachDomain(projectId: string, domain: string): Promise<void>;
  /** Delete a Vercel project. Idempotent rollback. */
  deleteProject(projectId: string): Promise<void>;
}

export interface FlyApi {
  /** Returns true if the Fly app gymos-{slug}-worker already exists. */
  appExists(slug: string): Promise<boolean>;
  /** Create the Fly app. App must exist before setSecrets + createMachine. */
  createApp(slug: string): Promise<void>;
  /**
   * Set Fly secrets on gymos-{slug}-worker via flyctl subprocess.
   * Uses execa array-args (no shell injection). Logs key NAMES only (Pitfall P-04).
   * secrets values include the Neon connection string — NEVER stored in HQ DB (D-13).
   */
  setSecrets(slug: string, secrets: Record<string, string>): Promise<void>;
  /** Create a Fly machine and return its ID. */
  createMachine(slug: string, image: string): Promise<{ machineId: string }>;
  /** Poll until the machine reaches started state. */
  waitForMachineStart(slug: string, machineId: string): Promise<void>;
  /** Delete the Fly app. Treats 404 as success (idempotent rollback). */
  deleteApp(slug: string): Promise<void>;
}

/**
 * Aggregated provider API bag passed to the saga and all step functions.
 * Use makeMockApis() in tests or createProvisionApis(env) in production.
 */
export interface ProvisionApis {
  neon: NeonApi;
  vercel: VercelApi;
  fly: FlyApi;
}
