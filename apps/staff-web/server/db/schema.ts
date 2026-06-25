import { table, text, integer, real, now } from "@agent-native/core/db/schema";

// ---------------------------------------------------------------------------
// Mail template's original tables — kept for upstream-merge compatibility.
// ---------------------------------------------------------------------------

export const scheduledJobs = table("scheduled_jobs", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["snooze", "send_later"] }).notNull(),
  ownerEmail: text("owner_email"),
  emailId: text("email_id"),
  threadId: text("thread_id"),
  accountEmail: text("account_email"),
  payload: text("payload").notNull(),
  runAt: integer("run_at").notNull(),
  status: text("status", {
    enum: ["pending", "processing", "done", "cancelled"],
  })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at").notNull(),
});

export const contactFrequency = table("contact_frequency", {
  id: text("id").primaryKey(), // ownerEmail:contactEmail
  ownerEmail: text("owner_email").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactName: text("contact_name").notNull().default(""),
  sendCount: integer("send_count").notNull().default(0),
  receiveCount: integer("receive_count").notNull().default(0),
  lastContactedAt: integer("last_contacted_at").notNull(),
});

export const automationRules = table("automation_rules", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  domain: text("domain").notNull(), // "mail" | "calendar"
  name: text("name").notNull(),
  condition: text("condition").notNull(), // natural language condition
  actions: text("actions").notNull(), // JSON array of AutomationAction
  enabled: integer("enabled").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const emailTracking = table("email_tracking", {
  pixelToken: text("pixel_token").primaryKey(),
  messageId: text("message_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  sentAt: integer("sent_at").notNull(),
  opensCount: integer("opens_count").notNull().default(0),
  firstOpenedAt: integer("first_opened_at"),
  lastOpenedAt: integer("last_opened_at"),
  lastUserAgent: text("last_user_agent"),
});

export const emailLinkTracking = table("email_link_tracking", {
  clickToken: text("click_token").primaryKey(),
  pixelToken: text("pixel_token").notNull(),
  url: text("url").notNull(),
  clicksCount: integer("clicks_count").notNull().default(0),
  firstClickedAt: integer("first_clicked_at"),
  lastClickedAt: integer("last_clicked_at"),
});

export const queuedEmailDrafts = table("queued_email_drafts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  requesterEmail: text("requester_email").notNull(),
  requesterName: text("requester_name"),
  toRecipients: text("to_recipients").notNull(),
  ccRecipients: text("cc_recipients"),
  bccRecipients: text("bcc_recipients"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  context: text("context"),
  source: text("source").notNull().default("agent"),
  sourceThreadId: text("source_thread_id"),
  accountEmail: text("account_email"),
  composeId: text("compose_id"),
  sentMessageId: text("sent_message_id"),
  status: text("status", {
    enum: ["queued", "in_review", "sent", "dismissed"],
  })
    .notNull()
    .default("queued"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  sentAt: integer("sent_at"),
});

// ---------------------------------------------------------------------------
// GymClassOS domain tables — added 2026-05-17 for Demo Sprint.
//
// Naming: tables prefixed `gym_*` to avoid collision with framework `member` /
// `organization` (Better-auth org-plugin). Single-tenant code, multi-tenant
// deploy — NO `studio_id` columns anywhere; tenancy lives in the deploy.
//
// Demo-grade: text columns where production should be FK-constrained, integer
// epoch for timestamps to match the upstream convention. Schema will be
// refined in Phase P1a (foundation).
// ---------------------------------------------------------------------------

// Gym members — distinct from framework `member` (which is the Better-auth
// org-plugin "user belongs to org" join). Gym members may or may not have
// auth identities; in the demo they don't (interact via WhatsApp + mobile
// stub login). Production wires Better-auth user → gym_member via user_id.
export const gymMembers = table("gym_members", {
  id: text("id").primaryKey(),
  userId: text("user_id"), // FK to framework `user`.id — nullable for demo / WhatsApp-only members
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phoneE164: text("phone_e164"), // E.164 normalised — natural key for WhatsApp
  dateOfBirth: text("date_of_birth"), // ISO date
  sex: text("sex", { enum: ["male", "female", "other", "prefer_not_to_say"] }),
  heightCm: integer("height_cm"),
  weightKg: real("weight_kg"),
  goal: text("goal", {
    enum: ["maintain", "lose", "gain", "performance"],
  }),
  activityLevel: text("activity_level", {
    enum: ["sedentary", "light", "moderate", "active", "very_active"],
  }),
  marketingConsent: integer("marketing_consent", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"), // staff notes
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

// WhatsApp conversations — one per (gym_member, channel)
export const conversations = table("conversations", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(), // FK gym_members.id
  channel: text("channel", { enum: ["whatsapp"] })
    .notNull()
    .default("whatsapp"),
  status: text("status", { enum: ["open", "closed", "snoozed", "lead"] })
    .notNull()
    .default("open"),
  unreadCount: integer("unread_count").notNull().default(0),
  lastInboundAt: text("last_inbound_at"), // ISO — drives 24h window check
  lastOutboundAt: text("last_outbound_at"),
  lastMessagePreview: text("last_message_preview"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

// WhatsApp messages — inbound + outbound, both directions in one table
export const messages = table("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  externalId: text("external_id"), // wamid for WhatsApp; null for queued outbound until sent
  direction: text("direction", { enum: ["in", "out"] }).notNull(),
  messageType: text("message_type", {
    enum: ["text", "template", "image", "audio", "video", "document"],
  })
    .notNull()
    .default("text"),
  body: text("body"), // text content; templates store name+vars in payload
  payload: text("payload"), // JSON — full Meta payload for inbound; template name + vars for outbound
  status: text("status", {
    enum: ["queued", "sent", "delivered", "read", "failed", "rejected"],
  })
    .notNull()
    .default("queued"),
  error: text("error"),
  // P1b: typed error code for sendMessage failures (e.g. "OUT_OF_WINDOW",
  // "TEMPLATE_NOT_APPROVED"). The freeform `error` column stays for messages.
  errorCode: text("error_code"),
  requestedByUserId: text("requested_by_user_id"), // staff user who triggered the send
  agentInitiated: integer("agent_initiated", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull().default(now()),
  sentAt: text("sent_at"),
  deliveredAt: text("delivered_at"),
  readAt: text("read_at"),
  // P1b: Plan 05's applyOrdinalStatusUpdate sets updatedAt = NOW() on each
  // rank-superseding status change. Nullable until first status update lands.
  updatedAt: text("updated_at"),
});

// Class scheduling — definitions (the recurring template) + occurrences (a specific class instance)
export const classDefinitions = table("class_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  durationMin: integer("duration_min").notNull(),
  defaultCapacity: integer("default_capacity").notNull().default(12),
  defaultInstructorUserId: text("default_instructor_user_id"), // FK framework user.id
  category: text("category"), // yoga | hiit | strength | etc.
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now()),
});

// Demo: occurrences are seeded directly. Production: materialised from schedule_rule.
export const classOccurrences = table("class_occurrences", {
  id: text("id").primaryKey(),
  definitionId: text("definition_id").notNull(),
  startsAt: text("starts_at").notNull(), // ISO with timezone offset
  endsAt: text("ends_at").notNull(),
  capacity: integer("capacity").notNull(),
  instructorUserId: text("instructor_user_id"),
  room: text("room"),
  status: text("status", {
    enum: ["scheduled", "cancelled", "completed"],
  })
    .notNull()
    .default("scheduled"),
  notes: text("notes"),
  // LP3-SCHEMA: optional location (Norwich/Wymondham) and trainer assignment.
  // Added by migration v24 (location) and v25 (trainer_id). Nullable soft-refs.
  location: text("location"),
  trainerId: text("trainer_id"),
  // MPV-SCHEMA: optional rule linkage. Added by migration v28.
  // Null = manual single occurrence. Non-null = materialised by the recurring
  // class engine; (rule_id, starts_at) is unique (partial index v29).
  ruleId: text("rule_id"),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// MPV-SCHEMA: Recurring class schedule rules.
//
// DDL created by migration v27 (MPV Phase 2, apps/staff-web/server/plugins/db.ts).
// This Drizzle export is the schema-layer reference; no new migration files needed.
// Single-tenant: no studio_id. Reads carry // guard:allow-unscoped — single-tenant.
//
// days_of_week: JSON array of weekday numbers (0=Sun … 6=Sat), stored as TEXT.
// time_of_day: "HH:MM" in Europe/London studio-local time — the nightly worker
//   converts to UTC per-occurrence using DST-correct Intl computation.
// generated_through: ISO date cursor advanced by the worker after each run.
//   null = not yet generated (first run generates from starts_on).
// ends_on: null = open-ended rolling window.
// active: 1 = materialise on cron; 0 = deactivated (series closed).
// ---------------------------------------------------------------------------
export const classScheduleRules = table("class_schedule_rules", {
  id: text("id").primaryKey(),
  definitionId: text("definition_id").notNull(),
  /** JSON array of weekday numbers (0=Sun … 6=Sat), e.g. "[1,3]" for Mon/Wed */
  daysOfWeek: text("days_of_week").notNull(),
  /** "HH:MM" in Europe/London studio-local time */
  timeOfDay: text("time_of_day").notNull(),
  /** "Norwich" | "Wymondham" | null */
  location: text("location"),
  capacity: integer("capacity").notNull().default(12),
  /** Soft-ref to trainers.id — nullable */
  trainerId: text("trainer_id"),
  /** ISO date "YYYY-MM-DD" — series starts on or after this date */
  startsOn: text("starts_on").notNull(),
  /** ISO date "YYYY-MM-DD" — series ends before this date; null = open-ended */
  endsOn: text("ends_on"),
  /** 1 = active (materialise on cron), 0 = deactivated */
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** ISO date cursor — last date generated through; null = not yet run */
  generatedThrough: text("generated_through"),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// LP3-SCHEMA: Trainers roster — lightweight NOT-auth roster of gym instructors.
//
// DDL created by migration v22 (trainers table) + v23 (unique lower(name) index)
// in apps/staff-web/server/plugins/db.ts. This Drizzle export is the schema-layer
// reference; no new migration files needed. Single-tenant: no studio_id.
// Reads carry // guard:allow-unscoped — single-tenant gym tables.
//
// active uses integer-boolean (mode:"boolean") to match studio_owner_config
// digest_enabled / heartbeat_enabled pattern. Drizzle stores 0/1; SQL DDL is
// INTEGER NOT NULL DEFAULT 1. The unique lower(name) index in v23 is the
// dedupe target for list-trainers / create-trainer / the seed (v26).
// ---------------------------------------------------------------------------
export const trainers = table("trainers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  homeLocation: text("home_location"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now()),
});

export const bookings = table("bookings", {
  id: text("id").primaryKey(),
  occurrenceId: text("occurrence_id").notNull(),
  memberId: text("member_id").notNull(),
  status: text("status", {
    enum: ["booked", "waitlist", "cancelled", "attended", "no_show"],
  })
    .notNull()
    .default("booked"),
  passId: text("pass_id"), // which pass paid for this booking — null until debit happens
  bookedByUserId: text("booked_by_user_id"), // staff who booked, null if self-booked
  bookedAt: text("booked_at").notNull().default(now()),
  cancelledAt: text("cancelled_at"),
  attendedAt: text("attended_at"),
});

// Passes — grants. balance = sum(passes.granted where !expired) - sum(pass_debits.amount)
export const passes = table("passes", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  granted: integer("granted").notNull(), // number of credits granted
  source: text("source", {
    enum: ["purchase", "subscription", "manual", "promo", "refund"],
  }).notNull(),
  stripeChargeId: text("stripe_charge_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  productName: text("product_name"), // "10-pack" / "monthly unlimited"
  expiresAt: text("expires_at"), // ISO; null = never
  createdAt: text("created_at").notNull().default(now()),
});

// Pass debits — append-only ledger. Negative amounts allowed for cancellation refunds.
// Production adds CHECK (sum(amount) <= sum(granted)) trigger. Demo: trust the application.
export const passDebits = table("pass_debits", {
  id: text("id").primaryKey(),
  passId: text("pass_id").notNull(),
  bookingId: text("booking_id"),
  amount: integer("amount").notNull(), // credits consumed (positive) or refunded (negative)
  reason: text("reason"), // "class_booking" | "cancellation_refund" | etc.
  createdAt: text("created_at").notNull().default(now()),
});

// Food items — cache of Open Food Facts + USDA lookups + custom entries
export const foodItems = table("food_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand"),
  barcode: text("barcode"),
  kcalPer100g: real("kcal_per_100g").notNull(),
  proteinPer100g: real("protein_per_100g"),
  carbsPer100g: real("carbs_per_100g"),
  fatPer100g: real("fat_per_100g"),
  fibrePer100g: real("fibre_per_100g"),
  sugarPer100g: real("sugar_per_100g"),
  sodiumMgPer100g: real("sodium_mg_per_100g"),
  servingSizeG: real("serving_size_g"),
  source: text("source", {
    enum: ["openfoodfacts", "usda", "custom", "llm_estimate"],
  }).notNull(),
  externalId: text("external_id"), // OFF barcode or USDA fdcId
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now()),
});

export const foodEntries = table("food_entries", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  foodItemId: text("food_item_id").notNull(),
  loggedAt: text("logged_at").notNull(),
  mealType: text("meal_type", {
    enum: ["breakfast", "lunch", "dinner", "snack"],
  }).notNull(),
  quantityG: real("quantity_g").notNull(),
  // Snapshotted at log time so a food_items edit doesn't retroactively change diary
  kcal: real("kcal").notNull(),
  proteinG: real("protein_g"),
  carbsG: real("carbs_g"),
  fatG: real("fat_g"),
  source: text("source", {
    enum: ["manual", "barcode", "search", "favourite", "agent"],
  })
    .notNull()
    .default("manual"),
  createdAt: text("created_at").notNull().default(now()),
});

// Agent sessions — chat sheet conversations. messages as JSON-encoded text.
export const agentSessions = table("agent_sessions", {
  id: text("id").primaryKey(),
  memberId: text("member_id"), // null for staff agent
  userId: text("user_id"), // null for member agent
  userType: text("user_type", { enum: ["staff", "member"] }).notNull(),
  app: text("app").notNull(), // "mail" | "calendar" | "member-app" | etc.
  messages: text("messages").notNull().default("[]"), // JSON array of {role, content, tool_use?, tool_result?}
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

// Webhook events — idempotency table. Production: composite UNIQUE on
// (provider, external_id). P1b extends with `external_id` + a UNIQUE INDEX
// added in migration 0001 (after a one-shot backfill from the existing `id`
// column). The legacy text PK `id` stays for backwards-compat / existing rows.
export const webhookEvents = table("webhook_events", {
  id: text("id").primaryKey(), // e.g. "stripe:evt_..." or "whatsapp:wamid..."
  provider: text("provider", {
    enum: ["stripe", "whatsapp", "meta_lead"],
  }).notNull(),
  eventType: text("event_type").notNull(),
  externalId: text("external_id"), // P1b — backfilled from id, then UNIQUE(provider, external_id) via migration 0001
  payloadRaw: text("payload_raw").notNull(),
  receivedAt: text("received_at").notNull().default(now()),
  processedAt: text("processed_at"),
  error: text("error"),
});

// ---------------------------------------------------------------------------
// P1b additions (2026-05-20) — Webhook + Worker Spine (Stripe + WhatsApp).
// All strictly additive per CLAUDE.md no-breaking-DB-changes guard.
// ---------------------------------------------------------------------------

// WA-07: WhatsApp opt-in evidence. Sender layer refuses any outbound to a
// member without a row in this table.
// WA-09/WA-10: opt-out marker (additive, nullable) — opted_out_at set means
// the member has opted out; the worker optInGate refuses sends even when an
// opt-in row exists. Write path: set opted_out_at = now() (manual_admin or
// future keyword auto-detection). Re-opt-in requires a manual_admin action,
// not implied by an inbound (onConflictDoNothing in conversations.ts).
export const whatsappOptIn = table("whatsapp_opt_in", {
  memberId: text("member_id").primaryKey(), // FK gym_members.id
  optedInAt: text("opted_in_at").notNull().default(now()),
  evidenceMessageId: text("evidence_message_id"), // FK messages.id (inbound that triggered opt-in)
  evidencePayload: text("evidence_payload"), // JSON of the inbound msg
  source: text("source", {
    enum: [
      "inbound_reply",
      "manual_admin",
      "import",
      "form_submission",
      "meta_lead_ads",
    ],
  }).notNull(),
  optedOutAt: text("opted_out_at"), // WA-09/WA-10: nullable — set when member opts out
});

// WA-08: WhatsApp templates synced from Meta daily. Sender layer gates
// out-of-window sends on status='approved'.
export const whatsappTemplates = table("whatsapp_templates", {
  name: text("name").primaryKey(),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "paused", "disabled"],
  }).notNull(),
  category: text("category", {
    enum: ["utility", "marketing", "authentication"],
  }),
  language: text("language").notNull().default("en_US"),
  componentsJson: text("components_json").notNull(), // raw Meta API response
  lastSyncedAt: text("last_synced_at").notNull().default(now()),
});

// STR-01 mirror: Stripe customers reflected locally for fast lookup.
export const stripeCustomers = table("stripe_customers", {
  stripeCustomerId: text("stripe_customer_id").primaryKey(),
  memberId: text("member_id"), // nullable until matched to a gym_member
  rawJson: text("raw_json").notNull(),
  updatedAt: text("updated_at").notNull().default(now()),
});

// STR-04 / STR-05 mirror: subscriptions reflected for entitlement decisions.
export const stripeSubscriptions = table("stripe_subscriptions", {
  stripeSubscriptionId: text("stripe_subscription_id").primaryKey(),
  memberId: text("member_id").notNull(),
  status: text("status", {
    enum: [
      "active",
      "past_due",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "trialing",
      "unpaid",
      "paused",
    ],
  }).notNull(),
  planId: text("plan_id"),
  currentPeriodEnd: text("current_period_end"),
  rawJson: text("raw_json").notNull(),
  updatedAt: text("updated_at").notNull().default(now()),
});

// STR-03: payments table — one row per Stripe payment_intent we observe.
export const payments = table("payments", {
  id: text("id").primaryKey(), // `pay_<paymentIntentId>`
  memberId: text("member_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull().unique(),
  amountMinorUnits: integer("amount_minor_units").notNull(),
  currency: text("currency").notNull(),
  status: text("status", {
    enum: ["succeeded", "failed", "refunded", "pending"],
  }).notNull(),
  rawJson: text("raw_json").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

// STR-01: encrypted secret storage. Values are pgp_sym_encrypt(plain, master_key)
// — pgcrypto is enabled in migration 0001. Reads use pgp_sym_decrypt at SQL time.
export const secrets = table("secrets", {
  name: text("name").primaryKey(), // e.g. "stripe_restricted_key"
  ciphertext: text("ciphertext").notNull(), // pgp_sym_encrypt(value, master_key)
  updatedAt: text("updated_at").notNull().default(now()),
  lastUsedAt: text("last_used_at"),
});

// ---------------------------------------------------------------------------
// P1c additions (2026-06-01) — Public Site Integrations (lead funnel).
// Additive only. form_submissions stores public form/enquiry responses so the
// forms builder can list responses without joining through messages.
// ---------------------------------------------------------------------------

// Re-export the forked forms feature schema so schema.forms / schema.responses
// resolve through the existing getDb()/schema barrel.
export * from "./forms-schema.js";

export const formSubmissions = table("form_submissions", {
  id: text("id").primaryKey(),
  formId: text("form_id").notNull(),
  memberId: text("member_id"), // FK gym_members.id — set after lead upsert
  conversationId: text("conversation_id"), // FK conversations.id
  data: text("data").notNull(), // JSON: field responses
  submittedAt: text("submitted_at").notNull().default(now()),
  ip: text("ip"),
  submitterEmail: text("submitter_email"),
});

// ---------------------------------------------------------------------------
// P3: AI Noticeboard Home — dashboard state tables (migration 0005).
// Applied directly to gymos-demo Neon (NOT runMigrations). Additive only.
// ---------------------------------------------------------------------------

// Per-section AI-authored notes (recommendation text, last-action summary).
// UNIQUE(section) enables upsert-by-section-key via ON CONFLICT (section).
export const dashboardNotes = table("dashboard_notes", {
  id: text("id").primaryKey(),
  section: text("section", {
    enum: ["inbox", "schedule", "members", "revenue", "ai_today"],
  }).notNull(),
  body: text("body").notNull().default(""),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

// AI-curated task list. priority: 1=high, 2=medium, 3=low.
export const dashboardTasks = table("dashboard_tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body"),
  priority: integer("priority").notNull().default(2), // 1=high, 2=medium, 3=low
  status: text("status", { enum: ["open", "completed"] })
    .notNull()
    .default("open"),
  proposalId: text("proposal_id"), // nullable FK to dashboardProposals.id
  createdAt: text("created_at").notNull().default(now()),
  completedAt: text("completed_at"),
});

// Pending one-click action proposals. action_name is allowlisted in approve-proposal.ts.
export const dashboardProposals = table("dashboard_proposals", {
  id: text("id").primaryKey(),
  taskId: text("task_id"), // nullable FK to dashboardTasks.id
  actionName: text("action_name", {
    enum: [
      "send-template-to-members",
      "create-checkout-link",
      "publish-form",
      "cancel-occurrence",
      "reschedule-occurrence",
    ],
  }).notNull(),
  paramsJson: text("params_json").notNull().default("{}"),
  rationale: text("rationale"),
  status: text("status", {
    enum: ["pending", "approved", "rejected", "executed"],
  })
    .notNull()
    .default("pending"),
  proposedAt: text("proposed_at").notNull().default(now()),
  executedAt: text("executed_at"),
  rejectedAt: text("rejected_at"),
  resultJson: text("result_json"),
});

// ---------------------------------------------------------------------------
// BD2-03 additions (2026-06-19) — Studio-side telemetry capture (TEL-01).
// studio_telemetry_state is a singleton accumulator row (id='singleton')
// written by the AFTER INSERT trigger on token_usage and read by the BD2-04
// telemetry push job in services/worker. Strictly additive. Applied via the
// runMigrations array (versions 14+15) in apps/staff-web/server/plugins/db.ts.
// ---------------------------------------------------------------------------

export const studioTelemetryState = table("studio_telemetry_state", {
  /** Always 'singleton' — one row per studio deploy. */
  id: text("id").primaryKey(),
  /** Input tokens accumulated since last telemetry push. */
  tokenUsageTodayInput: integer("token_usage_today_input").notNull().default(0),
  /** Output tokens accumulated since last telemetry push. */
  tokenUsageTodayOutput: integer("token_usage_today_output")
    .notNull()
    .default(0),
  /** API request count accumulated since last telemetry push. */
  requestCountToday: integer("request_count_today").notNull().default(0),
  /** Outbound WhatsApp messages sent today (written by the push job on reset). */
  outboundSentToday: integer("outbound_sent_today").notNull().default(0),
  /** Outbound WhatsApp messages failed today (written by the push job on reset). */
  outboundFailedToday: integer("outbound_failed_today").notNull().default(0),
  /** ISO 8601 timestamp of the last successful telemetry push to HQ. */
  lastPushAt: text("last_push_at"),
  /** Status of the last telemetry push: 'ok' | 'error' | null. */
  lastPushStatus: text("last_push_status"),
  /** ISO 8601 timestamp when this row was last modified. */
  updatedAt: text("updated_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// P1c.1 additions (2026-06-12) — Stripe Connect: connected (Custom-equivalent)
// account. Strictly additive. Applied direct to gymos-demo Neon (migration
// 0006_p1c1_connected_accounts.sql). Single-tenant: no studio_id FK.
// ---------------------------------------------------------------------------

// STR-01 (P1c.1): the connected account (Custom-equivalent) for the studio.
// One row expected per deploy. Holds acct_id + readiness flags so reducers
// (Plan 03) and actions can gate operations on chargesEnabled/payoutsEnabled
// without re-fetching from Stripe on every request.
export const connectedAccounts = table("connected_accounts", {
  id: text("id").primaryKey(), // "acct_xxx"
  studioLabel: text("studio_label"), // descriptive only; single-tenant, no studio_id FK
  chargesEnabled: integer("charges_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  payoutsEnabled: integer("payouts_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  requirementsDue: text("requirements_due"), // JSON array string of requirements.currently_due
  disabledReason: text("disabled_reason"),
  rawJson: text("raw_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// BD4-01: Studio Brain + Dispatcher — additive Drizzle table defs.
//
// Three new tables that support GOB (Brain knowledge) and GOD (owner
// dispatcher). All are single-tenant by design — no studio_id FK.
// Queries carry // guard:allow-unscoped — single-tenant studio Brain.
// ---------------------------------------------------------------------------

// GOB-01/02/03: Lightweight Brain knowledge store.
// Three singleton rows: id='brand-voice', 'ethos', 'class-catalog'.
export const studioBrainDocs = table("studio_brain_docs", {
  id: text("id").primaryKey(),
  docType: text("doc_type").notNull(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  seededAt: text("seeded_at"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

// GOD-01/02: Singleton config for the studio owner dispatcher.
// One row per deploy (id='singleton'). Seeded by provisioner at deploy time.
export const studioOwnerConfig = table("studio_owner_config", {
  id: text("id").primaryKey(), // always 'singleton'
  ownerPhoneE164: text("owner_phone_e164").notNull().default(""),
  studioTimezone: text("studio_timezone").notNull().default("Europe/London"),
  digestEnabled: integer("digest_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  heartbeatEnabled: integer("heartbeat_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  heartbeatBatchSize: integer("heartbeat_batch_size").notNull().default(50),
  // MC1-01: Meta Conversion Tracking config (migration v31).
  // meta_stage_event_map is JSONB in Postgres — stored as TEXT here; read/write
  // as JSON string. Resolver in server/lib/stage-event-map.ts applies defaults
  // when null. meta_pixel_id and meta_test_event_code are plain text.
  metaPixelId: text("meta_pixel_id"),
  metaTestEventCode: text("meta_test_event_code"),
  metaStageEventMap: text("meta_stage_event_map"), // JSONB column; JSON string
  // GSG-01: studio-global site/location names. JSONB in Postgres — stored as
  // TEXT here, read/written as a JSON string array. Resolver in
  // server/lib/sites.ts applies an EMPTY-array default when null (gym-agnostic
  // — NO hardcoded site names in code; HUSTLE's sites are DATA). Migration v35.
  sites: text("sites"), // JSONB column; JSON string array
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

// GOD-04: Suppression ceiling tracker — max 3 attempts per member per 90-day
// rolling window. Indexed via version-19 migration.
export const reactivationAttempts = table("reactivation_attempts", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
  sentAt: text("sent_at").notNull().default(now()),
  createdAt: text("created_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// CV2-01: Content documents — flat table for rich-text content authoring.
//
// DDL created by migration v20 (CV1-01, apps/staff-web/server/plugins/db.ts).
// This Drizzle export is the schema-layer reference; no new migration needed.
// Single-tenant: no ownableColumns, no studio_id. Reads carry
// // guard:allow-unscoped — single-tenant content.
// Status stays 'draft' here; 'published' support arrives in CV4.
// ---------------------------------------------------------------------------
export const contentDocuments = table("content_documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("draft"),
  slug: text("slug"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// CV3-01: Video compositions — template-driven Remotion compositions for
// in-browser promo video authoring.
//
// DDL created by migration v21 (CV1-01, apps/staff-web/server/plugins/db.ts).
// This Drizzle export is the schema-layer reference; NO new migration needed
// (table already exists). Single-tenant: no ownableColumns, no studio_id.
// Reads carry // guard:allow-unscoped — single-tenant video.
// spec column is JSON TEXT validated by VideoSpecSchema before persist.
// Status stays 'draft' throughout CV3; 'published' member-exposure arrives CV4.
// ---------------------------------------------------------------------------
export const videoCompositions = table("video_compositions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  /** JSON TEXT — VideoSpec validated by VideoSpecSchema before every write. */
  spec: text("spec").notNull().default("{}"),
  status: text("status").notNull().default("draft"),
  slug: text("slug"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});

// ---------------------------------------------------------------------------
// MC1-01: Meta lead attribution — one row per member (UNIQUE on member_id).
//
// DDL created by migration v32 (MC1-01, apps/staff-web/server/plugins/db.ts).
// Stores fbc/fbp/fbclid captured at form submit time + per-stage sent markers
// for downstream MC2 lifecycle event dedup.
//
// Timestamps stored as TEXT (ISO string) — consistent with this file's
// pattern; the TIMESTAMPTZ DDL in migration v32 stores/returns ISO strings via
// the Neon HTTP driver. mc1-04 worker writes lead_sent_at / lead_status after
// each CAPI POST.
//
// Single-tenant: no ownableColumns, no studio_id. Queries carry
// // guard:allow-unscoped — single-tenant meta attribution
// ---------------------------------------------------------------------------
export const metaLeadAttribution = table("meta_lead_attribution", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().unique(),
  fbc: text("fbc"),
  fbp: text("fbp"),
  fbclid: text("fbclid"),
  initialEventId: text("initial_event_id"),
  pageUrl: text("page_url"),
  clientIp: text("client_ip"),
  clientUserAgent: text("client_user_agent"),
  leadSentAt: text("lead_sent_at"),
  leadStatus: text("lead_status"),
  // MC1 gap-fix: error message from the last CAPI send attempt (written by worker,
  // migration v33). Cleared to NULL on a successful send.
  lastError: text("last_error"),
  // MC3 (D-13/LEAD-02): Meta lead_id for in-platform Lead Ad leads. Stored at ingest
  // (MC3-02), read by the lifecycle fire points and passed as user_data.lead_id.
  // Added via migration v34 (additive only — IF NOT EXISTS).
  metaLeadId: text("meta_lead_id"),
  contactSentAt: text("contact_sent_at"),
  purchaseSentAt: text("purchase_sent_at"),
  scheduleSentAt: text("schedule_sent_at"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
});
