// member-session.test.ts — Unit tests for the claim-by-email/phone pure helpers.
// Uses the injected-db pattern (BD4-01) to avoid importing @agent-native/core
// (ESM/CJS vitest issue) while still verifying the core claim safety properties.
//
// Run via: cd apps/staff-web && npx vitest run --config vitest.unit.config.ts server/lib/member-session.test.ts
//
// MA1-03 extension (2026-06-29): added "Seed scenario" describe block that
// explicitly exercises the claim against a seeded unclaimed row (userId IS NULL),
// proving the three safety properties the auth spike depends on:
//   (a) UPDATE writes userId ONLY (dual-unique-key safety)
//   (b) Second call returns the same row without a second UPDATE (idempotency)
//   (c) Row already owned by a different user → { error: "RECLAIM", status: 409 }

import { describe, it, expect } from "vitest";
import {
  claimMemberByEmailWithDb,
  claimMemberByPhoneWithDb,
} from "./member-session-helpers.js";
import type { Member } from "./member-session.js";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal mock row factory
// ─────────────────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<Member> = {}): Member {
  return {
    id: "mem_001",
    userId: null,
    firstName: "Alice",
    lastName: "Test",
    email: "alice@example.com",
    phoneE164: "+447911123456",
    dateOfBirth: null,
    sex: null,
    heightCm: null,
    weightKg: null,
    goal: null,
    activityLevel: null,
    marketingConsent: false,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock DB builder
// ─────────────────────────────────────────────────────────────────────────────

type MockDb = {
  setUpdatedRows: (rows: Member[]) => void;
  getLastSetCall: () => Record<string, unknown> | null;
};

function makeMockDb(opts: {
  byUserId?: Member | null;
  byEmail?: Member | null;
  byPhone?: Member | null;
}): { db: any; mock: MockDb } {
  let lastSetCall: Record<string, unknown> | null = null;
  let updatedRows: Member[] = [];

  const db = {
    select() {
      return this;
    },
    from() {
      return this;
    },
    where(_cond: any) {
      return this;
    },
    limit(_n: number) {
      return this;
    },
    then(resolve: (r: Member[]) => unknown) {
      // We need to figure out which query was called.
      // We can track via the last where condition key.
      return Promise.resolve(resolve(updatedRows));
    },
    update() {
      return this;
    },
    set(args: Record<string, unknown>) {
      lastSetCall = args;
      return this;
    },
  };

  const mock: MockDb = {
    setUpdatedRows(rows) {
      updatedRows = rows;
    },
    getLastSetCall() {
      return lastSetCall;
    },
  };

  return { db, mock };
}

// ─────────────────────────────────────────────────────────────────────────────
// Smarter mock DB that routes queries by condition key
// ─────────────────────────────────────────────────────────────────────────────

type QueryIntent = "byUserId" | "byEmail" | "byPhone" | "unknown";

function makeSmartDb(opts: {
  byUserId?: Member | null;
  byEmail?: Member | null;
  byPhone?: Member | null;
}): { db: any; getLastSetCall: () => Record<string, unknown> | null } {
  let lastSetCall: Record<string, unknown> | null = null;
  let currentIntent: QueryIntent = "unknown";
  let updateWhere: any = null;

  const chain: any = {
    _selectMode: true,
    _updateMode: false,

    select() {
      const c = Object.create(chain);
      c._selectMode = true;
      c._updateMode = false;
      return c;
    },
    from() {
      return this;
    },
    where(cond: any) {
      // Detect intent from the condition's column/value hints.
      // We rely on the drizzle-orm eq/and/isNull shape or just count calls.
      // Simpler: each test sets intent via a closure.
      updateWhere = cond;
      return this;
    },
    limit(_n: number) {
      return this;
    },
    then(resolve: (r: Member[]) => unknown) {
      // Return appropriate rows based on last resolved intent.
      // We'll read from intentRows set per call.
      return Promise.resolve(resolve([]));
    },
    update() {
      const c = Object.create(chain);
      c._selectMode = false;
      c._updateMode = true;
      return c;
    },
    set(args: Record<string, unknown>) {
      lastSetCall = args;
      return this;
    },
  };

  return { db: chain, getLastSetCall: () => lastSetCall };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real tests with a properly sequenced mock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a test-friendly Drizzle-like mock db that records .set() calls and
 * can return pre-configured rows per query round.
 */
function makeSequentialDb(queryResults: (Member | null)[]) {
  let callCount = 0;
  let lastSetArgs: Record<string, unknown> | null = null;

  const db = {
    select() {
      return this;
    },
    from() {
      return this;
    },
    where() {
      return this;
    },
    limit() {
      return this;
    },
    then(resolve: (rows: Member[]) => unknown) {
      const row = queryResults[callCount] ?? null;
      callCount++;
      return Promise.resolve(resolve(row ? [row] : []));
    },
    update() {
      return this;
    },
    set(args: Record<string, unknown>) {
      lastSetArgs = args;
      return this;
    },
    getCallCount: () => callCount,
    getLastSetArgs: () => lastSetArgs,
  };

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// claimMemberByEmailWithDb tests
// ─────────────────────────────────────────────────────────────────────────────

describe("claimMemberByEmailWithDb", () => {
  it("idempotent fast-path: returns the already-linked row without a second query", async () => {
    const existingRow = makeRow({ userId: "user_123" });
    // Query 1 (byUserId) returns the already-claimed row.
    const db = makeSequentialDb([existingRow]);

    const result = await claimMemberByEmailWithDb(
      db as any,
      "user_123",
      "alice@example.com",
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.userId).toBe("user_123");
    }
    // Should NOT have done a .set() call (no update needed)
    expect(db.getLastSetArgs()).toBeNull();
  });

  it("unclaimed row: UPDATE writes userId ONLY (never email or phoneE164)", async () => {
    const unclaimedRow = makeRow({ userId: null, email: "alice@example.com" });
    // Query 1 (byUserId) → null (not yet linked). Query 2 (byEmail) → the row.
    const db = makeSequentialDb([null, unclaimedRow]);

    const result = await claimMemberByEmailWithDb(
      db as any,
      "user_999",
      "alice@example.com",
    );

    expect("error" in result).toBe(false);
    // Verify the .set() call ONLY contained { userId } — no email or phoneE164
    const setArgs = db.getLastSetArgs();
    expect(setArgs).not.toBeNull();
    expect(Object.keys(setArgs!)).toEqual(["userId"]);
    expect(setArgs!.userId).toBe("user_999");
    // Result should merge userId into the row
    if (!("error" in result)) {
      expect(result.userId).toBe("user_999");
    }
  });

  it("re-claim: row email-matched but has a DIFFERENT non-null userId → RECLAIM error", async () => {
    const claimedByOther = makeRow({
      userId: "user_OTHER",
      email: "alice@example.com",
    });
    // Query 1 (byUserId) → null. Query 2 (byEmail) → row with different userId.
    const db = makeSequentialDb([null, claimedByOther]);

    const result = await claimMemberByEmailWithDb(
      db as any,
      "user_999",
      "alice@example.com",
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("RECLAIM");
      expect((result as any).status).toBe(409);
    }
  });

  it("no email match: returns NO_EMAIL_MATCH sentinel", async () => {
    // Query 1 (byUserId) → null. Query 2 (byEmail) → null.
    const db = makeSequentialDb([null, null]);

    const result = await claimMemberByEmailWithDb(
      db as any,
      "user_999",
      "nobody@example.com",
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("NO_EMAIL_MATCH");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// claimMemberByPhoneWithDb tests
// ─────────────────────────────────────────────────────────────────────────────

describe("claimMemberByPhoneWithDb", () => {
  it("idempotent fast-path: already-linked row returned unchanged", async () => {
    const existingRow = makeRow({
      userId: "user_123",
      phoneE164: "+447911123456",
    });
    const db = makeSequentialDb([existingRow]);

    const result = await claimMemberByPhoneWithDb(
      db as any,
      "user_123",
      "+447911123456",
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.userId).toBe("user_123");
    }
    expect(db.getLastSetArgs()).toBeNull();
  });

  it("unclaimed row: UPDATE writes userId ONLY (never phoneE164 or email)", async () => {
    const unclaimedRow = makeRow({ userId: null, phoneE164: "+447911123456" });
    const db = makeSequentialDb([null, unclaimedRow]);

    const result = await claimMemberByPhoneWithDb(
      db as any,
      "user_999",
      "+447911123456",
    );

    expect("error" in result).toBe(false);
    const setArgs = db.getLastSetArgs();
    expect(setArgs).not.toBeNull();
    expect(Object.keys(setArgs!)).toEqual(["userId"]);
    expect(setArgs!.userId).toBe("user_999");
  });

  it("re-claim: returns RECLAIM error", async () => {
    const claimedByOther = makeRow({
      userId: "user_OTHER",
      phoneE164: "+447911123456",
    });
    const db = makeSequentialDb([null, claimedByOther]);

    const result = await claimMemberByPhoneWithDb(
      db as any,
      "user_999",
      "+447911123456",
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("RECLAIM");
    }
  });

  it("invalid phone raw value: returns NO_PHONE_MATCH without querying", async () => {
    const db = makeSequentialDb([]);

    const result = await claimMemberByPhoneWithDb(
      db as any,
      "user_999",
      "not-a-phone",
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("NO_PHONE_MATCH");
    }
  });

  it("no phone match: returns NO_PHONE_MATCH sentinel", async () => {
    // Query 1 (byUserId) → null. Query 2 (byPhone) → null.
    const db = makeSequentialDb([null, null]);

    const result = await claimMemberByPhoneWithDb(
      db as any,
      "user_999",
      "+447911999000",
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("NO_PHONE_MATCH");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MA1-03 Seed scenario — exercises claim on the specific seeded row shape
//
// The seed (seed-ma1-test-account.ts) inserts:
//   { id: "mbr_spike_ma1_001", userId: null, email: "ma1-spike@example.com" }
//
// These three tests prove the safety properties the device spike depends on:
//   (a) UPDATE writes userId ONLY — never email or phoneE164
//   (b) Second call (same userId) returns the same row without another UPDATE
//   (c) Claim attempt by a DIFFERENT userId → { error: "RECLAIM", status: 409 }
// ─────────────────────────────────────────────────────────────────────────────

const SPIKE_EMAIL = "ma1-spike@example.com";
const SPIKE_MEMBER_ID = "mbr_spike_ma1_001";
const SPIKE_USER_ID = "ba_user_spike_001"; // hypothetical Better-auth user.id after sign-up

function makeSpikeRow(overrides: Partial<Member> = {}): Member {
  return makeRow({
    id: SPIKE_MEMBER_ID,
    userId: null, // unclaimed — as seeded
    email: SPIKE_EMAIL,
    phoneE164: "+447700900123",
    firstName: "Spike",
    lastName: "Tester",
    ...overrides,
  });
}

describe("MA1-03 seed scenario: claimMemberByEmail on seeded unclaimed row", () => {
  it("(a) claim on unclaimed seeded row: UPDATE writes userId ONLY", async () => {
    const seededRow = makeSpikeRow(); // userId: null
    // Query 1 (byUserId) → null (not linked yet). Query 2 (byEmail) → seeded row.
    const db = makeSequentialDb([null, seededRow]);

    const result = await claimMemberByEmailWithDb(
      db as any,
      SPIKE_USER_ID,
      SPIKE_EMAIL,
    );

    // Result should be a Member (not an error)
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.userId).toBe(SPIKE_USER_ID);
      expect(result.id).toBe(SPIKE_MEMBER_ID);
      expect(result.email).toBe(SPIKE_EMAIL);
    }

    // The UPDATE .set() call MUST only contain { userId } — never email or phoneE164
    const setArgs = db.getLastSetArgs();
    expect(setArgs).not.toBeNull();
    expect(Object.keys(setArgs!)).toEqual(["userId"]);
    expect(setArgs!.userId).toBe(SPIKE_USER_ID);
  });

  it("(b) idempotency: second claim by the same userId returns existing row without a second UPDATE", async () => {
    // After the first claim, the row has userId set. The fast-path (byUserId query) finds it.
    const alreadyClaimedRow = makeSpikeRow({ userId: SPIKE_USER_ID });
    // Query 1 (byUserId) → already-claimed row → short-circuit; no UPDATE, no byEmail query.
    const db = makeSequentialDb([alreadyClaimedRow]);

    const result = await claimMemberByEmailWithDb(
      db as any,
      SPIKE_USER_ID,
      SPIKE_EMAIL,
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.userId).toBe(SPIKE_USER_ID);
      expect(result.id).toBe(SPIKE_MEMBER_ID);
    }

    // No UPDATE should have been issued — the fast path returned before reaching .set()
    expect(db.getLastSetArgs()).toBeNull();
  });

  it("(c) re-claim: a different userId cannot claim a row already owned by the spike user → RECLAIM 409", async () => {
    const claimedBySpikeUser = makeSpikeRow({ userId: SPIKE_USER_ID });
    const interloperUserId = "ba_user_interloper_999";

    // Query 1 (byUserId for interloper) → null. Query 2 (byEmail) → row owned by spike user.
    const db = makeSequentialDb([null, claimedBySpikeUser]);

    const result = await claimMemberByEmailWithDb(
      db as any,
      interloperUserId,
      SPIKE_EMAIL,
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("RECLAIM");
      expect((result as any).status).toBe(409);
    }

    // No UPDATE should have been issued — the re-claim guard fires before .set()
    expect(db.getLastSetArgs()).toBeNull();
  });
});
