/**
 * setup-stripe-catalog.ts — idempotent Stripe catalog provisioner for RunStudio.
 *
 * Creates (or verifies existing) 8 Stripe Products + Prices on the studio's
 * connected account, creates 2 discount coupons + promotion codes, and upserts
 * 8 pass_types rows in the app database keyed on the catalog key.
 *
 * RUN WITH THE TEST KEY FIRST (STRIPE_SECRET_KEY=sk_test_...) to verify
 * everything is correct on a test connected account, then re-run with the LIVE
 * key + live connected account (acct_1ToNIZEBDNMe9qqF) for production.
 *
 * The script is fully idempotent — re-running creates zero duplicates on Stripe
 * or in the database. Safe to run at any time.
 *
 * Usage:
 *   pnpm --filter @gymos/staff-web stripe:setup-catalog
 *   STRIPE_SECRET_KEY=sk_test_... pnpm --filter @gymos/staff-web stripe:setup-catalog
 *   pnpm --filter @gymos/staff-web stripe:setup-catalog --account=acct_1ToNIZEBDNMe9qqF
 *
 * Environment:
 *   STRIPE_SECRET_KEY           — REQUIRED; platform secret key (test or live)
 *   STRIPE_CONNECTED_ACCOUNT_ID — optional override for connected account id
 *   DATABASE_URL                — required for pass_types upsert (Neon URL)
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Stripe from "stripe";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/ is ONE level under apps/staff-web
const APP_ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(APP_ROOT, ".env.local"), quiet: true } as any);
dotenv.config({ path: path.join(APP_ROOT, ".env"), quiet: true } as any);

// ---------------------------------------------------------------------------
// Validate required env
// ---------------------------------------------------------------------------

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error(
    "Error: STRIPE_SECRET_KEY is not set.\n\n" +
      "Export your Stripe platform secret key before running:\n" +
      "  export STRIPE_SECRET_KEY=sk_test_...\n" +
      "  pnpm --filter @gymos/staff-web stripe:setup-catalog\n\n" +
      "Use sk_test_... for a test run first, sk_live_... for production.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Stripe client — mirrors the EXACT apiVersion from apps/staff-web/server/lib/stripe.ts
// ---------------------------------------------------------------------------

const stripe = new Stripe(secretKey, {
  apiVersion: "2026-04-22.dahlia" as Stripe.LatestApiVersion,
});

// ---------------------------------------------------------------------------
// Catalog definition
// ---------------------------------------------------------------------------

interface CatalogEntry {
  /** Stable catalog key — becomes pass_types.id AND products metadata.runstudio_pass_key */
  key: string;
  name: string;
  mode: "payment" | "subscription";
  /** null = unlimited (passes.granted = 999 sentinel) */
  credits: number | null;
  /** null = never expires (subscription expiry is current_period_end) */
  validityDays: number | null;
  allCategories: boolean;
  allowedCategories: string[];
  /** price in pence (GBP) */
  pricePennies: number;
  /**
   * Used as the Stripe Product description so the legacy keyword fallback in
   * checkout-session-completed.ts still fires for prices without a pass_types match.
   * Omit for subscription items (the reducer reads from invoice.paid, not keywords).
   */
  descriptionKeyword?: string;
}

const CATALOG: CatalogEntry[] = [
  {
    key: "drop_in",
    name: "Drop-in",
    mode: "payment",
    credits: 1,
    validityDays: 180,
    allCategories: true,
    allowedCategories: [],
    pricePennies: 1400,
    descriptionKeyword: "drop-in",
  },
  {
    key: "pack_5",
    name: "5 Class Pack",
    mode: "payment",
    credits: 5,
    validityDays: 180,
    allCategories: true,
    allowedCategories: [],
    pricePennies: 6000,
    descriptionKeyword: "5-pack",
  },
  {
    key: "pack_10",
    name: "10 Class Pack",
    mode: "payment",
    credits: 10,
    validityDays: 180,
    allCategories: true,
    allowedCategories: [],
    pricePennies: 11000,
    descriptionKeyword: "10-pack",
  },
  {
    key: "unlimited",
    name: "Unlimited",
    mode: "subscription",
    credits: null,
    validityDays: null,
    allCategories: true,
    allowedCategories: [],
    pricePennies: 8500,
  },
  {
    key: "one_per_week",
    name: "1 Session / Week",
    mode: "subscription",
    credits: 5,
    validityDays: 30,
    allCategories: true,
    allowedCategories: [],
    pricePennies: 4400,
  },
  {
    key: "two_per_week",
    name: "2 Sessions / Week",
    mode: "subscription",
    credits: 9,
    validityDays: 30,
    allCategories: true,
    allowedCategories: [],
    pricePennies: 6400,
  },
  {
    key: "hyrox",
    name: "HYROX Unlimited",
    mode: "subscription",
    credits: null,
    validityDays: null,
    allCategories: false,
    allowedCategories: ["hyrox"],
    pricePennies: 8500,
  },
  {
    key: "intro_30",
    name: "30 Days for £30",
    mode: "payment",
    credits: null,
    validityDays: 30,
    allCategories: true,
    allowedCategories: [],
    pricePennies: 3000,
  },
];

// ---------------------------------------------------------------------------
// Coupon / promo code definitions
// ---------------------------------------------------------------------------

interface CouponDef {
  code: string;
  amountOff: number;
  description: string;
}

const COUPONS: CouponDef[] = [
  {
    code: "STUDENT",
    amountOff: 2000,
    description: "Student discount — £20 off",
  },
  {
    code: "BLUELIGHT",
    amountOff: 1000,
    description: "Blue Light discount — £10 off",
  },
];

// ---------------------------------------------------------------------------
// Idempotent product helper
// ---------------------------------------------------------------------------

async function findOrCreateProduct(
  entry: CatalogEntry,
  acctOpts: { stripeAccount: string },
): Promise<Stripe.Product> {
  // Search by runstudio_pass_key metadata for stable idempotency across re-runs.
  let product: Stripe.Product | undefined;
  try {
    const results = await stripe.products.search(
      { query: `metadata['runstudio_pass_key']:'${entry.key}'`, limit: 1 },
      acctOpts,
    );
    product = results.data[0];
  } catch (err: any) {
    // products.search may be unavailable on some account types; fall back to list+filter.
    if (
      err?.code === "feature_not_available" ||
      err?.type === "invalid_request_error"
    ) {
      const all = await stripe.products.list({ limit: 100 }, acctOpts);
      product = all.data.find(
        (p) => p.metadata?.runstudio_pass_key === entry.key,
      );
    } else {
      throw err;
    }
  }

  if (product) {
    console.log(`  product: ${product.id} (existing)`);
    return product;
  }

  const description = entry.descriptionKeyword ?? entry.name;
  const created = await stripe.products.create(
    {
      name: entry.name,
      description,
      metadata: { runstudio_pass_key: entry.key },
    },
    acctOpts,
  );
  console.log(`  product: ${created.id} (created)`);
  return created;
}

// ---------------------------------------------------------------------------
// Idempotent price helper
// ---------------------------------------------------------------------------

async function findOrCreatePrice(
  entry: CatalogEntry,
  productId: string,
  acctOpts: { stripeAccount: string },
): Promise<Stripe.Price> {
  const lookupKey = `runstudio_${entry.key}`;

  // Look up by stable lookup_key first.
  const existing = await stripe.prices.list(
    { lookup_keys: [lookupKey], limit: 1 },
    acctOpts,
  );

  if (existing.data.length > 0) {
    const price = existing.data[0];
    const amountOk = price.unit_amount === entry.pricePennies;
    const recurringOk =
      entry.mode === "subscription"
        ? price.recurring?.interval === "month"
        : price.recurring == null;

    if (amountOk && recurringOk) {
      console.log(`  price:   ${price.id} (existing, lookup_key=${lookupKey})`);
      return price;
    }
    // Stripe prices are immutable — create a new one and transfer the lookup_key.
    console.log(
      `  price:   ${price.id} stale (amount or interval changed) — creating replacement`,
    );
  }

  const created = await stripe.prices.create(
    {
      product: productId,
      currency: "gbp",
      unit_amount: entry.pricePennies,
      lookup_key: lookupKey,
      transfer_lookup_key: true, // moves the lookup_key off any stale price
      ...(entry.mode === "subscription"
        ? { recurring: { interval: "month" } }
        : {}),
    },
    acctOpts,
  );
  console.log(
    `  price:   ${created.id} (created, lookup_key=${lookupKey})`,
  );
  return created;
}

// ---------------------------------------------------------------------------
// Idempotent coupon + promo code helper
// ---------------------------------------------------------------------------

async function ensureCouponAndPromo(
  def: CouponDef,
  acctOpts: { stripeAccount: string },
): Promise<void> {
  // Create coupon with a stable id equal to the code.
  try {
    await stripe.coupons.create(
      {
        id: def.code,
        amount_off: def.amountOff,
        currency: "gbp",
        duration: "forever",
        name: def.code,
      },
      acctOpts,
    );
    console.log(`  coupon:     ${def.code} (created) — ${def.description}`);
  } catch (err: any) {
    if (err?.code === "resource_already_exists") {
      const existing = await stripe.coupons.retrieve(def.code, acctOpts);
      console.log(
        `  coupon:     ${existing.id} (existing) — ${def.description}`,
      );
    } else {
      throw err;
    }
  }

  // Ensure a promotion code with the same code string exists.
  const promoCodes = await stripe.promotionCodes.list(
    { code: def.code, limit: 1 },
    acctOpts,
  );
  if (promoCodes.data.length > 0) {
    console.log(`  promo code: ${def.code} (existing)`);
  } else {
    await stripe.promotionCodes.create(
      { coupon: def.code, code: def.code },
      acctOpts,
    );
    console.log(`  promo code: ${def.code} (created)`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // ------------------------------------------------------------------
  // 1. Resolve connected account id
  //    Priority: --account= flag > STRIPE_CONNECTED_ACCOUNT_ID > DB row > default
  // ------------------------------------------------------------------
  const cliAccount = process.argv
    .slice(2)
    .find((a) => a.startsWith("--account="))
    ?.split("=")[1];

  let acctId: string;
  let acctSource: string;

  if (cliAccount) {
    acctId = cliAccount;
    acctSource = "--account flag";
  } else if (process.env.STRIPE_CONNECTED_ACCOUNT_ID) {
    acctId = process.env.STRIPE_CONNECTED_ACCOUNT_ID;
    acctSource = "STRIPE_CONNECTED_ACCOUNT_ID env";
  } else {
    // Try to read from the app DB connected_accounts table.
    try {
      const { getDb, schema } = await import("../server/db/index.js");
      const db = getDb();
      const rows = await db
        .select({ id: schema.connectedAccounts.id })
        .from(schema.connectedAccounts)
        .limit(1);
      if (rows.length > 0 && rows[0].id) {
        acctId = rows[0].id;
        acctSource = "connected_accounts table";
      } else {
        throw new Error("no row");
      }
    } catch {
      acctId = "acct_1ToNIZEBDNMe9qqF";
      acctSource = "hardcoded default (HUSTLE)";
    }
  }

  const acctOpts = { stripeAccount: acctId };

  console.log("\n=== RunStudio Stripe catalog setup ===");
  console.log(
    `Key type:      ${secretKey!.startsWith("sk_live_") ? "LIVE — real charges will occur" : "TEST — safe to re-run"}`,
  );
  console.log(`Connected acct: ${acctId} (${acctSource})`);
  console.log();

  // ------------------------------------------------------------------
  // 2. Products + Prices
  // ------------------------------------------------------------------
  console.log("--- Products & Prices ---");
  const catalogResults: Array<{
    key: string;
    productId: string;
    priceId: string;
  }> = [];

  for (const entry of CATALOG) {
    console.log(`\n[${entry.key}] ${entry.name}`);
    const product = await findOrCreateProduct(entry, acctOpts);
    const price = await findOrCreatePrice(entry, product.id, acctOpts);
    catalogResults.push({
      key: entry.key,
      productId: product.id,
      priceId: price.id,
    });
  }

  // ------------------------------------------------------------------
  // 3. Coupons + promo codes (for the Unlimited price at checkout)
  // ------------------------------------------------------------------
  console.log("\n--- Coupons & Promo Codes ---");
  for (const coupon of COUPONS) {
    console.log(`\n[${coupon.code}]`);
    // Non-fatal: discounts are optional for the sandbox. A coupon/promo-code
    // API hiccup must never abort the critical pass_types upsert below.
    try {
      await ensureCouponAndPromo(coupon, acctOpts);
    } catch (err: any) {
      console.warn(
        `  ⚠ skipped ${coupon.code} — ${err?.code ?? err?.message ?? "unknown error"} (non-fatal; fix discounts separately)`,
      );
    }
  }

  // ------------------------------------------------------------------
  // 4. Upsert pass_types rows in the app DB
  //    Keyed on pass_types.id = catalog key; stamps stripe_price_id.
  //    Additive only — no migration needed (C47 already applied).
  // ------------------------------------------------------------------
  console.log("\n--- pass_types upsert (app DB) ---");
  const { getDb, schema } = await import("../server/db/index.js");
  const db = getDb();

  for (const entry of CATALOG) {
    const result = catalogResults.find((r) => r.key === entry.key)!;
    await db
      .insert(schema.passTypes)
      .values({
        id: entry.key,
        name: entry.name,
        credits: entry.credits,
        pricePennies: entry.pricePennies,
        stripePriceId: result.priceId,
        validityDays: entry.validityDays,
        allCategories: entry.allCategories,
        allowedCategories: JSON.stringify(entry.allowedCategories),
        active: true,
      })
      .onConflictDoUpdate({
        target: schema.passTypes.id,
        set: {
          name: entry.name,
          credits: entry.credits,
          pricePennies: entry.pricePennies,
          stripePriceId: result.priceId,
          validityDays: entry.validityDays,
          allCategories: entry.allCategories,
          allowedCategories: JSON.stringify(entry.allowedCategories),
          active: true,
        },
      });
    console.log(
      `  ${entry.key.padEnd(16)} stripe_price_id=${result.priceId}`,
    );
  }

  // ------------------------------------------------------------------
  // 5. Summary table
  // ------------------------------------------------------------------
  console.log("\n=== Catalog summary ===");
  const COL = { key: 18, prod: 24, price: 24 };
  console.log(
    "key".padEnd(COL.key) +
      "product_id".padEnd(COL.prod) +
      "price_id".padEnd(COL.price) +
      "pass_type_id",
  );
  console.log("-".repeat(COL.key + COL.prod + COL.price + 10));
  for (const r of catalogResults) {
    console.log(
      r.key.padEnd(COL.key) +
        r.productId.padEnd(COL.prod) +
        r.priceId.padEnd(COL.price) +
        r.key,
    );
  }

  console.log("\n=== Promo codes ===");
  for (const c of COUPONS) {
    console.log(`  ${c.code} — ${c.description}`);
  }
  console.log(
    "  Note: apply these promo codes at Unlimited / subscription checkouts.",
  );

  // Suggested env vars for the legacy purchase route (if still in use).
  const dropIn = catalogResults.find((r) => r.key === "drop_in");
  const pack5 = catalogResults.find((r) => r.key === "pack_5");
  const pack10 = catalogResults.find((r) => r.key === "pack_10");
  const unlimited = catalogResults.find((r) => r.key === "unlimited");

  console.log("\n=== Suggested env vars (legacy /api/m/purchase route) ===");
  console.log(`STRIPE_PRICE_DROP_IN=${dropIn?.priceId ?? "(see table above)"}`);
  console.log(`STRIPE_PRICE_5_PACK=${pack5?.priceId ?? "(see table above)"}`);
  console.log(`STRIPE_PRICE_10_PACK=${pack10?.priceId ?? "(see table above)"}`);
  console.log(
    `STRIPE_PRICE_MEMBERSHIP=${unlimited?.priceId ?? "(see table above)"}`,
  );
  console.log(
    "Add these to Vercel environment variables if the legacy purchase route is still in use.",
  );

  console.log(
    "\nDone. All operations are idempotent — safe to re-run at any time.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
