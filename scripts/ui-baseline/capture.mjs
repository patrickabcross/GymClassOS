/**
 * UI-baseline capture script — GymClassOS
 *
 * Captures full-page screenshots of every in-scope staff-web route and embed
 * widget against the live Vercel deploy at https://gym-class-os.vercel.app.
 *
 * Usage:
 *   node scripts/ui-baseline/capture.mjs --save-auth
 *     Launches a headed Chromium browser so you can log in via Google OAuth.
 *     Saves the session to scripts/ui-baseline/storageState.json (gitignored).
 *     Re-run if >24h since last login (Google sessions expire).
 *
 *   node scripts/ui-baseline/capture.mjs
 *     Runs headless, loads storageState.json, captures all in-scope routes.
 *     Output dir default: .planning/ui-reviews/baseline
 *
 *   node scripts/ui-baseline/capture.mjs --output-dir .planning/ui-reviews/after-R2
 *     Same as above but writes screenshots to the given directory.
 *     Used by R2, R3, R4, R5 for after-state captures (D-15).
 *
 * Requires: playwright (globally installed via npx/node_modules), Node 24+
 * Do NOT run `npm install playwright` — it is already globally available.
 */

import { chromium } from "playwright";
import { mkdir, access } from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = "https://gym-class-os.vercel.app";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the gitignored OAuth session file — relative to repo root
const STORAGE_STATE_PATH = resolve(__dirname, "storageState.json");

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const SAVE_AUTH = args.includes("--save-auth");
const OUTPUT_DIR = args.includes("--output-dir")
  ? resolve(process.cwd(), args[args.indexOf("--output-dir") + 1])
  : resolve(process.cwd(), ".planning/ui-reviews/baseline");

// ---------------------------------------------------------------------------
// CAPTURES array — each entry defines one screenshot
// { slug, path, viewport, subdir, state? }
// ---------------------------------------------------------------------------

/**
 * Builds the CAPTURES array. Member-detail URL is resolved at runtime
 * (see captureAll) because the ID is not known statically.
 */
function buildCaptures(firstMemberId) {
  /** Helper: both viewports for a gymos route */
  const both = (slug, path) => [
    { slug, path, viewport: DESKTOP, subdir: "staff-web" },
    { slug, path, viewport: MOBILE, subdir: "staff-web" },
  ];

  /** Helper: desktop-only gymos route */
  const desk = (slug, path, state) => ({
    slug,
    path,
    viewport: DESKTOP,
    subdir: "staff-web",
    state,
  });

  return [
    // -------------------------------------------------------------------------
    // Desktop + Mobile pairs
    // -------------------------------------------------------------------------
    ...both("gymos-home", "/gymos"),
    ...both("gymos-inbox", "/gymos/inbox"),
    ...both("gymos-schedule", "/gymos/schedule"),
    ...both("gymos-members", "/gymos/members"),

    // -------------------------------------------------------------------------
    // Desktop-only gymos routes
    // -------------------------------------------------------------------------
    desk("gymos-inbox-leads", "/gymos/inbox?filter=leads"),
    desk(
      "gymos-members-id",
      firstMemberId ? `/gymos/members/${firstMemberId}` : "/gymos/members",
    ),
    desk("gymos-payments", "/gymos/payments"),
    desk("gymos-analytics", "/gymos/analytics"),
    desk("gymos-campaigns", "/gymos/campaigns"),
    desk("gymos-forms", "/gymos/forms"),
    desk("gymos-settings-integrations", "/gymos/settings/integrations"),

    // -------------------------------------------------------------------------
    // Legacy routes (still routable per D-05; excluded: /email)
    // -------------------------------------------------------------------------
    desk("draft-queue", "/draft-queue"),
    desk("settings", "/settings"),
    desk("team", "/team"),

    // -------------------------------------------------------------------------
    // Interaction states — D-06 (desktop only, resolved at capture time)
    // These use null paths because navigation is done inside captureInteractionStates()
    // -------------------------------------------------------------------------
    // Note: interaction states are captured separately via captureInteractionStates()
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the filename for a capture entry.
 * Convention (D-13): <route-slug>.<viewport>[.<state>].png
 */
function filename(slug, viewport, state) {
  const vp = viewport.width === DESKTOP.width ? "desktop" : "mobile";
  return `${slug}.${vp}${state ? "." + state : ""}.png`;
}

/**
 * Ensures the output subdirectory exists.
 */
async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

/**
 * Navigates to a gymos page, closes the agent sidebar (Escape), waits for
 * network idle + hydration, then captures a full-page screenshot.
 * Pitfall 2: AgentSidebar persists open/closed in localStorage.
 */
async function gotoAndCapture(page, url, outputPath, isGymosRoute = true) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  if (isGymosRoute) {
    // Close agent sidebar if open. Press Escape — tolerate if no sidebar present.
    try {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    } catch (_) {
      // Sidebar absent — continue
    }
  }

  await page.screenshot({ path: outputPath, fullPage: true });
}

// ---------------------------------------------------------------------------
// Mode A: --save-auth
// ---------------------------------------------------------------------------

async function saveAuth() {
  console.log(
    "Launching headed browser — log in via Google when the window opens.",
  );
  console.log(
    "The script waits up to 5 minutes for a session cookie (URL alone is not",
  );
  console.log(
    "proof of login — /gymos renders its auth gate client-side on a 200).",
  );

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Root URL 404s on the live deploy — go straight to /gymos (shows the sign-in gate).
  await page.goto(`${BASE}/gymos`);

  // Wait for an actual better-auth session cookie. waitForURL("**/gymos**") is NOT
  // sufficient: /gymos returns 200 unauthenticated and gates client-side, so a URL
  // wait resolves before login and saves an empty storageState.
  const deadline = Date.now() + 300_000;
  let authed = false;
  while (Date.now() < deadline) {
    const cookies = await context.cookies(BASE);
    if (cookies.some((c) => /session/i.test(c.name))) {
      authed = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!authed) {
    await browser.close();
    console.error(
      "Timed out: no session cookie appeared within 5 minutes — login not detected.\n" +
        "Re-run: node scripts/ui-baseline/capture.mjs --save-auth",
    );
    process.exit(1);
  }

  await context.storageState({ path: STORAGE_STATE_PATH });
  await browser.close();

  console.log(`Auth saved to ${STORAGE_STATE_PATH}`);
  console.log("This file is gitignored — do not commit it.");
}

// ---------------------------------------------------------------------------
// Mode B: capture
// ---------------------------------------------------------------------------

async function captureAll() {
  // Guard: storageState.json must exist
  try {
    await access(STORAGE_STATE_PATH);
  } catch {
    console.error(
      `storageState.json not found at ${STORAGE_STATE_PATH}.\n` +
        "Run: node scripts/ui-baseline/capture.mjs --save-auth",
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: STORAGE_STATE_PATH,
  });

  // Session-validity guard (Pitfall 1): /gymos returns 200 even unauthenticated
  // (client-side gate), so URL inspection is not enough — require a session
  // cookie in the loaded storageState before capturing anything.
  {
    const guardPage = await context.newPage();
    const cookies = await context.cookies(BASE);
    if (!cookies.some((c) => /session/i.test(c.name))) {
      await browser.close();
      console.error(
        "storageState has no session cookie — auth was never saved or has been cleared.\n" +
          "Re-run with --save-auth to refresh: node scripts/ui-baseline/capture.mjs --save-auth",
      );
      process.exit(1);
    }
    await guardPage.goto(`${BASE}/gymos`, { waitUntil: "networkidle" });
    const currentUrl = guardPage.url();
    if (
      currentUrl.includes("accounts.google.com") ||
      currentUrl.includes("sign_in") ||
      currentUrl.includes("access-denied")
    ) {
      await browser.close();
      console.error(
        "storageState expired — Google auth session is no longer valid.\n" +
          "Re-run with --save-auth to refresh: node scripts/ui-baseline/capture.mjs --save-auth",
      );
      process.exit(1);
    }

    // Resolve the first member ID from the members page
    let firstMemberId = null;
    try {
      await guardPage.goto(`${BASE}/gymos/members`, {
        waitUntil: "networkidle",
      });
      await guardPage.waitForTimeout(1500);
      const memberHref = await guardPage
        .locator('a[href*="/gymos/members/"]')
        .first()
        .getAttribute("href")
        .catch(() => null);
      if (memberHref) {
        const match = memberHref.match(/\/gymos\/members\/([^/?#]+)/);
        if (match) firstMemberId = match[1];
      }
    } catch (_) {
      console.warn(
        "Could not resolve first member ID — gymos-members-id will capture /gymos/members instead.",
      );
    }

    await guardPage.close();

    // -----------------------------------------------------------------------
    // Standard captures loop
    // -----------------------------------------------------------------------

    const captures = buildCaptures(firstMemberId);
    let written = 0;

    for (const entry of captures) {
      const { slug, path: routePath, viewport, subdir, state } = entry;
      if (!routePath) continue; // interaction states handled below

      const outDir = join(OUTPUT_DIR, subdir);
      await ensureDir(outDir);
      const outFile = join(outDir, filename(slug, viewport, state));

      const page = await context.newPage();
      await page.setViewportSize(viewport);

      try {
        await gotoAndCapture(
          page,
          `${BASE}${routePath}`,
          outFile,
          routePath.startsWith("/gymos"),
        );
        console.log(`  [OK] ${filename(slug, viewport, state)}`);
        written++;
      } catch (err) {
        console.error(`  [ERR] ${slug}:`, err.message ?? err);
      } finally {
        await page.close();
      }
    }

    // -----------------------------------------------------------------------
    // Interaction states — D-06
    // -----------------------------------------------------------------------

    written += await captureInteractionStates(context);

    // -----------------------------------------------------------------------
    // Embed host pages
    // -----------------------------------------------------------------------

    written += await captureEmbeds(context);

    await browser.close();
    console.log(`\nDone. ${written} screenshots written to ${OUTPUT_DIR}`);
  }
}

// ---------------------------------------------------------------------------
// Interaction state captures (D-06)
// ---------------------------------------------------------------------------

async function captureInteractionStates(context) {
  const outDir = join(OUTPUT_DIR, "staff-web");
  await ensureDir(outDir);
  let written = 0;

  // ----- 1. context-panel: first conversation open, sidebar closed -----
  try {
    const page = await context.newPage();
    await page.setViewportSize(DESKTOP);
    await page.goto(`${BASE}/gymos/inbox`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Resolve the first conversation ID from a href containing "conversation="
    let conversationId = null;
    try {
      const href = await page
        .locator('[href*="conversation="]')
        .first()
        .getAttribute("href")
        .catch(() => null);
      if (href) {
        const match = href.match(/conversation=([^&]+)/);
        if (match) conversationId = match[1];
      }
    } catch (_) {
      /* no conversation links found */
    }

    if (conversationId) {
      await page.goto(`${BASE}/gymos/inbox?conversation=${conversationId}`, {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(2000);
    }

    // Close agent sidebar (Pitfall 2) to reveal member-context right-rail
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const outFile = join(outDir, "gymos-inbox.desktop.context-panel.png");
    await page.screenshot({ path: outFile, fullPage: true });
    console.log("  [OK] gymos-inbox.desktop.context-panel.png");
    written++;
    await page.close();
  } catch (err) {
    console.error("  [ERR] context-panel:", err.message ?? err);
  }

  // ----- 2. templates-dialog -----
  try {
    const page = await context.newPage();
    await page.setViewportSize(DESKTOP);
    await page.goto(`${BASE}/gymos/inbox`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // Close sidebar before interacting with toolbar buttons
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: /template/i }).click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await page.waitForTimeout(500);

    const outFile = join(outDir, "gymos-inbox.desktop.templates-dialog.png");
    await page.screenshot({ path: outFile, fullPage: true });
    console.log("  [OK] gymos-inbox.desktop.templates-dialog.png");
    written++;
    await page.close();
  } catch (err) {
    console.error("  [ERR] templates-dialog:", err.message ?? err);
  }

  // ----- 3. booking-dialog: open a class booking dialog on /gymos/schedule -----
  try {
    const page = await context.newPage();
    await page.setViewportSize(DESKTOP);
    await page.goto(`${BASE}/gymos/schedule`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Click the first class card / book control
    const firstClassCard = page
      .locator(
        '[data-class-id], [data-occurrence-id], .class-card, .occurrence-card, [role="button"]',
      )
      .first();
    await firstClassCard.click({ timeout: 8_000 }).catch(() => {
      // Fallback: find any clickable element that looks like a class listing
      return page
        .locator("button")
        .filter({ hasText: /book|class|view/i })
        .first()
        .click({ timeout: 5_000 });
    });

    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    await page.waitForTimeout(500);

    const outFile = join(outDir, "gymos-schedule.desktop.booking-dialog.png");
    await page.screenshot({ path: outFile, fullPage: true });
    console.log("  [OK] gymos-schedule.desktop.booking-dialog.png");
    written++;
    await page.close();
  } catch (err) {
    console.error("  [ERR] booking-dialog:", err.message ?? err);
  }

  // ----- 4. selected-row: inbox conversation row in selected state (R-12 before-state) -----
  try {
    const page = await context.newPage();
    await page.setViewportSize(DESKTOP);
    await page.goto(`${BASE}/gymos/inbox`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Hover / click the first conversation row to trigger .email-list-row.selected
    const firstRow = page
      .locator(
        '[href*="conversation="], .email-list-row, [data-conversation-id]',
      )
      .first();
    await firstRow.hover({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(300);

    const outFile = join(outDir, "gymos-inbox.desktop.selected-row.png");
    await page.screenshot({ path: outFile, fullPage: true });
    console.log("  [OK] gymos-inbox.desktop.selected-row.png");
    written++;
    await page.close();
  } catch (err) {
    console.error("  [ERR] selected-row:", err.message ?? err);
  }

  return written;
}

// ---------------------------------------------------------------------------
// Embed host page captures
// ---------------------------------------------------------------------------

async function captureEmbeds(context) {
  const outDir = join(OUTPUT_DIR, "embeds");
  await ensureDir(outDir);
  let written = 0;

  const embedDir = resolve(__dirname);

  const embedCaptures = [
    { file: "embed-light.html", slug: "embed-host.light", viewport: DESKTOP },
    { file: "embed-dark.html", slug: "embed-host.dark", viewport: DESKTOP },
    { file: "embed-light.html", slug: "embed-host.light", viewport: MOBILE },
  ];

  for (const { file, slug, viewport } of embedCaptures) {
    const htmlPath = join(embedDir, file);
    const fileUrl = `file://${htmlPath.replace(/\\/g, "/")}`;
    const vp = viewport.width === DESKTOP.width ? "desktop" : "mobile";
    const outFile = join(outDir, `${slug}.${vp}.png`);

    try {
      const page = await context.newPage();
      await page.setViewportSize(viewport);
      // Load local HTML file — embed.js points at the live Vercel URL
      await page.goto(fileUrl, { waitUntil: "load" });
      // Wait extra time for the injected iframes to fetch the live widgets
      await page.waitForTimeout(2500);
      await page.screenshot({ path: outFile, fullPage: true });
      console.log(`  [OK] ${slug}.${vp}.png`);
      written++;
      await page.close();
    } catch (err) {
      console.error(`  [ERR] ${slug}.${vp}:`, err.message ?? err);
    }
  }

  return written;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (SAVE_AUTH) {
  await saveAuth();
} else {
  console.log(`Capture run — output dir: ${OUTPUT_DIR}`);
  await captureAll();
}
