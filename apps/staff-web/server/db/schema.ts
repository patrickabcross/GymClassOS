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
  provider: text("provider", { enum: ["stripe", "whatsapp"] }).notNull(),
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
    enum: ["inbound_reply", "manual_admin", "import"],
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
