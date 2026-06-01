// Staff-only forms CRUD API — P1c-04.
//
// Mounts at /api/forms/* (NOT under /api/forms/public/*).
// The auth guard in apps/staff-web/server/plugins/auth.ts protects all /api/*
// routes except those explicitly listed in publicPaths. /api/forms/public is
// already listed; /api/forms (this catch-all) is NOT in publicPaths.
//
// Dispatch table:
//   GET    /api/forms              → list all forms (non-deleted)
//   POST   /api/forms              → create a new form
//   GET    /api/forms/:id          → get a single form with responseCount
//   PATCH  /api/forms/:id          → update form (title/description/fields/settings/status)
//   DELETE /api/forms/:id          → soft-delete (sets deletedAt) or purge (purge=true in body)
//   POST   /api/forms/:id/restore  → restore soft-deleted form
//   GET    /api/forms/:id/responses → list responses for a form
//
// guard:allow-unscoped — gym domain tables are single-tenant; no ownableColumns()
// on forms/responses tables. All staff share the same studio view.

import {
  defineEventHandler,
  getRequestURL,
  getMethod,
  readBody,
  setResponseStatus,
  type H3Event,
} from "h3";
import { eq, isNull, isNotNull, desc, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "../../../db/index.js";

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "form"
  );
}

async function makeUniqueSlug(db: any, base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (true) {
    const existing = await db
      .select({ id: schema.forms.id })
      .from(schema.forms)
      .where(eq(schema.forms.slug, slug))
      .then((r: any[]) => r[0]);
    if (!existing) return slug;
    attempt++;
    slug = `${base}-${attempt}`;
  }
}

export default defineEventHandler(async (event: H3Event) => {
  const db = getDb();
  const url = getRequestURL(event);
  const method = getMethod(event);

  // Strip /api/forms prefix and split into path segments
  const rawPath = url.pathname.replace(/^\/api\/forms\/?/, "");
  const segments = rawPath ? rawPath.split("/").filter(Boolean) : [];

  // ─── GET /api/forms — list all non-deleted forms ─────────────────────────
  if (method === "GET" && segments.length === 0) {
    const url2 = new URL(url);
    const archivedParam = url2.searchParams.get("archived");
    const archived = archivedParam === "true" || archivedParam === "1";

    // guard:allow-unscoped — gym forms are single-tenant
    const forms = await db
      .select({
        id: schema.forms.id,
        title: schema.forms.title,
        description: schema.forms.description,
        slug: schema.forms.slug,
        status: schema.forms.status,
        createdAt: schema.forms.createdAt,
        updatedAt: schema.forms.updatedAt,
        deletedAt: schema.forms.deletedAt,
      })
      .from(schema.forms)
      .where(
        archived
          ? isNotNull(schema.forms.deletedAt)
          : isNull(schema.forms.deletedAt),
      )
      .orderBy(desc(schema.forms.updatedAt));

    // Attach response counts
    // guard:allow-unscoped — gym forms are single-tenant
    const responseCounts = await db
      .select({
        formId: schema.responses.formId,
        cnt: count(schema.responses.id),
      })
      .from(schema.responses)
      .groupBy(schema.responses.formId);
    const countMap: Record<string, number> = {};
    for (const r of responseCounts) {
      countMap[r.formId] = Number(r.cnt);
    }

    return forms.map((f) => ({
      ...f,
      fields: [], // don't send full fields on the list view
      settings: {},
      responseCount: countMap[f.id] ?? 0,
      role: "owner", // single-tenant: all staff are owners
    }));
  }

  // ─── POST /api/forms — create form ───────────────────────────────────────
  if (method === "POST" && segments.length === 0) {
    const body = (await readBody(event).catch(() => ({}))) as Record<
      string,
      any
    >;
    const title =
      typeof body?.title === "string" ? body.title.trim() : "Untitled Form";
    const description =
      typeof body?.description === "string" ? body.description : undefined;
    const fields = Array.isArray(body?.fields) ? body.fields : [];
    const settings =
      body?.settings && typeof body.settings === "object" ? body.settings : {};

    const slugBase = slugify(title);
    const slug = await makeUniqueSlug(db, slugBase);
    const id = nanoid();
    const now = new Date().toISOString();

    await db.insert(schema.forms).values({
      id,
      title,
      description: description ?? null,
      slug,
      fields: JSON.stringify(fields),
      settings: JSON.stringify(settings),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    const form = await db
      .select()
      .from(schema.forms)
      .where(eq(schema.forms.id, id))
      .then((r: any[]) => r[0]);

    return {
      ...form,
      fields: JSON.parse(form.fields),
      settings: JSON.parse(form.settings),
      responseCount: 0,
      role: "owner",
    };
  }

  // ─── Remaining routes require an :id segment ─────────────────────────────
  if (segments.length === 0) {
    setResponseStatus(event, 404);
    return { error: "Not found" };
  }

  const formId = segments[0];
  const subRoute = segments[1] ?? null; // "responses" | "restore" | null

  // ─── GET /api/forms/:id — single form ────────────────────────────────────
  if (method === "GET" && !subRoute) {
    // guard:allow-unscoped — gym forms are single-tenant
    const form = await db
      .select()
      .from(schema.forms)
      .where(eq(schema.forms.id, formId))
      .then((r: any[]) => r[0]);

    if (!form) {
      setResponseStatus(event, 404);
      return { error: "Form not found" };
    }

    const responseCount = await db
      .select({ cnt: count(schema.responses.id) })
      .from(schema.responses)
      .where(eq(schema.responses.formId, formId))
      .then((r: any[]) => Number(r[0]?.cnt ?? 0));

    return {
      ...form,
      fields: JSON.parse(form.fields),
      settings: JSON.parse(form.settings),
      responseCount,
      role: "owner",
    };
  }

  // ─── PATCH /api/forms/:id — update ───────────────────────────────────────
  if (method === "PATCH" && !subRoute) {
    const body = (await readBody(event).catch(() => ({}))) as Record<
      string,
      any
    >;
    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (typeof body?.title === "string") updates.title = body.title.trim();
    if (typeof body?.description === "string")
      updates.description = body.description;
    if (Array.isArray(body?.fields))
      updates.fields = JSON.stringify(body.fields);
    if (body?.settings && typeof body.settings === "object") {
      updates.settings = JSON.stringify(body.settings);
    }
    if (
      body?.status &&
      ["draft", "published", "closed"].includes(body.status)
    ) {
      updates.status = body.status;
    }

    await db
      .update(schema.forms)
      .set(updates)
      .where(eq(schema.forms.id, formId));

    const form = await db
      .select()
      .from(schema.forms)
      .where(eq(schema.forms.id, formId))
      .then((r: any[]) => r[0]);

    if (!form) {
      setResponseStatus(event, 404);
      return { error: "Form not found" };
    }

    const responseCount = await db
      .select({ cnt: count(schema.responses.id) })
      .from(schema.responses)
      .where(eq(schema.responses.formId, formId))
      .then((r: any[]) => Number(r[0]?.cnt ?? 0));

    return {
      ...form,
      fields: JSON.parse(form.fields),
      settings: JSON.parse(form.settings),
      responseCount,
      role: "owner",
    };
  }

  // ─── DELETE /api/forms/:id — soft-delete or purge ────────────────────────
  if (method === "DELETE" && !subRoute) {
    const body = (await readBody(event).catch(() => ({}))) as Record<
      string,
      any
    >;
    const purge = body?.purge === true;

    if (purge) {
      // Hard delete (also removes orphan responses via cascade or manual delete)
      await db
        .delete(schema.responses)
        .where(eq(schema.responses.formId, formId));
      await db.delete(schema.forms).where(eq(schema.forms.id, formId));
    } else {
      // Soft delete
      await db
        .update(schema.forms)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(schema.forms.id, formId));
    }

    return { success: true };
  }

  // ─── POST /api/forms/:id/restore ─────────────────────────────────────────
  if (method === "POST" && subRoute === "restore") {
    await db
      .update(schema.forms)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(eq(schema.forms.id, formId));

    return { success: true };
  }

  // ─── GET /api/forms/:id/responses ────────────────────────────────────────
  if (method === "GET" && subRoute === "responses") {
    // guard:allow-unscoped — gym forms are single-tenant
    const form = await db
      .select({ id: schema.forms.id, fields: schema.forms.fields })
      .from(schema.forms)
      .where(eq(schema.forms.id, formId))
      .then((r: any[]) => r[0]);

    if (!form) {
      setResponseStatus(event, 404);
      return { error: "Form not found" };
    }

    const rows = await db
      .select()
      .from(schema.responses)
      .where(eq(schema.responses.formId, formId))
      .orderBy(desc(schema.responses.submittedAt));

    const fields = JSON.parse(form.fields);
    const responses = rows.map((r: any) => ({
      id: r.id,
      formId: r.formId,
      data: JSON.parse(r.data),
      submittedAt: r.submittedAt,
      submitterEmail: r.submitterEmail,
    }));

    return {
      total: responses.length,
      responses,
      fields,
    };
  }

  setResponseStatus(event, 404);
  return { error: "Not found" };
});
