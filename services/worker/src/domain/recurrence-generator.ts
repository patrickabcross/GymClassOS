/**
 * Recurrence generator — DST-correct occurrence generation in Europe/London.
 *
 * Pure function — no DB calls, no I/O. Accepts a rule and a window end date,
 * returns an array of { startsAtUtc, ruleId } for each occurrence that falls
 * within the window and has not yet been generated.
 *
 * DST correctness guarantee:
 *   "18:00" London → "2026-07-06T17:00:00.000Z" in July (BST = UTC+1)
 *   "18:00" London → "2026-01-05T18:00:00.000Z" in January (GMT = UTC+0)
 *
 * Implementation uses Node.js built-in Intl — zero extra dependencies.
 *
 * Part of Phase 2 (MPV) recurring classes engine.
 */

export type ScheduleRule = {
  id: string;
  definitionId: string;
  daysOfWeek: string; // JSON array string, e.g. "[1,3]" for Mon/Wed
  timeOfDay: string; // "HH:MM" in Europe/London studio-local time
  startsOn: string; // "YYYY-MM-DD"
  endsOn: string | null;
  generatedThrough: string | null;
  active: number | boolean;
  capacity: number;
  location: string | null;
  trainerId: string | null;
};

export type GeneratedOccurrence = {
  /** ISO 8601 UTC string, e.g. "2026-07-06T17:00:00.000Z" */
  startsAtUtc: string;
  /** The rule this occurrence belongs to */
  ruleId: string;
};

// ---------------------------------------------------------------------------
// DST-correct UTC conversion using Node.js Intl (no external deps)
// ---------------------------------------------------------------------------

/**
 * Returns the UTC offset in minutes for Europe/London on the given Date.
 * During BST (summer): +60 (UTC+1).
 * During GMT (winter): 0 (UTC+0).
 *
 * Uses Intl.DateTimeFormat with timeZoneName:'shortOffset' to extract the
 * offset string, e.g. "GMT+1" or "GMT".
 */
function getLondonUtcOffsetMinutes(date: Date): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    timeZoneName: "shortOffset",
  });
  const parts = fmt.formatToParts(date);
  const tzPart =
    parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  // Examples: "GMT+1", "GMT", "GMT-1"
  const match = tzPart.match(/GMT([+-]\d+(?::\d+)?)?/);
  if (!match) return 0;
  const raw = match[1]; // e.g. "+1", "-1", undefined (for plain "GMT")
  if (!raw) return 0;
  // Handle "H" and "H:MM" formats
  const [hourStr, minStr] = raw.split(":");
  const hours = parseInt(hourStr, 10);
  const minutes = minStr ? parseInt(minStr, 10) : 0;
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

/**
 * Convert a date + wall-clock time in Europe/London to a UTC ISO string.
 *
 * @param dateStr  "YYYY-MM-DD" — the calendar date in London
 * @param timeStr  "HH:MM" — the wall-clock time in London
 * @returns ISO UTC string
 */
function londonWallClockToUtc(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);

  // We need the UTC offset for this specific local time in London.
  // Approach: construct a UTC date at the "naive" local ms, then look up
  // the offset at that point, and correct. This is accurate for all practical
  // studio times (not a DST gap or fold — gym classes don't start at 01:xx
  // during the 1-hour clock change).
  //
  // Step 1: build a UTC timestamp treating the local time as if it were UTC.
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Step 2: get the London offset at the naive UTC time (close enough —
  // the actual local time is ±1h from naive, but the London offset is stable
  // across the whole day except during the 1h DST transition at 01:xx local).
  const offsetMinutes = getLondonUtcOffsetMinutes(new Date(naiveUtc));

  // Step 3: subtract offset to get true UTC.
  const trueUtcMs = naiveUtc - offsetMinutes * 60_000;

  return new Date(trueUtcMs).toISOString();
}

// ---------------------------------------------------------------------------
// Date iteration helpers
// ---------------------------------------------------------------------------

/** Parse "YYYY-MM-DD" → { year, month (1-based), day } */
function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

/**
 * Advance a "YYYY-MM-DD" string by exactly 1 calendar day.
 * Uses UTC midnight arithmetic to avoid DST issues in the iteration itself.
 */
function addOneDay(dateStr: string): string {
  const { year, month, day } = parseDate(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Compare two "YYYY-MM-DD" strings lexicographically.
 * Returns -1 | 0 | 1.
 */
function compareDates(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Returns the weekday (0=Sun … 6=Sat) for a "YYYY-MM-DD" date string
 * using UTC midnight — avoids local-timezone day boundary issues.
 */
function getWeekday(dateStr: string): number {
  const { year, month, day } = parseDate(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate occurrence UTC instants for the given rule within the window
 * [fromDate, windowEndDate) where fromDate = max(starts_on, generated_through + 1d).
 *
 * - Only dates whose weekday is in daysOfWeek[] are included.
 * - ends_on is exclusive: dates >= ends_on are excluded.
 * - windowEndDate is exclusive: dates >= windowEndDate are excluded.
 * - Returns occurrences in ascending chronological order.
 */
export function generateOccurrences(
  rule: ScheduleRule,
  windowEndDate: string,
): GeneratedOccurrence[] {
  const daysOfWeek: number[] = JSON.parse(rule.daysOfWeek) as number[];

  // Effective start: day after generatedThrough (if set), or starts_on.
  let fromDate: string;
  if (rule.generatedThrough && compareDates(rule.generatedThrough, rule.startsOn) >= 0) {
    fromDate = addOneDay(rule.generatedThrough);
  } else {
    fromDate = rule.startsOn;
  }

  // Effective end: min(windowEndDate, ends_on if set)
  let effectiveEnd = windowEndDate;
  if (rule.endsOn && compareDates(rule.endsOn, effectiveEnd) < 0) {
    effectiveEnd = rule.endsOn;
  }

  const results: GeneratedOccurrence[] = [];
  let current = fromDate;

  while (compareDates(current, effectiveEnd) < 0) {
    const weekday = getWeekday(current);
    if (daysOfWeek.includes(weekday)) {
      const startsAtUtc = londonWallClockToUtc(current, rule.timeOfDay);
      results.push({ startsAtUtc, ruleId: rule.id });
    }
    current = addOneDay(current);
  }

  return results;
}
