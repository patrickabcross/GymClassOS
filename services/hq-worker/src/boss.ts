import { getBoss } from "@gymos/queue";

// The hq-worker re-exports the shared pg-boss factory from @gymos/queue.
// The factory reads DATABASE_URL_UNPOOLED and throws on -pooler hostnames
// (PITFALL #1 — pg-boss requires LISTEN/NOTIFY + advisory locks).
//
// The env var is DEPLOY-SCOPED: when running as gymos-hq-worker on Fly,
// DATABASE_URL_UNPOOLED must point at the HQ Neon project (not any studio
// Neon). The same factory is used by services/worker where it points at the
// studio Neon — the deployment context makes the difference, not the code.
//
// PII boundary (D-11 / HQ-FND-06): this file must NOT import from
// @gymos/whatsapp or stripe. All studio credentials live in the studio
// deploy. hq-worker's DATABASE_URL_UNPOOLED is the HQ Neon only.
export { getBoss };
