/**
 * apps/hq/server/lib/documents.ts
 *
 * Document helper utilities for the HQ Content surface.
 *
 * Forked from: templates/content/server/lib/documents.ts
 * Fork date: 2026-06-19
 * Reason: HQD-04 Content fork (non-collab) — pure utility functions,
 * no collab/Notion dependencies. Kept verbatim (no GymClassOS modifications
 * required in this file).
 */

import type { H3Event } from "h3";
import { getSession } from "@agent-native/core/server";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";

export function parseDocumentFavorite(
  value: boolean | number | string | null | undefined,
): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "t";
  }
  return false;
}

export function getCurrentOwnerEmail(): string {
  const email = getRequestUserEmail();
  if (!email) throw new Error("no authenticated user");
  return email;
}

export async function getEventOwnerEmail(event: H3Event): Promise<string> {
  const session = await getSession(event);
  if (!session?.email) {
    const { createError } = await import("h3");
    throw createError({ statusCode: 401, statusMessage: "Unauthenticated" });
  }
  return session.email;
}
