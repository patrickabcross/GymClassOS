/**
 * Mobile baseline capture — react-native-web fallback (R1 deviation).
 *
 * The locked plan (CONTEXT D-07) was real-device Expo Go captures, but the
 * App Store's Expo Go only runs the latest SDK (56) and this app is SDK 55;
 * an SDK 55 dev client does not exist yet (EAS build is queued master-branch
 * work). User-approved fallback (2026-06-12): render the Expo app via
 * react-native-web at iPhone viewport and capture in headless Chromium.
 *
 * API note: the live deploy's /api/m/* routes are demo-gated OFF in
 * production (NODE_ENV check → 401), so the app cannot fetch live data from
 * gym-class-os.vercel.app at all (true on a real phone too). This script
 * intercepts /api/m/* requests and fulfills them with fixture data matching
 * the exact loader response shapes (verified against
 * apps/staff-web/app/routes/api.m.*.tsx on 2026-06-12).
 *
 * Fidelity caveats (documented in INDEX.md):
 *   - react-native-web rendering, NOT real-device — fonts/safe-areas differ
 *   - data is fixture data, not live Neon rows
 *   - barcode scanner has no camera in headless Chromium (permission stub)
 *
 * Usage:
 *   1. Start the web server (separate terminal / background):
 *      cd packages/mobile-app
 *      npx expo start --offline --port 8082
 *   2. node scripts/ui-baseline/capture-mobile-web.mjs [--output-dir <dir>]
 */

import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import { join, resolve } from "path";

const BASE = "http://localhost:8082";
const VIEWPORT = { width: 390, height: 844 }; // iPhone-class viewport (matches D-02 mobile width)

const args = process.argv.slice(2);
const OUT = args.includes("--output-dir")
  ? resolve(process.cwd(), args[args.indexOf("--output-dir") + 1])
  : resolve(process.cwd(), ".planning/ui-reviews/baseline/mobile");

// ---------------------------------------------------------------------------
// Fixtures — shapes mirror the api.m.* loaders exactly
// ---------------------------------------------------------------------------

const hoursFromNow = (h) =>
  new Date(Date.now() + h * 3600_000).toISOString();
const todayDate = new Date().toISOString().slice(0, 10);

const MEMBERS = {
  members: [
    { id: "fx-m1", firstName: "Amelia", lastName: "Clarke" },
    { id: "fx-m2", firstName: "Ben", lastName: "Osborn" },
    { id: "fx-m3", firstName: "Chloe", lastName: "Davies" },
    { id: "fx-m4", firstName: "Dan", lastName: "Whitfield" },
    { id: "fx-m5", firstName: "Erin", lastName: "Moore" },
  ],
};

const PROFILE = {
  member: {
    id: "fx-m1",
    firstName: "Amelia",
    lastName: "Clarke",
    email: "amelia@example.com",
    phoneE164: "+447700900123",
    goal: "Build strength",
  },
  passBalance: 7,
  upcomingBooking: {
    bookingId: "fx-b1",
    occurrenceId: "fx-o1",
    startsAt: hoursFromNow(17),
    className: "Strength & Conditioning",
  },
  today: {
    kcal: 1240,
    proteinG: 82,
    carbsG: 130,
    fatG: 41,
    targetKcal: 2100,
    targetProteinG: 130,
    targetCarbsG: 250,
    targetFatG: 60,
  },
};

const classFix = (id, startH, name, category, capacity, booked, mine = false, room = "Main Floor") => ({
  id,
  startsAt: hoursFromNow(startH),
  endsAt: hoursFromNow(startH + 1),
  capacity,
  status: "scheduled",
  room,
  className: name,
  category,
  durationMin: 60,
  bookedCount: booked,
  isBookedByMe: mine,
  full: booked >= capacity,
});

const SCHEDULE = {
  items: [
    classFix("fx-o1", 17, "Strength & Conditioning", "strength", 12, 9, true),
    classFix("fx-o2", 19, "Boxfit", "cardio", 14, 14),
    classFix("fx-o3", 26, "Mobility & Core", "mobility", 10, 4),
    classFix("fx-o4", 28, "Hyrox Conditioning", "cardio", 12, 11),
    classFix("fx-o5", 41, "Strength & Conditioning", "strength", 12, 6),
    classFix("fx-o6", 44, "Open Gym", "open", 20, 3),
    classFix("fx-o7", 50, "Boxfit", "cardio", 14, 8),
    classFix("fx-o8", 65, "Mobility & Core", "mobility", 10, 2),
  ],
};

const foodFix = (id, hour, mealType, name, brand, qty, kcal, p, c, f, source = "off_search") => ({
  id,
  loggedAt: `${todayDate}T${String(hour).padStart(2, "0")}:30:00.000Z`,
  mealType,
  quantityG: qty,
  kcal,
  proteinG: p,
  carbsG: c,
  fatG: f,
  source,
  foodName: name,
  foodBrand: brand,
});

const FOOD_ENTRIES = {
  entries: [
    foodFix("fx-f1", 7, "breakfast", "Porridge Oats", "Quaker", 60, 230, 8, 39, 5),
    foodFix("fx-f2", 12, "lunch", "Chicken Caesar Wrap", "Pret", 240, 560, 32, 48, 24),
    foodFix("fx-f3", 15, "snack", "Banana", null, 118, 105, 1, 27, 0),
  ],
  date: todayDate,
};

// ---------------------------------------------------------------------------
// Capture flow
// ---------------------------------------------------------------------------

async function shot(page, name, settleMs = 2500) {
  await page.waitForTimeout(settleMs);
  await page.screenshot({ path: join(OUT, name) }); // viewport-sized — phone frame
  console.log("  [OK]", name);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await context.grantPermissions(["camera"], { origin: BASE });

// Intercept /api/m/* — live deploy 401s these in production (demo gate)
const FIXTURES = [
  ["/api/m/members/list", MEMBERS],
  ["/api/m/profile", PROFILE],
  ["/api/m/schedule", SCHEDULE],
  ["/api/m/food-entries", FOOD_ENTRIES],
];
await context.route("**/api/m/**", async (route) => {
  const url = route.request().url();
  const match = FIXTURES.find(([path]) => url.includes(path));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(match ? match[1] : {}),
  });
});

const page = await context.newPage();

// 1. Member picker — fresh storage means AuthGate lands here.
console.log("Loading app (bundle compile can take 1-3 min on first hit)...");
await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 240_000 });
await page.waitForSelector("text=Who are you?", { timeout: 240_000 });
await shot(page, "pick-member.png");

// 2. Pick the first member → tabs home
await page.locator("text=Amelia").first().click();
await page.waitForTimeout(3500);
await shot(page, "tab-home.png");

// 3-5. Remaining tabs (member persists in localStorage)
const tabs = [
  ["/schedule", "tab-schedule.png"],
  ["/food", "tab-food.png"],
  ["/profile", "tab-profile.png"],
];
for (const [path, name] of tabs) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120_000 });
  await shot(page, name);
}

// 6-7. Modal screens
await page.goto(`${BASE}/food-add`, { waitUntil: "load", timeout: 120_000 });
await shot(page, "food-add.png");
await page.goto(`${BASE}/food-barcode`, { waitUntil: "load", timeout: 120_000 });
await shot(page, "food-barcode.png", 4000); // camera permission stub needs a beat

// 8. Agent sheet — FAB is a 56px circle fixed at right:18 / bottom:92
await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 120_000 });
await page.waitForTimeout(3500);
await page.mouse.click(VIEWPORT.width - 18 - 28, VIEWPORT.height - 92 - 28);
await shot(page, "agent-sheet.png", 3000);

await browser.close();
console.log(`Done — 8 captures in ${OUT}`);
