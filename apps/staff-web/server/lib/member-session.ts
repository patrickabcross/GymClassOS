/**
 * member-session.ts — Production member identity resolution.
 *
 * Provides requireMember(request), claimMemberByEmail, claimMemberByPhone,
 * and the demo dual-path wrapper requireMemberOrDemo.
 *
 * This file replaces the requireDemoMember pattern in /api/m/* handlers.
 * requireDemoMember is still used by requireMemberOrDemo's demo branch.
 *
 * AUTH-05 / AUTH-06 (MA1-01)
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getSession } from "@agent-native/core/server";
import { requireDemoMember } from "./demo-member";
import {
  claimMemberByEmailWithDb,
  claimMemberByPhoneWithDb,
} from "./member-session-helpers";

export type { Member } from "./member-session-helpers";
export type {
  ClaimEmailResult,
  ClaimPhoneResult,
} from "./member-session-helpers";
import type { Member } from "./member-session-helpers";

// ─────────────────────────────────────────────────────────────────────────────
// H3Event adapter (RESEARCH Finding 9 / Open Question 1)
//
// getSession takes an H3Event. React Router v7 routes receive a Web Request.
// h3 v2's better-auth path reads event.headers (a Web Headers instance).
// A Request already exposes request.headers as a Web Headers — so we build
// a minimal H3-compatible event from it and pass it to the exported getSession.
//
// The Plan 03 spike device-verifies this adapter resolves a Bearer token
// end-to-end. If getSession throws on this shape, widen the event fields
// until event.headers.get("authorization") reaches the bearer() plugin.
// ─────────────────────────────────────────────────────────────────────────────
async function sessionFromRequest(request: Request) {
  const event = {
    headers: request.headers,
    node: { req: {}, res: {} },
    path: new URL(request.url).pathname,
  } as any;
  return getSession(event);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Claim a gym_members row by email for the given userId.
 * Idempotent, re-claim-guarded, writes userId ONLY (dual-unique-key safety).
 */
export async function claimMemberByEmail(userId: string, email: string) {
  return claimMemberByEmailWithDb(getDb(), userId, email);
}

/**
 * Claim a gym_members row by phone (E.164 after normalisation) for userId.
 * Exported for the Plan 02 sign-in phone-fallback retry path.
 */
export async function claimMemberByPhone(userId: string, phoneRaw: string) {
  return claimMemberByPhoneWithDb(getDb(), userId, phoneRaw);
}

/**
 * requireMember(request) — resolve a verified Better-auth Bearer session
 * into a gym_members row. Performs lazy claim-by-email on first call.
 *
 * Throws:
 *   401  — no valid Bearer session
 *   409  — re-claim (row already linked to a different user)
 *   403 (JSON { code: "PHONE_REQUIRED" }) — email not matched, client should collect phone
 *   403  — neither email nor phone matched (all-miss)
 *
 * Never auto-creates a gym_members row (D-10, D-13).
 */
export async function requireMember(request: Request): Promise<Member> {
  const session = await sessionFromRequest(request);
  if (!session?.userId) {
    throw new Response("Unauthenticated", { status: 401 });
  }

  const db = getDb();

  // Fast path: gym_members row already linked to this user
  // guard:allow-unscoped — single-tenant gym tables
  const byClaim = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.userId, session.userId))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (byClaim) return byClaim;

  // Lazy claim-by-email (D-09)
  const result = await claimMemberByEmail(session.userId, session.email);

  if ("error" in result) {
    if (result.error === "RECLAIM") {
      throw new Response("Account conflict", { status: 409 });
    }
    if (result.error === "NO_EMAIL_MATCH") {
      // D-12: phone-match fallback — check for x-claim-phone header
      const phoneHeader = request.headers.get("x-claim-phone");
      if (phoneHeader) {
        const phoneResult = await claimMemberByPhone(
          session.userId,
          phoneHeader,
        );
        if ("error" in phoneResult) {
          if (phoneResult.error === "RECLAIM") {
            throw new Response("Account conflict", { status: 409 });
          }
          // NO_PHONE_MATCH — all-miss dead end (D-13)
          // TODO(MA2+): write a ghost-lead conversations row so staff see it in Inbox
          console.warn(
            "[member-session] unmatched sign-in — staff follow-up needed",
            { userId: session.userId, email: session.email },
          );
          throw new Response("No membership on file — contact the studio.", {
            status: 403,
          });
        }
        return phoneResult;
      }

      // No phone header — signal client to collect phone number
      throw new Response(JSON.stringify({ code: "PHONE_REQUIRED" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Fallback: unexpected sentinel
    throw new Response("No membership on file — contact the studio.", {
      status: 403,
    });
  }

  return result;
}

/**
 * requireMemberOrDemo(request) — dual-path gate (D-17, D-18).
 *
 * In demo mode (DEMO_MODE === "true" AND NODE_ENV !== "production") the
 * existing requireDemoMember path is used (X-Demo-Member-Id header).
 * In all other cases requireMember is used (verified Better-auth Bearer).
 *
 * The gate condition is verbatim: process.env.DEMO_MODE === "true" AND
 * process.env.NODE_ENV !== "production".
 *
 * Member and DemoMember are the same $inferSelect type so the return is
 * uniform — all downstream member.id / member.firstName reads keep working.
 */
export async function requireMemberOrDemo(request: Request): Promise<Member> {
  if (
    process.env.DEMO_MODE === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return requireDemoMember(request);
  }
  return requireMember(request);
}
