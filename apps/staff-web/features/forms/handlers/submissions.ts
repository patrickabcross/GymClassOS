import {
  defineEventHandler,
  getRouterParam,
  getRequestHeader,
  setResponseStatus,
  getRequestIP,
  type H3Event,
} from "h3";
import { and, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { readBody, verifyCaptcha } from "@agent-native/core/server";
import { getDb, schema } from "../../../server/db/index.js";
import type { FormField, FormSettings } from "../types.js";
import { normalizePhone } from "../lib/normalize-phone.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { enqueueOutboundWhatsApp } from "../../../app/lib/queue-client.js";

// ---------------------------------------------------------------------------
// Field value size limits by type (copied verbatim from upstream)
// ---------------------------------------------------------------------------

const MAX_FIELD_LENGTH: Record<string, number> = {
  text: 1000,
  email: 1000,
  number: 1000,
  date: 1000,
  select: 1000,
  checkbox: 1000,
  radio: 1000,
  rating: 1000,
  scale: 1000,
  textarea: 10000,
  multiselect: 10000,
};

const MAX_PAYLOAD_BYTES = 100 * 1024; // 100KB
const MIN_FILL_TIME_MS = 500; // reject submits faster than this

// ---------------------------------------------------------------------------
// Gym lead-upsert submission handler.
//
// guard:allow-unscoped — gym domain tables are single-tenant; this endpoint
// is public/anonymous (lead capture forms); no ownableColumns() on gym tables.
// Do NOT wrap in runWithRequestContext — endpoint is anonymous; framework does
// not inject user context for /api/submit/* (RESEARCH anti-pattern §Pattern 2).
// ---------------------------------------------------------------------------

export const submitLeadForm = defineEventHandler(async (event: H3Event) => {
  const db = getDb();
  const id = getRouterParam(event, "id") as string;

  // -------------------------------------------------------------------
  // 0. Rate limit (BEFORE any DB work — Decision 2 LOCKED)
  // -------------------------------------------------------------------
  // Derive IP from x-forwarded-for first hop (Fly + Vercel both set this),
  // else fall back to the socket remote address.
  const forwarded = getRequestHeader(event, "x-forwarded-for");
  const ipKey = forwarded
    ? (forwarded.split(",")[0] ?? "").trim()
    : (getRequestIP(event) ?? "");

  if (!checkRateLimit(ipKey)) {
    setResponseStatus(event, 429);
    return { success: false, error: "rate_limited" };
  }

  // -------------------------------------------------------------------
  // 1. Load published form by id
  // guard:allow-unscoped — public form lookup by id; returns no owner data.
  // -------------------------------------------------------------------
  const form = await db
    .select()
    .from(schema.forms)
    .where(
      and(
        eq(schema.forms.id, id),
        eq(schema.forms.status, "published"),
        isNull(schema.forms.deletedAt),
      ),
    )
    .then((rows) => rows[0]);

  if (!form) {
    setResponseStatus(event, 404);
    return { error: "Form not found or not accepting responses" };
  }

  const settings: FormSettings = form.settings ? JSON.parse(form.settings) : {};

  // Origin allowlist (per-form). Empty/unset = allow any (back-compat).
  const allowedOrigins = settings.allowedOrigins ?? [];
  if (allowedOrigins.length > 0) {
    const origin = getRequestHeader(event, "origin");
    if (!origin || !allowedOrigins.includes(origin)) {
      setResponseStatus(event, 403);
      return { error: "Origin not allowed" };
    }
  }

  const body = await readBody(event);

  // -------------------------------------------------------------------
  // 2. Payload size check
  // -------------------------------------------------------------------
  const bodyStr = JSON.stringify(body);
  if (Buffer.byteLength(bodyStr, "utf8") > MAX_PAYLOAD_BYTES) {
    setResponseStatus(event, 413);
    return { error: "Payload too large" };
  }

  // -------------------------------------------------------------------
  // 3. Honeypot — silently accept-and-drop if filled
  // -------------------------------------------------------------------
  if (typeof body._hp === "string" && body._hp.length > 0) {
    return { success: true, id: "" };
  }

  // -------------------------------------------------------------------
  // 4. Min time-to-submit check (blocks naive scripted submitters)
  // -------------------------------------------------------------------
  if (typeof body._t === "number" && body._t > 0) {
    const elapsed = Date.now() - body._t;
    if (elapsed < MIN_FILL_TIME_MS) {
      setResponseStatus(event, 429);
      return { error: "Submitted too quickly" };
    }
  }

  // -------------------------------------------------------------------
  // 5. Captcha verification (Turnstile optional; returns success:true when no key configured)
  // -------------------------------------------------------------------
  const captchaResult = await verifyCaptcha(body.captchaToken ?? "");
  if (!captchaResult.success) {
    setResponseStatus(event, 403);
    return { error: "Captcha verification failed" };
  }

  // -------------------------------------------------------------------
  // 6. Parse form fields + field-id whitelist
  // -------------------------------------------------------------------
  const fields: FormField[] = JSON.parse(form.fields);
  const fieldMap = new Map(fields.map((f) => [f.id, f]));
  const rawData = body.data || {};

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawData)) {
    const field = fieldMap.get(key);
    if (!field) continue;

    const maxLen = MAX_FIELD_LENGTH[field.type] ?? 1000;
    if (typeof value === "string" && value.length > maxLen) {
      setResponseStatus(event, 400);
      return {
        error: `${field.label} exceeds maximum length of ${maxLen} characters`,
      };
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.length > maxLen) {
          setResponseStatus(event, 400);
          return {
            error: `${field.label} contains a value exceeding maximum length`,
          };
        }
      }
    }
    data[key] = value;
  }

  // -------------------------------------------------------------------
  // 7. Required-field validation (respects conditional visibility)
  // -------------------------------------------------------------------
  function isFieldVisible(field: FormField): boolean {
    if (!field.conditional) return true;
    const { fieldId, operator, value: condValue } = field.conditional;
    const fieldVal = String(data[fieldId] ?? "");
    switch (operator) {
      case "equals":
        return fieldVal === condValue;
      case "not_equals":
        return fieldVal !== condValue;
      case "contains":
        return fieldVal.includes(condValue);
      default:
        return true;
    }
  }

  for (const field of fields) {
    if (field.required && isFieldVisible(field)) {
      const val = data[field.id];
      const isEmpty =
        val === undefined ||
        val === null ||
        val === "" ||
        val === false ||
        (Array.isArray(val) && val.length === 0);
      if (isEmpty) {
        setResponseStatus(event, 400);
        return { error: `${field.label} is required` };
      }
    }
  }

  // -------------------------------------------------------------------
  // 8. Extract contact fields from submitted data
  // -------------------------------------------------------------------
  let email: string | null = null;
  let phone: string | null = null;
  let firstName = "Lead";
  let lastName: string | null = null;

  for (const field of fields) {
    const val = data[field.id];
    if (typeof val !== "string" || !val) continue;

    const labelLower = field.label.toLowerCase();

    if (field.type === "email") {
      email = val;
    } else if (
      field.type === "text" &&
      (labelLower.includes("phone") ||
        labelLower.includes("mobile") ||
        labelLower.includes("tel"))
    ) {
      phone = val;
    } else if (
      field.type === "text" &&
      // Match any name-like label (e.g. "Name", "Your name", "Full name",
      // "First name") via the whole word "name", excluding non-person-name
      // fields. "username"/"nickname" lack a \bname\b boundary so are already
      // safe; "last name" is handled by the branch below.
      /\bname\b/.test(labelLower) &&
      !labelLower.includes("last name") &&
      !labelLower.includes("surname") &&
      !labelLower.includes("user") &&
      !labelLower.includes("business") &&
      !labelLower.includes("company")
    ) {
      const parts = val.trim().split(/\s+/);
      firstName = parts[0] ?? "Lead";
      if (parts.length > 1) lastName = parts.slice(1).join(" ");
    } else if (
      field.type === "text" &&
      labelLower.includes("last name") &&
      !lastName
    ) {
      lastName = val.trim();
    }
  }

  const phoneE164 = phone ? normalizePhone(phone) : null;

  const now = new Date().toISOString();
  const responseId = nanoid();
  const ip = ipKey || null;

  // Optional submitterEmail from trusted client metadata
  const rawSubmitter =
    typeof body._meta === "object" && body._meta !== null
      ? (body._meta as { submitterEmail?: unknown }).submitterEmail
      : undefined;
  const submitterEmail =
    typeof rawSubmitter === "string" &&
    rawSubmitter.length > 0 &&
    rawSubmitter.length <= 320 &&
    rawSubmitter.includes("@")
      ? rawSubmitter
      : email; // fall back to the form's email field

  // -------------------------------------------------------------------
  // 9. Gym lead upsert — member + conversation (the FK-safety re-select pattern)
  //
  // guard:allow-unscoped — gym domain tables are single-tenant; lead upsert
  // by natural key (email / phone_e164).
  //
  // CRITICAL: After EACH ON CONFLICT upsert, RE-SELECT the canonical id by the
  // natural key. The upsert may have hit an EXISTING row whose id != the freshly
  // generated nanoid — using the raw nanoid for downstream inserts causes FK
  // mismatch / orphan rows.
  // -------------------------------------------------------------------

  const memberId = nanoid();
  let resolvedMemberId = memberId;

  // Cast to any for raw SQL execution — Neon HTTP driver returns { rows: [] }.
  // This matches the (db as any).execute(sql`...`) pattern used throughout staff-web
  // (P1b-08 decision: raw SQL against Neon Postgres via db.execute).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db2 = db as any as {
    execute: (q: unknown) => Promise<{ rows: unknown[] }>;
  };

  if (email) {
    await db2.execute(sql`
      INSERT INTO gym_members (id, first_name, last_name, email, phone_e164, marketing_consent, created_at, updated_at)
      VALUES (${memberId}, ${firstName}, ${lastName ?? null}, ${email}, ${phoneE164}, false, NOW(), NOW())
      ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE SET
        first_name = EXCLUDED.first_name,
        phone_e164 = COALESCE(EXCLUDED.phone_e164, gym_members.phone_e164),
        updated_at = NOW()
    `);
    // Re-select the canonical id — the upsert may have updated an EXISTING row (id != memberId).
    const {
      rows: [existingMember],
    } = await db2.execute(
      sql`SELECT id FROM gym_members WHERE email = ${email} LIMIT 1`,
    );
    resolvedMemberId =
      ((existingMember as Record<string, unknown>)?.id as string | undefined) ??
      memberId;
  } else if (phoneE164) {
    await db2.execute(sql`
      INSERT INTO gym_members (id, first_name, phone_e164, marketing_consent, created_at, updated_at)
      VALUES (${memberId}, ${firstName}, ${phoneE164}, false, NOW(), NOW())
      ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE SET
        first_name = EXCLUDED.first_name, updated_at = NOW()
    `);
    // Re-select the canonical id — the upsert may have updated an EXISTING row (id != memberId).
    const {
      rows: [existingMember],
    } = await db2.execute(
      sql`SELECT id FROM gym_members WHERE phone_e164 = ${phoneE164} LIMIT 1`,
    );
    resolvedMemberId =
      ((existingMember as Record<string, unknown>)?.id as string | undefined) ??
      memberId;
  }
  // If neither email nor phone, resolvedMemberId stays as the fresh nanoid (anonymous lead)

  // -------------------------------------------------------------------
  // 10. Upsert conversation with status='lead'
  // ON CONFLICT (member_id, channel) — unique index added in P1c-01 migration.
  // -------------------------------------------------------------------
  const convId = nanoid();
  await db2.execute(sql`
    INSERT INTO conversations (id, member_id, channel, status, created_at, updated_at)
    VALUES (${convId}, ${resolvedMemberId}, 'whatsapp', 'lead', NOW(), NOW())
    ON CONFLICT (member_id, channel) DO UPDATE SET
      status = CASE WHEN conversations.status = 'closed' THEN 'lead' ELSE conversations.status END,
      updated_at = NOW()
  `);
  // Re-select the canonical conversation id by (member_id, channel).
  const {
    rows: [convRow],
  } = await db2.execute(
    sql`SELECT id FROM conversations WHERE member_id = ${resolvedMemberId} AND channel = 'whatsapp' LIMIT 1`,
  );
  const resolvedConvId =
    ((convRow as Record<string, unknown>)?.id as string | undefined) ?? convId;

  // -------------------------------------------------------------------
  // 11. Insert messages note so coach sees lead context in /gymos
  // Uses messageType:'text' (NOT a new enum value — messages.messageType enum
  // is ["text","template","image","audio","video","document"]).
  // Form context stored in payload JSON.
  // -------------------------------------------------------------------
  const summaryParts: string[] = [];
  for (const field of fields) {
    const val = data[field.id];
    if (val !== undefined && val !== null && val !== "") {
      summaryParts.push(`${field.label}: ${String(val)}`);
    }
  }
  const summary = summaryParts.slice(0, 5).join(", ");
  const messageBody = `New lead via form "${form.title}": ${summary}`;

  await db2.execute(sql`
    INSERT INTO messages (id, conversation_id, direction, message_type, body, payload, status, created_at)
    VALUES (
      ${nanoid()},
      ${resolvedConvId},
      'in',
      'text',
      ${messageBody},
      ${JSON.stringify({ kind: "form_submission", formId: id, data })},
      'delivered',
      NOW()
    )
  `);

  // -------------------------------------------------------------------
  // 12. Insert form_submissions row (links member + conversation + form)
  // -------------------------------------------------------------------
  await db2.execute(sql`
    INSERT INTO form_submissions (id, form_id, member_id, conversation_id, data, submitted_at, ip, submitter_email)
    VALUES (
      ${responseId},
      ${id},
      ${resolvedMemberId},
      ${resolvedConvId},
      ${JSON.stringify(data)},
      ${now},
      ${ip},
      ${submitterEmail}
    )
  `);

  // -------------------------------------------------------------------
  // 13. Insert responses row (for the forms builder responses view)
  // -------------------------------------------------------------------
  await db.insert(schema.responses).values({
    id: nanoid(),
    formId: id,
    data: JSON.stringify(data),
    submittedAt: now,
    ip,
    submitterEmail,
  });

  // -------------------------------------------------------------------
  // 14. Auto-reply: enqueue an approved WhatsApp template ack to a fresh lead.
  //
  // Compliance: a fresh form lead has NEVER messaged the studio, so the
  // 24h window is CLOSED → the outbound MUST be an approved TEMPLATE
  // (not free text). The worker remains the authoritative gate
  // (opt-in / window / approved-template); we only create the opt-in row
  // it requires and enqueue the send. We are NOT bypassing the worker.
  //
  // Env-gated: LEAD_ACK_TEMPLATE_NAME is the approved template name. The
  // conversational template is NOT approved yet (the user is getting a new
  // one approved separately) — until LEAD_ACK_TEMPLATE_NAME is set on BOTH
  // staff-web (Vercel) and the worker (Fly), this block is a complete no-op
  // and the lead simply lands in the inbox as before.
  //
  // TEMPLATE DESIGN CONTRACT: the approved template MUST declare exactly
  // ONE variable, where {{1}} = the lead's first name. Supplying fewer vars
  // than the template declares makes the Meta/MYÜTIK send FAIL.
  // -------------------------------------------------------------------
  const leadAckTemplate = (process.env.LEAD_ACK_TEMPLATE_NAME ?? "").trim();
  if (phoneE164 && leadAckTemplate) {
    try {
      // (a) Ensure an opt-in row exists. ON CONFLICT DO NOTHING so a
      //     re-submit never clobbers an existing opt-out / opt-in.
      await db2.execute(sql`
        INSERT INTO whatsapp_opt_in (member_id, opted_in_at, evidence_payload, source)
        VALUES (
          ${resolvedMemberId},
          ${now},
          ${JSON.stringify({ kind: "form_submission", formId: id, data })},
          'form_submission'
        )
        ON CONFLICT (member_id) DO NOTHING
      `);

      // (b) Optimistic queued template message (mirrors send-template-to-members.ts).
      const ackMessageId = `msg_${nanoid()}`;
      const ackVars = { "1": firstName };
      const ackPreview = `[template: ${leadAckTemplate}]`;
      await db2.execute(sql`
        INSERT INTO messages (id, conversation_id, direction, message_type, body, payload, status, created_at)
        VALUES (
          ${ackMessageId},
          ${resolvedConvId},
          'out',
          'template',
          ${ackPreview},
          ${JSON.stringify({ name: leadAckTemplate, vars: ackVars })},
          'queued',
          ${now}
        )
      `);
      await db2.execute(sql`
        UPDATE conversations
        SET last_message_preview = ${ackPreview}, updated_at = ${now}
        WHERE id = ${resolvedConvId}
      `);

      // (c) Enqueue the TEMPLATE send. Worker gates opt-in/window/approval.
      await enqueueOutboundWhatsApp({
        messageId: ackMessageId,
        memberId: resolvedMemberId,
        payload: {
          type: "template",
          name: leadAckTemplate,
          vars: ackVars,
          language: "en_US",
        },
      });
    } catch (err) {
      // Lead capture MUST always succeed even if the WhatsApp enqueue
      // fails — mirror send-template-to-members.ts resilience: log + continue.
      console.error("[submitLeadForm] lead ack WhatsApp enqueue failed:", err);
    }
  }

  return { success: true, id: responseId };
});
