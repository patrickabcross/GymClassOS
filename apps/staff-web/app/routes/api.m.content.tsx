// GET /api/m/content
// Member-side published content list — returns all published content documents,
// ordered by most recently updated first.
//
// Demo-grade: gated by requireDemoMember (DEMO_MODE + X-Demo-Member-Id header).
// Production (PUB-02) replaces with Better-auth member sessions.
//
// ONLY status='published' documents are returned — drafts are NEVER exposed.
// guard:allow-unscoped — single-tenant content (published-only member API)
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireDemoMember } from "../../server/lib/demo-member";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  // Gate: demo member auth (replaces with Better-auth member sessions in production)
  await requireDemoMember(request);
  const db = getDb();

  // guard:allow-unscoped — single-tenant content (published-only member API)
  const items = await db
    .select({
      id: schema.contentDocuments.id,
      title: schema.contentDocuments.title,
      slug: schema.contentDocuments.slug,
      body: schema.contentDocuments.body,
      updatedAt: schema.contentDocuments.updatedAt,
    })
    .from(schema.contentDocuments)
    .where(eq(schema.contentDocuments.status, "published"))
    .orderBy(desc(schema.contentDocuments.updatedAt));

  return { items };
}
