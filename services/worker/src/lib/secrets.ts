import { sql } from "drizzle-orm";
import { getEnv } from "./env.js";
import type { getDb } from "./db.js";
import { readAppSecretByKey } from "./appSecrets.js";

/**
 * Write a secret to the `secrets` table, encrypted via pgcrypto.
 * Used by the Stripe rotation flow (Plan P1b-08 ships the staff-web UI).
 *
 * STR-01 mandate: Stripe restricted key stored encrypted in DB so the
 * rotation UI can read it. Master key lives in env (Fly Secret).
 *
 * Idempotent via ON CONFLICT (name) DO UPDATE — calling writeSecret twice
 * with the same name just rotates the ciphertext.
 */
export async function writeSecret(
  name: string,
  plaintext: string,
  db: ReturnType<typeof getDb>,
): Promise<void> {
  const env = getEnv();
  // guard:allow-unscoped — secrets is studio-global (one studio per deploy)
  await db.execute(sql`
    INSERT INTO secrets (name, ciphertext, updated_at)
    VALUES (
      ${name},
      pgp_sym_encrypt(${plaintext}, ${env.PGCRYPTO_MASTER_KEY}),
      NOW()
    )
    ON CONFLICT (name) DO UPDATE
      SET ciphertext = EXCLUDED.ciphertext,
          updated_at = EXCLUDED.updated_at
  `);
}

/**
 * Read a secret from the `secrets` table, decrypted via pgcrypto.
 * Also bumps last_used_at = NOW() for audit visibility.
 * Returns null if no row exists for the given name.
 */
export async function readSecret(
  name: string,
  db: ReturnType<typeof getDb>,
): Promise<string | null> {
  const env = getEnv();
  // guard:allow-unscoped — secrets is studio-global
  const result = await db.execute(sql`
    UPDATE secrets
    SET last_used_at = NOW()
    WHERE name = ${name}
    RETURNING pgp_sym_decrypt(ciphertext::bytea, ${env.PGCRYPTO_MASTER_KEY}) AS plaintext
  `);
  const rows = (result as any)?.rows ?? (result as any);
  if (!rows || rows.length === 0) return null;
  return rows[0].plaintext as string;
}

/**
 * Resolve the active Stripe restricted key.
 * Priority: secrets table → env STRIPE_SECRET_KEY → throw.
 * Rotation-capable: write to secrets via writeSecret('stripe_restricted_key', ...).
 */
export async function getStripeSecretKey(
  db: ReturnType<typeof getDb>,
): Promise<string> {
  const fromDb = await readSecret("stripe_restricted_key", db);
  if (fromDb) return fromDb;
  const env = getEnv();
  if (env.STRIPE_SECRET_KEY) return env.STRIPE_SECRET_KEY;
  throw new Error(
    "No Stripe key available — neither secrets.stripe_restricted_key nor env STRIPE_SECRET_KEY is set",
  );
}

/**
 * Resolve the WhatsApp Cloud API access token.
 * Priority: app_secrets[WHATSAPP_ACCESS_TOKEN] → secrets.whatsapp_access_token → env WHATSAPP_ACCESS_TOKEN → throw.
 * Rotation-capable via the in-app Settings UI.
 */
export async function getWhatsAppAccessToken(
  db: ReturnType<typeof getDb>,
): Promise<string> {
  const fromApp = await readAppSecretByKey("WHATSAPP_ACCESS_TOKEN", db);
  if (fromApp) return fromApp;
  const fromDb = await readSecret("whatsapp_access_token", db);
  if (fromDb) return fromDb;
  const env = getEnv();
  if (env.WHATSAPP_ACCESS_TOKEN) return env.WHATSAPP_ACCESS_TOKEN;
  throw new Error(
    "No WhatsApp access token available — neither app_secrets[WHATSAPP_ACCESS_TOKEN] nor secrets.whatsapp_access_token nor env WHATSAPP_ACCESS_TOKEN is set",
  );
}

/**
 * Resolve the WhatsApp phone number ID.
 * Priority: app_secrets[WHATSAPP_PHONE_NUMBER_ID] → secrets.whatsapp_phone_number_id → env WHATSAPP_PHONE_NUMBER_ID → throw.
 */
export async function getWhatsAppPhoneNumberId(
  db: ReturnType<typeof getDb>,
): Promise<string> {
  const fromApp = await readAppSecretByKey("WHATSAPP_PHONE_NUMBER_ID", db);
  if (fromApp) return fromApp;
  const fromDb = await readSecret("whatsapp_phone_number_id", db);
  if (fromDb) return fromDb;
  const env = getEnv();
  if (env.WHATSAPP_PHONE_NUMBER_ID) return env.WHATSAPP_PHONE_NUMBER_ID;
  throw new Error(
    "No WhatsApp phone number ID available — neither app_secrets[WHATSAPP_PHONE_NUMBER_ID] nor secrets.whatsapp_phone_number_id nor env WHATSAPP_PHONE_NUMBER_ID is set",
  );
}

/**
 * Resolve the WhatsApp Business Account ID (WABA ID).
 * Priority: secrets.whatsapp_business_account_id → env WHATSAPP_BUSINESS_ACCOUNT_ID → null.
 * Returns null (not throw) because it is OPTIONAL — the templates-sync handler
 * already guards on absence and logs+skips cleanly.
 */
export async function getWhatsAppBusinessAccountId(
  db: ReturnType<typeof getDb>,
): Promise<string | null> {
  const fromDb = await readSecret("whatsapp_business_account_id", db);
  if (fromDb) return fromDb;
  const env = getEnv();
  return env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? null;
}

/**
 * Resolve the MYÜTIK API key used for template-sync (WA-08 repoint).
 * Priority: app_secrets[MYUTIK_API_KEY] → secrets.myutik_api_key → env MYUTIK_API_KEY → throw.
 * Rotation-capable via the in-app Settings UI.
 */
export async function getMyutikApiKey(
  db: ReturnType<typeof getDb>,
): Promise<string> {
  const fromApp = await readAppSecretByKey("MYUTIK_API_KEY", db);
  if (fromApp) return fromApp;
  const fromDb = await readSecret("myutik_api_key", db);
  if (fromDb) return fromDb;
  const env = getEnv();
  if (env.MYUTIK_API_KEY) return env.MYUTIK_API_KEY;
  throw new Error(
    "No MYÜTIK API key available — neither app_secrets[MYUTIK_API_KEY] nor secrets.myutik_api_key nor env MYUTIK_API_KEY is set",
  );
}

/**
 * Resolve the MYÜTIK phone number ID used to scope template lookups.
 * Priority: app_secrets[MYUTIK_PHONE_NUMBER_ID] → secrets.myutik_phone_number_id
 *           → env MYUTIK_PHONE_NUMBER_ID → env WHATSAPP_PHONE_NUMBER_ID (required, never absent).
 * Never throws — falls through to the required WhatsApp phone number env var.
 */
export async function getMyutikPhoneNumberId(
  db: ReturnType<typeof getDb>,
): Promise<string> {
  const fromApp = await readAppSecretByKey("MYUTIK_PHONE_NUMBER_ID", db);
  if (fromApp) return fromApp;
  const fromDb = await readSecret("myutik_phone_number_id", db);
  if (fromDb) return fromDb;
  const env = getEnv();
  if (env.MYUTIK_PHONE_NUMBER_ID) return env.MYUTIK_PHONE_NUMBER_ID;
  // WHATSAPP_PHONE_NUMBER_ID is a required env var — always present.
  return env.WHATSAPP_PHONE_NUMBER_ID;
}
