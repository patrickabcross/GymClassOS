/**
 * Idempotent seed for ~3 months of realistic GymOS demo activity ending today.
 *
 * Window: 2026-02-26 → 2026-05-26 (13 weeks).
 *
 * Populates:
 *   - 260 gym_members (UK-style names, valid E.164 mobile numbers)
 *   - ~95% with whatsapp_opt_in evidence
 *   - 8 class_definitions, ~455 class_occurrences, ~5,200 bookings
 *   - 300 passes (mix of 10-pack purchases and monthly-unlimited subscriptions)
 *   - ~3,900 pass_debits ledger entries (one per attended booking)
 *   - 200 stripe_customers + 200 stripe_subscriptions + ~500 payments
 *   - 90 conversations + ~400 messages (mixed inbound/outbound/templates)
 *
 * Designed so that:
 *   - Analytics route (gymos.analytics.tsx) produces realistic fill (~75%),
 *     cancellation (~10%), and pass-utilisation (~65%) numbers.
 *   - list-fill-rate, list-renewals, list-at-risk-members all return
 *     differentiated results suitable for the agent's read-only Q&A demo.
 *
 * Idempotent — re-runs insert 0 new rows. All IDs are deterministic
 * (`demo3m_*` prefix) and all inserts use ON CONFLICT DO NOTHING.
 *
 * Run with: pnpm --filter @gymos/staff-web db:seed-demo
 *
 * Env loading: dotenv reads .env.local (preferred) and .env (fallback).
 * DATABASE_URL must point at the Neon project.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// apps/staff-web/server/db/seeds/seed-demo-data.ts → apps/staff-web
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");

dotenv.config({ path: path.join(APP_ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(APP_ROOT, ".env"), quiet: true });

const { getDb, schema } = await import("../index.js");
const { sql } = await import("drizzle-orm");

// ───────────────────────────────────────────────────────────────────────────
// Deterministic PRNG — mulberry32. Identical sequence every run, so re-running
// the seed produces byte-identical IDs / dates / picks. Drives uniqueness of
// member phone numbers, occurrence timing jitter, and status mix sampling.
// ───────────────────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260526);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;

// ───────────────────────────────────────────────────────────────────────────
// Time window: 3 months ending today (2026-05-26).
// ───────────────────────────────────────────────────────────────────────────
const WINDOW_END = new Date("2026-05-26T22:00:00.000Z"); // end-of-day-ish
const WINDOW_START = new Date("2026-02-26T06:00:00.000Z");
const NOW_ISO = new Date().toISOString();

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400000);
}
function isoFromDateAndHM(d: Date, hour: number, minute: number) {
  const out = new Date(d);
  out.setUTCHours(hour, minute, 0, 0);
  return out.toISOString();
}
function plusMinutes(iso: string, mins: number) {
  return new Date(new Date(iso).getTime() + mins * 60000).toISOString();
}

// ───────────────────────────────────────────────────────────────────────────
// Realistic UK first / last name pools. 50 × 50 = 2500 combos for 260 members.
// ───────────────────────────────────────────────────────────────────────────
const FIRST_NAMES = [
  "Olivia", "Amelia", "Isla", "Ava", "Mia", "Ivy", "Lily", "Sophia", "Aria",
  "Grace", "Emily", "Freya", "Charlotte", "Florence", "Willow", "Daisy",
  "Poppy", "Sophie", "Rosie", "Phoebe", "Hannah", "Eva", "Lucy", "Maya",
  "Bella", "Oliver", "George", "Noah", "Arthur", "Leo", "Harry", "Muhammad",
  "Jack", "Charlie", "Theodore", "Henry", "Oscar", "Jacob", "William",
  "Thomas", "James", "Alfie", "Freddie", "Edward", "Lucas", "Logan", "Joshua",
  "Benjamin", "Mason", "Alexander",
] as const;

const LAST_NAMES = [
  "Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson",
  "Davies", "Robinson", "Wright", "Thompson", "Evans", "Walker", "White",
  "Roberts", "Green", "Hall", "Wood", "Jackson", "Clarke", "Patel", "Khan",
  "Lewis", "Allen", "Scott", "Young", "Mitchell", "Turner", "Cooper",
  "Harris", "King", "Lee", "Martin", "Clark", "Lewis", "Hill", "Baker",
  "Edwards", "Morris", "Ward", "Stewart", "Cox", "Bell", "Murray", "Bailey",
  "Cole", "Hughes", "Reed", "Foster", "Gray",
] as const;

// ───────────────────────────────────────────────────────────────────────────
// Bulk insert helper — chunk arrays so we stay under driver limits and don't
// blow up on Neon's parameter cap (Postgres-level: 65535).
// ───────────────────────────────────────────────────────────────────────────
async function bulkInsert<T>(
  table: any,
  rows: T[],
  conflictTarget: any,
  chunkSize = 200,
) {
  if (rows.length === 0) return 0;
  const db = getDb();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const result: any = await db
      .insert(table)
      .values(chunk as any)
      .onConflictDoNothing({ target: conflictTarget })
      .returning({ id: conflictTarget });
    inserted += Array.isArray(result) ? result.length : chunk.length;
  }
  return inserted;
}

// ───────────────────────────────────────────────────────────────────────────
// Domain-specific generators.
// ───────────────────────────────────────────────────────────────────────────
type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneE164: string;
  dateOfBirth: string;
  sex: "male" | "female" | "other" | "prefer_not_to_say";
  heightCm: number | null;
  weightKg: number | null;
  goal: "maintain" | "lose" | "gain" | "performance";
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  marketingConsent: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const MEMBER_COUNT = 260;

function generateMembers(): Member[] {
  const usedPhones = new Set<string>();
  const usedEmails = new Set<string>();
  const members: Member[] = [];

  for (let i = 1; i <= MEMBER_COUNT; i++) {
    const id = `demo3m_member_${String(i).padStart(4, "0")}`;
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);

    // Phone: +447xxxxxxxxx (UK mobile prefix). Loop until unique.
    let phone: string;
    do {
      const tail = String(randInt(100000000, 999999999));
      phone = `+447${tail}`;
    } while (usedPhones.has(phone));
    usedPhones.add(phone);

    // Email: firstname.lastname{n}@example.com, unique
    const base = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
    let email = `${base}@example.com`;
    let suffix = 2;
    while (usedEmails.has(email)) {
      email = `${base}${suffix}@example.com`;
      suffix++;
    }
    usedEmails.add(email);

    // DoB weighted 25-45. 70% in that band, 30% spread 18-65.
    let age: number;
    if (rand() < 0.7) age = randInt(25, 45);
    else age = randInt(18, 65);
    const dob = new Date(2026, 0, 1);
    dob.setUTCFullYear(dob.getUTCFullYear() - age);
    dob.setUTCMonth(randInt(0, 11));
    dob.setUTCDate(randInt(1, 28));
    const dateOfBirth = dob.toISOString().slice(0, 10);

    // Sex distribution roughly even with small spread.
    const sexRoll = rand();
    const sex =
      sexRoll < 0.48
        ? "female"
        : sexRoll < 0.96
          ? "male"
          : sexRoll < 0.98
            ? "other"
            : "prefer_not_to_say";

    // Plausible body metrics
    const heightCm = sex === "female" ? randInt(152, 178) : randInt(165, 195);
    const weightKg =
      Math.round((sex === "female" ? randInt(48, 85) : randInt(65, 110)) * 10) /
      10;

    const goal = pick([
      "maintain",
      "lose",
      "gain",
      "performance",
    ] as const);
    const activityLevel = pick([
      "sedentary",
      "light",
      "moderate",
      "active",
      "very_active",
    ] as const);
    const marketingConsent = rand() < 0.55;

    // createdAt spread across the window — earlier members join earlier so
    // member tenure is realistic. The first ~30% existed before the window
    // (i.e. created_at clamped to WINDOW_START - some days).
    const createdAt =
      i <= MEMBER_COUNT * 0.3
        ? new Date(
            WINDOW_START.getTime() - randInt(1, 180) * 86400000,
          ).toISOString()
        : new Date(
            WINDOW_START.getTime() +
              rand() *
                (WINDOW_END.getTime() - WINDOW_START.getTime()) *
                0.6,
          ).toISOString();

    members.push({
      id,
      firstName,
      lastName,
      email,
      phoneE164: phone,
      dateOfBirth,
      sex,
      heightCm,
      weightKg,
      goal,
      activityLevel,
      marketingConsent,
      notes: null,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return members;
}

// ───────────────────────────────────────────────────────────────────────────
// Class definitions — 8 active classes with sensible duration / capacity.
// ───────────────────────────────────────────────────────────────────────────
const CLASS_DEFS = [
  { id: "demo3m_def_yoga", name: "Yoga", durationMin: 60, capacity: 14, category: "yoga", description: "Vinyasa flow for all levels" },
  { id: "demo3m_def_hiit", name: "HIIT", durationMin: 45, capacity: 16, category: "hiit", description: "High-intensity interval training" },
  { id: "demo3m_def_strength", name: "Strength", durationMin: 60, capacity: 12, category: "strength", description: "Barbell + accessory work" },
  { id: "demo3m_def_spin", name: "Spin", durationMin: 45, capacity: 16, category: "cardio", description: "Indoor cycling with music" },
  { id: "demo3m_def_pilates", name: "Pilates", durationMin: 50, capacity: 12, category: "pilates", description: "Mat-based core conditioning" },
  { id: "demo3m_def_boxing", name: "Boxing", durationMin: 60, capacity: 10, category: "boxing", description: "Boxing fundamentals + conditioning" },
  { id: "demo3m_def_mobility", name: "Mobility", durationMin: 45, capacity: 14, category: "mobility", description: "Restorative mobility flow" },
  { id: "demo3m_def_barre", name: "Barre", durationMin: 50, capacity: 12, category: "barre", description: "Ballet-inspired strength" },
] as const;

// Weekly schedule: which classes run on which weekday + at what hour:minute.
// Days: 0=Sun..6=Sat. ~35 occurrences per week.
const WEEKLY_SCHEDULE: Record<
  number,
  Array<{ defId: string; hour: number; minute: number }>
> = {
  // Monday — strength bias
  1: [
    { defId: "demo3m_def_hiit", hour: 6, minute: 30 },
    { defId: "demo3m_def_strength", hour: 7, minute: 30 },
    { defId: "demo3m_def_spin", hour: 12, minute: 0 },
    { defId: "demo3m_def_strength", hour: 17, minute: 30 },
    { defId: "demo3m_def_hiit", hour: 18, minute: 30 },
    { defId: "demo3m_def_yoga", hour: 19, minute: 30 },
  ],
  // Tuesday — yoga / pilates
  2: [
    { defId: "demo3m_def_yoga", hour: 6, minute: 30 },
    { defId: "demo3m_def_pilates", hour: 7, minute: 30 },
    { defId: "demo3m_def_mobility", hour: 9, minute: 30 },
    { defId: "demo3m_def_yoga", hour: 17, minute: 30 },
    { defId: "demo3m_def_pilates", hour: 18, minute: 30 },
    { defId: "demo3m_def_barre", hour: 19, minute: 30 },
  ],
  // Wednesday — strength bias
  3: [
    { defId: "demo3m_def_hiit", hour: 6, minute: 30 },
    { defId: "demo3m_def_strength", hour: 7, minute: 30 },
    { defId: "demo3m_def_spin", hour: 12, minute: 0 },
    { defId: "demo3m_def_strength", hour: 17, minute: 30 },
    { defId: "demo3m_def_spin", hour: 18, minute: 30 },
    { defId: "demo3m_def_boxing", hour: 19, minute: 30 },
  ],
  // Thursday — yoga / pilates
  4: [
    { defId: "demo3m_def_yoga", hour: 6, minute: 30 },
    { defId: "demo3m_def_pilates", hour: 7, minute: 30 },
    { defId: "demo3m_def_mobility", hour: 12, minute: 0 },
    { defId: "demo3m_def_yoga", hour: 17, minute: 30 },
    { defId: "demo3m_def_barre", hour: 18, minute: 30 },
    { defId: "demo3m_def_pilates", hour: 19, minute: 30 },
  ],
  // Friday — strength bias
  5: [
    { defId: "demo3m_def_hiit", hour: 6, minute: 30 },
    { defId: "demo3m_def_strength", hour: 7, minute: 30 },
    { defId: "demo3m_def_spin", hour: 12, minute: 0 },
    { defId: "demo3m_def_strength", hour: 17, minute: 30 },
    { defId: "demo3m_def_hiit", hour: 18, minute: 30 },
  ],
  // Saturday — weekend mix
  6: [
    { defId: "demo3m_def_boxing", hour: 9, minute: 30 },
    { defId: "demo3m_def_barre", hour: 10, minute: 30 },
    { defId: "demo3m_def_yoga", hour: 11, minute: 30 },
    { defId: "demo3m_def_hiit", hour: 12, minute: 30 },
  ],
  // Sunday: closed (no occurrences)
  0: [],
};

type Occurrence = {
  id: string;
  definitionId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  instructorUserId: string | null;
  room: string | null;
  status: "scheduled" | "cancelled" | "completed";
  notes: string | null;
  createdAt: string;
};

function generateOccurrences(): Occurrence[] {
  const defById = new Map(CLASS_DEFS.map((d) => [d.id, d]));
  const occurrences: Occurrence[] = [];
  let counter = 0;

  // Iterate every day of the window.
  for (
    let day = new Date(WINDOW_START);
    day <= WINDOW_END;
    day = addDays(day, 1)
  ) {
    const dow = day.getUTCDay();
    const slots = WEEKLY_SCHEDULE[dow] ?? [];
    for (const slot of slots) {
      counter++;
      const def = defById.get(slot.defId)!;
      const startsAt = isoFromDateAndHM(day, slot.hour, slot.minute);
      const endsAt = plusMinutes(startsAt, def.durationMin);
      const isPast = new Date(startsAt) < new Date();
      const cancelRoll = rand();
      // ~5% cancelled across the board
      const status: Occurrence["status"] = cancelRoll < 0.05
        ? "cancelled"
        : isPast
          ? rand() < 0.95
            ? "completed"
            : "scheduled" // small fraction left scheduled (data-quality realism)
          : "scheduled";
      occurrences.push({
        id: `demo3m_occ_${String(counter).padStart(4, "0")}`,
        definitionId: def.id,
        startsAt,
        endsAt,
        capacity: def.capacity,
        instructorUserId: null,
        room: pick(["Studio A", "Studio B", "Main Floor"]),
        status,
        notes: null,
        createdAt: new Date(
          new Date(startsAt).getTime() - randInt(7, 30) * 86400000,
        ).toISOString(),
      });
    }
  }
  return occurrences;
}

// ───────────────────────────────────────────────────────────────────────────
// Passes — 200 unlimited subs + 100 10-packs (~300 total).
// ───────────────────────────────────────────────────────────────────────────
type Pass = {
  id: string;
  memberId: string;
  granted: number;
  source: "purchase" | "subscription" | "manual" | "promo" | "refund";
  stripeChargeId: string | null;
  stripeSubscriptionId: string | null;
  productName: string;
  expiresAt: string | null;
  createdAt: string;
};

function generatePasses(members: Member[]): {
  passes: Pass[];
  subPlanByMember: Map<string, "monthly_unlimited" | "drop_in_10">;
} {
  const passes: Pass[] = [];
  const subPlanByMember = new Map<
    string,
    "monthly_unlimited" | "drop_in_10"
  >();

  // 200 of the first 200 members get an active monthly-unlimited subscription.
  const subMembers = members.slice(0, 200);
  subMembers.forEach((m, i) => {
    const planChoice: "monthly_unlimited" | "drop_in_10" =
      i % 2 === 0 ? "monthly_unlimited" : "drop_in_10";
    subPlanByMember.set(m.id, planChoice);

    if (planChoice === "monthly_unlimited") {
      // Active subscription-backed pass: granted=999, expires_at = next billing date
      const periodEnd = new Date(
        WINDOW_END.getTime() + randInt(1, 30) * 86400000,
      ).toISOString();
      passes.push({
        id: `demo3m_pass_sub_${String(i + 1).padStart(4, "0")}`,
        memberId: m.id,
        granted: 999,
        source: "subscription",
        stripeChargeId: null,
        stripeSubscriptionId: `demo3m_sub_${String(i + 1).padStart(4, "0")}`,
        productName: "Monthly Unlimited",
        expiresAt: periodEnd,
        createdAt: new Date(
          WINDOW_START.getTime() + randInt(0, 60) * 86400000,
        ).toISOString(),
      });
    } else {
      // 10-pack purchase, expires 90d after createdAt
      const created = new Date(
        WINDOW_START.getTime() + randInt(0, 75) * 86400000,
      );
      const expires = addDays(created, 90);
      passes.push({
        id: `demo3m_pass_pack_${String(i + 1).padStart(4, "0")}`,
        memberId: m.id,
        granted: 10,
        source: "purchase",
        stripeChargeId: `demo3m_ch_${String(i + 1).padStart(4, "0")}`,
        stripeSubscriptionId: null,
        productName: "10-Pack",
        expiresAt: expires.toISOString(),
        createdAt: created.toISOString(),
      });
    }
  });

  // 100 more historical 10-packs (mostly expired) across the back-half of
  // members so list-at-risk-members has something to find.
  const extraMembers = members.slice(200, 260);
  for (let i = 0; i < 100; i++) {
    const m = extraMembers[i % extraMembers.length];
    const created = new Date(
      WINDOW_START.getTime() + randInt(0, 60) * 86400000,
    );
    // 70% expired (before today), 30% expiring soon (next 30 days)
    const isExpired = rand() < 0.7;
    const expires = isExpired
      ? addDays(created, 60) // expired in past
      : addDays(WINDOW_END, randInt(1, 28)); // expiring soon
    passes.push({
      id: `demo3m_pass_extra_${String(i + 1).padStart(4, "0")}`,
      memberId: m.id,
      granted: 10,
      source: "purchase",
      stripeChargeId: `demo3m_ch_extra_${String(i + 1).padStart(4, "0")}`,
      stripeSubscriptionId: null,
      productName: "10-Pack",
      expiresAt: expires.toISOString(),
      createdAt: created.toISOString(),
    });
  }

  return { passes, subPlanByMember };
}

// ───────────────────────────────────────────────────────────────────────────
// Bookings — average 12 per past occurrence, attended/no_show/cancelled mix.
// Future occurrences: 70% booked, 5% waitlist.
// ───────────────────────────────────────────────────────────────────────────
type Booking = {
  id: string;
  occurrenceId: string;
  memberId: string;
  status: "booked" | "waitlist" | "cancelled" | "attended" | "no_show";
  passId: string | null;
  bookedByUserId: string | null;
  bookedAt: string;
  cancelledAt: string | null;
  attendedAt: string | null;
};

type PassDebit = {
  id: string;
  passId: string;
  bookingId: string | null;
  amount: number;
  reason: string | null;
  createdAt: string;
};

function generateBookingsAndDebits(
  occurrences: Occurrence[],
  members: Member[],
  passes: Pass[],
): { bookings: Booking[]; debits: PassDebit[] } {
  const bookings: Booking[] = [];
  const debits: PassDebit[] = [];
  let bookingCounter = 0;
  let debitCounter = 0;

  // Group passes by member for quick lookup.
  const passesByMember = new Map<string, Pass[]>();
  for (const p of passes) {
    if (!passesByMember.has(p.memberId)) passesByMember.set(p.memberId, []);
    passesByMember.get(p.memberId)!.push(p);
  }

  // Members who don't have a pass — they can still create bookings (no debit).
  const membersWithPass = new Set(passesByMember.keys());

  for (const occ of occurrences) {
    if (occ.status === "cancelled") {
      // Skip bookings for cancelled occurrences for simplicity.
      continue;
    }
    const isPast = new Date(occ.startsAt) < new Date();

    // Determine target bookings count for this occurrence.
    // Aim for fill rate ~75% across the board with variance per class.
    // Mean fill = 0.75 → mean bookings = 0.75 * capacity, with ±0.3 variance.
    const targetFill = Math.min(
      1.0,
      Math.max(0.2, 0.75 + (rand() - 0.5) * 0.6),
    );
    const targetBookings = Math.round(occ.capacity * targetFill);
    // Pick that many unique members for this occurrence
    const memberPool = [...members];
    // Fisher-Yates partial shuffle
    for (let i = 0; i < targetBookings; i++) {
      const j = i + Math.floor(rand() * (memberPool.length - i));
      [memberPool[i], memberPool[j]] = [memberPool[j], memberPool[i]];
    }
    const selectedMembers = memberPool.slice(0, targetBookings);

    for (const m of selectedMembers) {
      bookingCounter++;
      const id = `demo3m_book_${String(bookingCounter).padStart(5, "0")}`;
      // booked_at must be before starts_at; spread 1-7d prior
      const bookedAt = new Date(
        new Date(occ.startsAt).getTime() -
          randInt(1, 168) * 3600000,
      ).toISOString();

      let status: Booking["status"];
      let attendedAt: string | null = null;
      let cancelledAt: string | null = null;

      if (isPast) {
        const r = rand();
        if (r < 0.75) {
          status = "attended";
          attendedAt = occ.startsAt;
        } else if (r < 0.85) {
          status = "no_show";
        } else if (r < 0.95) {
          status = "cancelled";
          cancelledAt = new Date(
            new Date(occ.startsAt).getTime() - randInt(1, 24) * 3600000,
          ).toISOString();
        } else {
          status = "waitlist";
        }
      } else {
        const r = rand();
        if (r < 0.7) {
          status = "booked";
        } else if (r < 0.75) {
          status = "waitlist";
        } else if (r < 0.85) {
          status = "cancelled";
          cancelledAt = new Date(bookedAt).toISOString();
        } else {
          status = "booked";
        }
      }

      // Decide pass association — pick any pass for this member, prefer
      // unexpired-at-time-of-booking.
      let passId: string | null = null;
      if (membersWithPass.has(m.id)) {
        const memberPasses = passesByMember.get(m.id)!;
        const validAtBooking = memberPasses.find(
          (p) =>
            !p.expiresAt ||
            new Date(p.expiresAt) > new Date(bookedAt),
        );
        passId = (validAtBooking ?? memberPasses[0]).id;
      }

      bookings.push({
        id,
        occurrenceId: occ.id,
        memberId: m.id,
        status,
        passId,
        bookedByUserId: null,
        bookedAt,
        cancelledAt,
        attendedAt,
      });

      // Debit: one credit per attended booking.
      if (status === "attended" && passId) {
        debitCounter++;
        debits.push({
          id: `demo3m_debit_${String(debitCounter).padStart(5, "0")}`,
          passId,
          bookingId: id,
          amount: 1,
          reason: "class_booking",
          createdAt: attendedAt ?? bookedAt,
        });
      }
    }
  }

  return { bookings, debits };
}

// ───────────────────────────────────────────────────────────────────────────
// Stripe customers + subscriptions + payments.
// ───────────────────────────────────────────────────────────────────────────
function generateStripeData(
  members: Member[],
  subPlanByMember: Map<string, "monthly_unlimited" | "drop_in_10">,
) {
  type StripeCust = {
    stripeCustomerId: string;
    memberId: string;
    rawJson: string;
    updatedAt: string;
  };
  type StripeSub = {
    stripeSubscriptionId: string;
    memberId: string;
    status:
      | "active"
      | "past_due"
      | "canceled"
      | "incomplete"
      | "incomplete_expired"
      | "trialing"
      | "unpaid"
      | "paused";
    planId: string | null;
    currentPeriodEnd: string | null;
    rawJson: string;
    updatedAt: string;
  };
  type Payment = {
    id: string;
    memberId: string | null;
    stripePaymentIntentId: string;
    amountMinorUnits: number;
    currency: string;
    status: "succeeded" | "failed" | "refunded" | "pending";
    rawJson: string;
    occurredAt: string;
  };

  const stripeCustomers: StripeCust[] = [];
  const stripeSubscriptions: StripeSub[] = [];
  const payments: Payment[] = [];

  const subMembers = members.slice(0, 200);
  let payCounter = 0;

  subMembers.forEach((m, i) => {
    const custId = `cus_demo3m_${String(i + 1).padStart(4, "0")}`;
    const subId = `demo3m_sub_${String(i + 1).padStart(4, "0")}`;
    const plan = subPlanByMember.get(m.id) ?? "monthly_unlimited";

    stripeCustomers.push({
      stripeCustomerId: custId,
      memberId: m.id,
      rawJson: JSON.stringify({
        id: custId,
        email: m.email,
        name: `${m.firstName} ${m.lastName}`,
      }),
      updatedAt: NOW_ISO,
    });

    // Status mix: 85% active, 5% past_due, 5% trialing, 5% canceled
    const r = rand();
    const status: StripeSub["status"] =
      r < 0.85
        ? "active"
        : r < 0.9
          ? "past_due"
          : r < 0.95
            ? "trialing"
            : "canceled";

    const periodEnd =
      status === "canceled"
        ? new Date(
            WINDOW_END.getTime() - randInt(5, 60) * 86400000,
          ).toISOString()
        : new Date(
            WINDOW_END.getTime() + randInt(1, 30) * 86400000,
          ).toISOString();

    stripeSubscriptions.push({
      stripeSubscriptionId: subId,
      memberId: m.id,
      status,
      planId:
        plan === "monthly_unlimited"
          ? "plan_monthly_unlimited"
          : "plan_drop_in_10",
      currentPeriodEnd: periodEnd,
      rawJson: JSON.stringify({
        id: subId,
        customer: custId,
        status,
        plan: plan,
      }),
      updatedAt: NOW_ISO,
    });

    // Generate ~2-3 payments per subscription across the window
    const paymentCount = randInt(2, 3);
    const amountMinor = plan === "monthly_unlimited" ? 9900 : 4500;
    for (let p = 0; p < paymentCount; p++) {
      payCounter++;
      const occurredAt = new Date(
        WINDOW_START.getTime() +
          rand() * (WINDOW_END.getTime() - WINDOW_START.getTime()),
      ).toISOString();
      // Mostly succeeded; a small fraction failed (matches past_due subs)
      const pStatus: Payment["status"] = rand() < 0.96
        ? "succeeded"
        : "failed";
      const piId = `pi_demo3m_${String(payCounter).padStart(5, "0")}`;
      payments.push({
        id: `pay_${piId}`,
        memberId: m.id,
        stripePaymentIntentId: piId,
        amountMinorUnits: amountMinor,
        currency: "gbp",
        status: pStatus,
        rawJson: JSON.stringify({
          id: piId,
          customer: custId,
          amount: amountMinor,
          status: pStatus,
        }),
        occurredAt,
      });
    }
  });

  return { stripeCustomers, stripeSubscriptions, payments };
}

// ───────────────────────────────────────────────────────────────────────────
// WhatsApp opt-in evidence + conversations + messages.
// ───────────────────────────────────────────────────────────────────────────
function generateOptIns(members: Member[]) {
  const optIns: Array<{
    memberId: string;
    optedInAt: string;
    evidenceMessageId: string | null;
    evidencePayload: string | null;
    source: "inbound_reply" | "manual_admin" | "import";
  }> = [];

  for (const m of members) {
    if (rand() < 0.95) {
      const after = new Date(
        new Date(m.createdAt).getTime() + randInt(0, 14) * 86400000,
      );
      optIns.push({
        memberId: m.id,
        optedInAt: after.toISOString(),
        evidenceMessageId: null,
        evidencePayload: JSON.stringify({ text: "Yes, please contact me" }),
        source: "inbound_reply",
      });
    }
  }
  return optIns;
}

const SAMPLE_INBOUND = [
  "Hey, can I book the 7:30 HIIT tomorrow?",
  "Is the spin class still on tonight?",
  "What time is yoga on Saturday?",
  "Need to cancel my Wednesday booking sorry",
  "Do you have any spots in tonight's boxing?",
  "Can you check my pass balance please?",
  "Thanks for the great session today!",
  "Will the 6:30 HIIT still run with this weather?",
  "Have you got any 1:1 PT availability?",
  "When does my pass expire?",
  "Hi! Just signed up for next week's strength class",
  "Quick one — is the studio open bank holiday?",
] as const;

const SAMPLE_OUTBOUND = [
  "Hi — yes, spot reserved. See you then!",
  "All booked in. Reply CANCEL if anything changes.",
  "We've got space — you're confirmed.",
  "No worries, cancelled. Hope to see you soon.",
  "Your pass balance is 7 credits, expires next month.",
  "Welcome to the studio! Looking forward to having you.",
  "Saturday yoga is at 11:30 — would you like me to book you?",
  "We're open as usual, see you tonight!",
  "Sorry that one's full but I've added you to the waitlist.",
  "Confirmed — see you at 18:30.",
] as const;

function generateConversationsAndMessages(members: Member[]) {
  // 90 conversations across the first 90 members.
  const convMembers = members.slice(0, 90);
  const conversations: Array<{
    id: string;
    memberId: string;
    channel: "whatsapp";
    status: "open" | "closed" | "snoozed";
    unreadCount: number;
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    lastMessagePreview: string | null;
    createdAt: string;
    updatedAt: string;
  }> = [];
  const messages: Array<{
    id: string;
    conversationId: string;
    externalId: string | null;
    direction: "in" | "out";
    messageType: "text" | "template";
    body: string;
    payload: string | null;
    status:
      | "queued"
      | "sent"
      | "delivered"
      | "read"
      | "failed"
      | "rejected";
    error: string | null;
    errorCode: string | null;
    requestedByUserId: string | null;
    agentInitiated: boolean;
    createdAt: string;
    sentAt: string | null;
    deliveredAt: string | null;
    readAt: string | null;
    updatedAt: string | null;
  }> = [];

  let msgCounter = 0;
  convMembers.forEach((m, i) => {
    const convId = `demo3m_conv_${String(i + 1).padStart(3, "0")}`;
    // Status: ~70 open, ~15 closed, ~5 snoozed
    const sRoll = rand();
    const status: "open" | "closed" | "snoozed" =
      sRoll < 0.78 ? "open" : sRoll < 0.94 ? "closed" : "snoozed";

    // 60% recent (last 7 days), 40% spread across window
    const lastInboundOffsetMs =
      rand() < 0.6
        ? -randInt(0, 7 * 24) * 3600000 // last 7 days
        : -randInt(7 * 24, 90 * 24) * 3600000; // older
    const lastInboundAt = new Date(
      Date.now() + lastInboundOffsetMs,
    ).toISOString();
    const lastOutboundAt = new Date(
      new Date(lastInboundAt).getTime() + randInt(1, 240) * 60000,
    ).toISOString();

    // Generate 4-6 messages alternating in/out
    const messageCount = randInt(4, 6);
    let lastBody = "";
    const baseTime = new Date(lastInboundAt).getTime() - messageCount * 3600000;
    for (let k = 0; k < messageCount; k++) {
      msgCounter++;
      const isOut = k % 2 === 1; // first inbound, alternate
      // Occasionally an outbound template (5% chance and only when outbound)
      const isTemplate = isOut && rand() < 0.1;
      const body = isOut
        ? isTemplate
          ? "[template: class_reminder]"
          : pick(SAMPLE_OUTBOUND)
        : pick(SAMPLE_INBOUND);
      lastBody = body;
      const createdAt = new Date(baseTime + k * 1800000).toISOString();
      messages.push({
        id: `demo3m_msg_${String(msgCounter).padStart(5, "0")}`,
        conversationId: convId,
        externalId: isOut
          ? `wamid.demo3m_${String(msgCounter).padStart(5, "0")}`
          : `wamid.demo3m_in_${String(msgCounter).padStart(5, "0")}`,
        direction: isOut ? "out" : "in",
        messageType: isTemplate ? "template" : "text",
        body,
        payload: isTemplate
          ? JSON.stringify({ name: "class_reminder", vars: {} })
          : null,
        status: isOut ? "delivered" : "delivered",
        error: null,
        errorCode: null,
        requestedByUserId: null,
        agentInitiated: false,
        createdAt,
        sentAt: isOut ? createdAt : null,
        deliveredAt: isOut ? createdAt : null,
        readAt: null,
        updatedAt: null,
      });
    }

    const unreadCount = status === "open" ? randInt(0, 3) : 0;
    const createdAt = new Date(baseTime).toISOString();
    conversations.push({
      id: convId,
      memberId: m.id,
      channel: "whatsapp",
      status,
      unreadCount,
      lastInboundAt,
      lastOutboundAt,
      lastMessagePreview: lastBody.slice(0, 200),
      createdAt,
      updatedAt: lastOutboundAt,
    });
  });

  return { conversations, messages };
}

// ───────────────────────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────────────────────
async function main() {
  const db = getDb();
  const startedAt = Date.now();

  console.log("─".repeat(70));
  console.log("GymOS demo seed — 3 months of activity (2026-02-26 → 2026-05-26)");
  console.log("─".repeat(70));

  // 1. Members
  console.log("\n[1/9] Generating gym_members...");
  const members = generateMembers();
  console.log(`  → ${members.length} members generated`);
  await bulkInsert(schema.gymMembers, members, schema.gymMembers.id);

  // 2. Class definitions
  console.log("\n[2/9] Inserting class_definitions...");
  const defRows = CLASS_DEFS.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    durationMin: d.durationMin,
    defaultCapacity: d.capacity,
    defaultInstructorUserId: null,
    category: d.category,
    active: true,
    createdAt: WINDOW_START.toISOString(),
  }));
  await bulkInsert(schema.classDefinitions, defRows, schema.classDefinitions.id);
  console.log(`  → ${defRows.length} class definitions`);

  // 3. Class occurrences
  console.log("\n[3/9] Generating class_occurrences...");
  const occurrences = generateOccurrences();
  console.log(`  → ${occurrences.length} occurrences across 13 weeks`);
  await bulkInsert(
    schema.classOccurrences,
    occurrences,
    schema.classOccurrences.id,
  );

  // 4. Passes
  console.log("\n[4/9] Generating passes...");
  const { passes, subPlanByMember } = generatePasses(members);
  console.log(
    `  → ${passes.length} passes (${passes.filter((p) => p.source === "subscription").length} subs, ${passes.filter((p) => p.source === "purchase").length} purchases)`,
  );
  await bulkInsert(schema.passes, passes, schema.passes.id);

  // 5. Bookings + debits
  console.log("\n[5/9] Generating bookings + pass_debits...");
  const { bookings, debits } = generateBookingsAndDebits(
    occurrences,
    members,
    passes,
  );
  console.log(`  → ${bookings.length} bookings, ${debits.length} debits`);
  await bulkInsert(schema.bookings, bookings, schema.bookings.id);
  await bulkInsert(schema.passDebits, debits, schema.passDebits.id);

  // 6. Stripe customers / subscriptions / payments
  console.log("\n[6/9] Generating Stripe data...");
  const { stripeCustomers, stripeSubscriptions, payments } = generateStripeData(
    members,
    subPlanByMember,
  );
  console.log(
    `  → ${stripeCustomers.length} customers, ${stripeSubscriptions.length} subs, ${payments.length} payments`,
  );
  await bulkInsert(
    schema.stripeCustomers,
    stripeCustomers,
    schema.stripeCustomers.stripeCustomerId,
  );
  await bulkInsert(
    schema.stripeSubscriptions,
    stripeSubscriptions,
    schema.stripeSubscriptions.stripeSubscriptionId,
  );
  await bulkInsert(schema.payments, payments, schema.payments.id);

  // 7. Opt-ins
  console.log("\n[7/9] Generating whatsapp_opt_in...");
  const optIns = generateOptIns(members);
  console.log(`  → ${optIns.length} opt-in rows`);
  await bulkInsert(
    schema.whatsappOptIn,
    optIns,
    schema.whatsappOptIn.memberId,
  );

  // 8. Conversations + messages
  console.log("\n[8/9] Generating conversations + messages...");
  const { conversations, messages: msgs } =
    generateConversationsAndMessages(members);
  console.log(
    `  → ${conversations.length} conversations, ${msgs.length} messages`,
  );
  await bulkInsert(
    schema.conversations,
    conversations,
    schema.conversations.id,
  );
  await bulkInsert(schema.messages, msgs, schema.messages.id);

  // 9. Verify via counts
  console.log("\n[9/9] Verifying row counts...");
  const counts: Record<string, number> = {};
  for (const [name, t] of [
    ["gym_members", schema.gymMembers],
    ["whatsapp_opt_in", schema.whatsappOptIn],
    ["class_definitions", schema.classDefinitions],
    ["class_occurrences", schema.classOccurrences],
    ["bookings", schema.bookings],
    ["passes", schema.passes],
    ["pass_debits", schema.passDebits],
    ["stripe_customers", schema.stripeCustomers],
    ["stripe_subscriptions", schema.stripeSubscriptions],
    ["payments", schema.payments],
    ["conversations", schema.conversations],
    ["messages", schema.messages],
  ] as const) {
    const r: any = await db
      .select({ c: sql<number>`COUNT(*)` })
      .from(t as any);
    counts[name] = Number(r?.[0]?.c ?? 0);
  }
  for (const [name, c] of Object.entries(counts)) {
    console.log(`  ${name.padEnd(24)} ${String(c).padStart(6)}`);
  }

  const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${dur}s. Re-run safely — all inserts use ON CONFLICT DO NOTHING.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
