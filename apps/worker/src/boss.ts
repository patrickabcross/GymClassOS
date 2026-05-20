import { getBoss } from "@gymos/queue";

// Single source of truth (D-12): the publisher (edge-webhooks) and the
// subscriber (worker) share the same PgBoss singleton factory. The factory
// reads DATABASE_URL_UNPOOLED and throws on -pooler hostnames (PITFALL #1).
export { getBoss };
