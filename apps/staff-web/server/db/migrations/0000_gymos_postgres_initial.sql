-- BASELINE MIGRATION — schema already applied to gymos-demo Neon project via MCP during D0.4.
-- This file exists to give drizzle-kit a Postgres-dialect baseline. Do NOT run against gymos-demo.
-- P1b additive changes ship in 0001_*.sql via Plan P1b-02.
CREATE TABLE "agent_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text,
	"user_id" text,
	"user_type" text NOT NULL,
	"app" text NOT NULL,
	"messages" text DEFAULT '[]' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"condition" text NOT NULL,
	"actions" text NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"occurrence_id" text NOT NULL,
	"member_id" text NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"pass_id" text,
	"booked_by_user_id" text,
	"booked_at" text DEFAULT now() NOT NULL,
	"cancelled_at" text,
	"attended_at" text
);
--> statement-breakpoint
CREATE TABLE "class_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_min" integer NOT NULL,
	"default_capacity" integer DEFAULT 12 NOT NULL,
	"default_instructor_user_id" text,
	"category" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"definition_id" text NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text NOT NULL,
	"capacity" integer NOT NULL,
	"instructor_user_id" text,
	"room" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_frequency" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"send_count" integer DEFAULT 0 NOT NULL,
	"receive_count" integer DEFAULT 0 NOT NULL,
	"last_contacted_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_inbound_at" text,
	"last_outbound_at" text,
	"last_message_preview" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_link_tracking" (
	"click_token" text PRIMARY KEY NOT NULL,
	"pixel_token" text NOT NULL,
	"url" text NOT NULL,
	"clicks_count" integer DEFAULT 0 NOT NULL,
	"first_clicked_at" integer,
	"last_clicked_at" integer
);
--> statement-breakpoint
CREATE TABLE "email_tracking" (
	"pixel_token" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"owner_email" text NOT NULL,
	"sent_at" integer NOT NULL,
	"opens_count" integer DEFAULT 0 NOT NULL,
	"first_opened_at" integer,
	"last_opened_at" integer,
	"last_user_agent" text
);
--> statement-breakpoint
CREATE TABLE "food_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"food_item_id" text NOT NULL,
	"logged_at" text NOT NULL,
	"meal_type" text NOT NULL,
	"quantity_g" double precision NOT NULL,
	"kcal" double precision NOT NULL,
	"protein_g" double precision,
	"carbs_g" double precision,
	"fat_g" double precision,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"barcode" text,
	"kcal_per_100g" double precision NOT NULL,
	"protein_per_100g" double precision,
	"carbs_per_100g" double precision,
	"fat_per_100g" double precision,
	"fibre_per_100g" double precision,
	"sugar_per_100g" double precision,
	"sodium_mg_per_100g" double precision,
	"serving_size_g" double precision,
	"source" text NOT NULL,
	"external_id" text,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_members" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone_e164" text,
	"date_of_birth" text,
	"sex" text,
	"height_cm" integer,
	"weight_kg" double precision,
	"goal" text,
	"activity_level" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"external_id" text,
	"direction" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"body" text,
	"payload" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"requested_by_user_id" text,
	"agent_initiated" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"sent_at" text,
	"delivered_at" text,
	"read_at" text
);
--> statement-breakpoint
CREATE TABLE "pass_debits" (
	"id" text PRIMARY KEY NOT NULL,
	"pass_id" text NOT NULL,
	"booking_id" text,
	"amount" integer NOT NULL,
	"reason" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passes" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"granted" integer NOT NULL,
	"source" text NOT NULL,
	"stripe_charge_id" text,
	"stripe_subscription_id" text,
	"product_name" text,
	"expires_at" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queued_email_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"owner_email" text NOT NULL,
	"requester_email" text NOT NULL,
	"requester_name" text,
	"to_recipients" text NOT NULL,
	"cc_recipients" text,
	"bcc_recipients" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"context" text,
	"source" text DEFAULT 'agent' NOT NULL,
	"source_thread_id" text,
	"account_email" text,
	"compose_id" text,
	"sent_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"sent_at" integer
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"owner_email" text,
	"email_id" text,
	"thread_id" text,
	"account_email" text,
	"payload" text NOT NULL,
	"run_at" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_raw" text NOT NULL,
	"received_at" text DEFAULT now() NOT NULL,
	"processed_at" text,
	"error" text
);
