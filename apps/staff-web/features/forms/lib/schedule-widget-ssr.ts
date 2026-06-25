/**
 * Schedule widget SSR HTML builder.
 *
 * Renders a standalone, self-contained HTML page showing the studio's
 * upcoming class schedule. Each class slot has an "Enquire" CTA that reveals
 * an inline name/email/phone form. On submit the form POSTs to
 * /api/submit/schedule-enquiry (the P1c-02 lead handler), creating a
 * status='lead' conversation in the gym inbox.
 *
 * URL-param theming:
 *   ?accent=#rrggbb  — accent colour (sanitised; falls back to #000000) // guard:allow-color — URL param example in JSDoc comment, never rendered
 *   ?radius=<0-32>   — border radius in px (sanitised; falls back to 6)
 *
 * postMessage events emitted to parent window:
 *   { type: "gymos:resize", height: <number> }   — on load + DOM changes
 *   { type: "enquiry:created", occurrenceId: <string>, responseId: <string> }  — on successful enquiry
 *
 * Dependencies: zero new runtime deps. Imports only from staff-web internals.
 *
 * guard:allow-unscoped — gym domain tables (class_occurrences, class_definitions,
 * trainers) are single-tenant; this is an anonymous public SSR route with no
 * owner-scoped data.
 *
 * SCH-FILTER (260625-d06): widened query to include location + trainerName via
 * left-join to trainers. Added three native <select> filter controls above the
 * schedule (SSR, no React), client-side AND filtering via inline JS, and a
 * "no classes match" empty state for the filtered-out case.
 */
import { getRequestURL, removeResponseHeader, type H3Event } from "h3";
import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "../../../server/db/index.js";
import { sanitizeHexColor, sanitizeIntPx } from "./public-form-ssr.js";
import { getTenantBrand } from "../../../server/lib/tenant-brand-resolver.js";

// ---------------------------------------------------------------------------
// Schedule query
// ---------------------------------------------------------------------------

type ClassRow = {
  occurrenceId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  room: string | null;
  className: string;
  category: string | null;
  durationMin: number;
  // SCH-FILTER additions
  location: string | null;
  trainerName: string | null;
};

async function getUpcomingClasses(): Promise<ClassRow[]> {
  const db = getDb();
  const now = new Date().toISOString();

  // guard:allow-unscoped — gym tables are single-tenant; anonymous public endpoint.
  // SCH-FILTER: left-joined trainers to get trainerName; added location to select.
  const rows = await db
    .select({
      occurrenceId: schema.classOccurrences.id,
      startsAt: schema.classOccurrences.startsAt,
      endsAt: schema.classOccurrences.endsAt,
      capacity: schema.classOccurrences.capacity,
      room: schema.classOccurrences.room,
      className: schema.classDefinitions.name,
      category: schema.classDefinitions.category,
      durationMin: schema.classDefinitions.durationMin,
      // SCH-FILTER additions
      location: schema.classOccurrences.location,
      trainerName: schema.trainers.name,
    })
    .from(schema.classOccurrences)
    .innerJoin(
      schema.classDefinitions,
      eq(schema.classOccurrences.definitionId, schema.classDefinitions.id),
    )
    .leftJoin(
      schema.trainers,
      eq(schema.classOccurrences.trainerId, schema.trainers.id),
    )
    .where(
      and(
        eq(schema.classOccurrences.status, "scheduled"),
        gte(schema.classOccurrences.startsAt, now),
      ),
    )
    .orderBy(schema.classOccurrences.startsAt)
    .limit(50);

  return rows as ClassRow[];
}

// ---------------------------------------------------------------------------
// HTML escaping (prevents XSS from class names etc.)
// ---------------------------------------------------------------------------

function escapeHtml(value: unknown): string {
  const s =
    typeof value === "string" ? value : value == null ? "" : String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Date formatting helpers (UTC-safe; no timezone dependency for SSR)
// Note: startsAt is ISO with timezone offset stored as text.
// For the public widget we parse and format in the browser's local time via
// inline JS to avoid a date-fns-tz server dep. The initial HTML shows ISO
// times; the client replaces them after hydration.
// ---------------------------------------------------------------------------

/**
 * Parse an ISO datetime string into a Date. If it has an explicit offset we
 * respect it; otherwise treat as UTC.
 */
function parseIso(iso: string): Date {
  return new Date(iso);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dateKey(d: Date): string {
  // Group by YYYY-MM-DD UTC (consistent server-side bucketing)
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Class card rendering
// ---------------------------------------------------------------------------

function renderClassCard(cls: ClassRow): string {
  const d = parseIso(cls.startsAt);
  const timeStr = formatTime(d);
  const durationLabel = `${cls.durationMin} min`;
  const occId = escapeHtml(cls.occurrenceId);

  // SCH-FILTER: data-* attributes for client-side show/hide filtering.
  // Use empty string for null values so JS can match on "".
  const dataLocation = escapeHtml(cls.location ?? "");
  const dataClassName = escapeHtml(cls.className);
  const dataTrainer = escapeHtml(cls.trainerName ?? "");

  return `
<div class="class-card" id="card-${occId}" data-location="${dataLocation}" data-classname="${dataClassName}" data-trainer="${dataTrainer}">
  <div class="class-info">
    <div class="class-time">${escapeHtml(timeStr)}</div>
    <div class="class-details">
      <span class="class-name">${escapeHtml(cls.className)}</span>
      ${cls.category ? `<span class="class-cat">${escapeHtml(cls.category)}</span>` : ""}
      <span class="class-dur">${escapeHtml(durationLabel)}</span>
      ${cls.room ? `<span class="class-room">${escapeHtml(cls.room)}</span>` : ""}
      ${cls.location ? `<span class="class-loc">${escapeHtml(cls.location)}</span>` : ""}
      ${cls.trainerName ? `<span class="class-trainer">${escapeHtml(cls.trainerName)}</span>` : ""}
    </div>
  </div>
  <button
    type="button"
    class="enquire-btn"
    onclick="toggleEnquiry(${JSON.stringify(occId)}, ${JSON.stringify(escapeHtml(cls.className))}, ${JSON.stringify(escapeHtml(timeStr))})"
    aria-expanded="false"
    aria-controls="enquiry-${occId}"
  >Enquire</button>
  <div class="enquiry-form" id="enquiry-${occId}" style="display:none" role="region" aria-label="Enquiry form for ${escapeHtml(cls.className)}">
    <p class="enquiry-intro">Interested in <strong>${escapeHtml(cls.className)}</strong> at ${escapeHtml(timeStr)}? Leave your details and we'll be in touch.</p>
    <form class="enq-form" onsubmit="submitEnquiry(event, ${JSON.stringify(occId)})">
      <input type="text" name="name" class="fi" placeholder="Your name" required aria-label="Your name">
      <input type="email" name="email" class="fi" placeholder="Email" required aria-label="Email">
      <input type="text" name="phone" class="fi" placeholder="Phone (optional)" aria-label="Phone">
      <div class="enq-actions">
        <button type="submit" class="submit-btn enq-submit">Send Enquiry</button>
        <button type="button" class="cancel-btn" onclick="cancelEnquiry(${JSON.stringify(occId)})">Cancel</button>
      </div>
    </form>
    <div class="enq-success" id="success-${occId}" style="display:none">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Thanks! We'll be in touch shortly.
    </div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Day group rendering
// ---------------------------------------------------------------------------

function groupByDay(classes: ClassRow[]): Map<string, ClassRow[]> {
  const groups = new Map<string, ClassRow[]>();
  for (const cls of classes) {
    const key = dateKey(parseIso(cls.startsAt));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(cls);
  }
  return groups;
}

function renderSchedule(classes: ClassRow[]): string {
  if (classes.length === 0) {
    return `<div class="empty-state">
      <p>No upcoming classes at this time.</p>
    </div>`;
  }

  const groups = groupByDay(classes);
  const sections: string[] = [];

  for (const [, dayClasses] of groups) {
    const d = parseIso(dayClasses[0]!.startsAt);
    const dayLabel = formatDate(d);
    const cards = dayClasses.map(renderClassCard).join("\n");
    sections.push(`
<div class="day-group">
  <h2 class="day-header">${escapeHtml(dayLabel)}</h2>
  <div class="class-list">${cards}</div>
</div>`);
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// SCH-FILTER: derive server-side option lists for the filter selects
// ---------------------------------------------------------------------------

function deriveFilterOptions(classes: ClassRow[]): {
  locations: string[];
  classNames: string[];
  trainerNames: string[];
} {
  const locations = Array.from(
    new Set(classes.map((c) => c.location).filter((l): l is string => !!l)),
  ).sort();
  const classNames = Array.from(
    new Set(classes.map((c) => c.className)),
  ).sort();
  const trainerNames = Array.from(
    new Set(classes.map((c) => c.trainerName).filter((t): t is string => !!t)),
  ).sort();
  return { locations, classNames, trainerNames };
}

function renderFilterBar(classes: ClassRow[]): string {
  if (classes.length === 0) return "";
  const { locations, classNames, trainerNames } = deriveFilterOptions(classes);

  const locationOptions = locations
    .map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`)
    .join("");
  const classNameOptions = classNames
    .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`)
    .join("");
  const trainerOptions = trainerNames
    .map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
    .join("");

  return `
<div class="filter-bar" role="search" aria-label="Filter classes">
  <select id="filter-location" class="filter-select" aria-label="Filter by location" onchange="applyFilters()">
    <option value="">All locations</option>
    ${locationOptions}
  </select>
  <select id="filter-classname" class="filter-select" aria-label="Filter by class type" onchange="applyFilters()">
    <option value="">All class types</option>
    ${classNameOptions}
  </select>
  <select id="filter-trainer" class="filter-select" aria-label="Filter by trainer" onchange="applyFilters()">
    <option value="">All trainers</option>
    ${trainerOptions}
  </select>
</div>
<div class="filter-empty" id="filter-empty" style="display:none">
  <p>No classes match your filters.</p>
</div>`;
}

// ---------------------------------------------------------------------------
// Full page HTML
// ---------------------------------------------------------------------------

function renderPage(
  classes: ClassRow[],
  accent: string,
  radius: number,
  brand: import("../../../server/lib/tenant-brand.js").TenantBrand,
): string {
  const filterBarHtml = renderFilterBar(classes);
  const scheduleHtml = renderSchedule(classes);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Class Schedule</title>
<meta name="description" content="Browse upcoming classes and enquire to book your spot.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${brand.googleFontsHref}" rel="stylesheet">
<style>
  :root {
    --gym-accent: ${accent};
    --studio-accent: ${accent};
    --gym-radius: ${radius}px;
  }
  ${CSS(brand)}
</style>
</head>
<body>
<div class="page">
  <div class="container">
    ${filterBarHtml}
    ${scheduleHtml}
  </div>
</div>

<div id="toast" class="toast" style="display:none"></div>

<script>
(function(){
  var ENQUIRY_FORM_ID = "schedule-enquiry";
  var PAGE_LOAD_T = Date.now();

  // Resize postMessage — tells embed.js parent the iframe height
  function sendResize() {
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: "gymos:resize", height: document.body.scrollHeight }, "*");
      } catch (_) {}
    }
  }

  // Fire on load
  window.addEventListener("load", sendResize);
  sendResize();

  // Observe DOM mutations (enquiry form toggles change height)
  if (typeof MutationObserver !== "undefined") {
    var obs = new MutationObserver(sendResize);
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
  }

  // Toast
  var toastEl = document.getElementById("toast");
  var toastTimer;
  function showToast(msg, type) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = "toast toast-" + (type || "error");
    toastEl.style.display = "block";
    toastTimer = setTimeout(function() { toastEl.style.display = "none"; }, 4000);
  }

  // ─── SCH-FILTER: client-side AND filtering ────────────────────────────
  //
  // Reads the three <select> values and shows/hides each .class-card based on
  // data-location / data-classname / data-trainer. Empty filter value = match-all.
  // After hiding cards, also hides any .day-group with zero visible cards.
  // Shows the #filter-empty message only when ALL cards are hidden.
  // Calls sendResize() so the parent iframe re-fits its height.
  window.applyFilters = function() {
    var locationVal = (document.getElementById("filter-location") || {}).value || "";
    var classNameVal = (document.getElementById("filter-classname") || {}).value || "";
    var trainerVal = (document.getElementById("filter-trainer") || {}).value || "";

    var allCards = document.querySelectorAll(".class-card");
    var visibleCount = 0;

    allCards.forEach(function(card) {
      var loc = card.getAttribute("data-location") || "";
      var cn = card.getAttribute("data-classname") || "";
      var tr = card.getAttribute("data-trainer") || "";

      var show =
        (!locationVal || loc === locationVal) &&
        (!classNameVal || cn === classNameVal) &&
        (!trainerVal || tr === trainerVal);

      card.style.display = show ? "" : "none";
      if (show) visibleCount++;
    });

    // Hide day-group headings when they have no visible cards underneath
    document.querySelectorAll(".day-group").forEach(function(group) {
      var hasVisible = false;
      group.querySelectorAll(".class-card").forEach(function(c) {
        if (c.style.display !== "none") hasVisible = true;
      });
      group.style.display = hasVisible ? "" : "none";
    });

    // Toggle the filter-empty notice
    var emptyEl = document.getElementById("filter-empty");
    if (emptyEl) {
      emptyEl.style.display = visibleCount === 0 ? "block" : "none";
    }

    sendResize();
  };

  // Toggle enquiry form for a slot
  window.toggleEnquiry = function(occId, className, timeStr) {
    var form = document.getElementById("enquiry-" + occId);
    var btn = document.querySelector("#card-" + occId + " .enquire-btn");
    var successEl = document.getElementById("success-" + occId);
    if (!form) return;
    var isHidden = form.style.display === "none";
    // Close all other open forms first
    document.querySelectorAll(".enquiry-form").forEach(function(el) {
      el.style.display = "none";
    });
    document.querySelectorAll(".enquire-btn").forEach(function(el) {
      el.setAttribute("aria-expanded", "false");
    });
    if (isHidden) {
      form.style.display = "block";
      if (btn) btn.setAttribute("aria-expanded", "true");
      // Reset success state when re-opening
      if (successEl) successEl.style.display = "none";
      var enqForm = form.querySelector(".enq-form");
      if (enqForm) { enqForm.style.display = ""; enqForm.reset(); }
      // Focus first field
      var firstInput = form.querySelector("input");
      if (firstInput) setTimeout(function() { firstInput.focus(); }, 50);
    }
    sendResize();
  };

  window.cancelEnquiry = function(occId) {
    var form = document.getElementById("enquiry-" + occId);
    var btn = document.querySelector("#card-" + occId + " .enquire-btn");
    if (form) form.style.display = "none";
    if (btn) btn.setAttribute("aria-expanded", "false");
    sendResize();
  };

  // Submit enquiry to /api/submit/schedule-enquiry (P1c-02 lead handler)
  window.submitEnquiry = function(e, occId) {
    e.preventDefault();
    var form = e.target;
    var submitBtn = form.querySelector(".enq-submit");
    var name = (form.querySelector('[name="name"]') || {}).value || "";
    var email = (form.querySelector('[name="email"]') || {}).value || "";
    var phone = (form.querySelector('[name="phone"]') || {}).value || "";

    if (!name || !email) {
      showToast("Name and email are required");
      return;
    }

    if (submitBtn) { submitBtn.textContent = "Sending..."; submitBtn.disabled = true; }

    fetch("/api/submit/" + ENQUIRY_FORM_ID, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          name: name,
          email: email,
          phone: phone,
          // occurrenceId rides in data so coach sees which class the lead enquired about
          occurrenceId: occId,
        },
        _t: PAGE_LOAD_T,
      }),
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      if (!res.ok) { throw new Error(res.data.error || "Failed to submit"); }
      var responseId = (res.data || {}).id || "";
      // Hide the form, show success
      form.style.display = "none";
      var successEl = document.getElementById("success-" + occId);
      if (successEl) successEl.style.display = "flex";
      // Emit enquiry:created postMessage to parent (embed.js)
      if (window.parent !== window) {
        try {
          window.parent.postMessage({
            type: "enquiry:created",
            occurrenceId: occId,
            responseId: responseId,
          }, "*");
        } catch (_) {}
      }
      sendResize();
    })
    .catch(function(err) {
      showToast(err.message || "Failed to send enquiry");
      if (submitBtn) { submitBtn.textContent = "Send Enquiry"; submitBtn.disabled = false; }
    });
  };
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function CSS(brand: import("../../../server/lib/tenant-brand.js").TenantBrand) {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:0 0% 100%;--fg:220 10% 10%;
  --card:0 0% 98%;--card-fg:220 10% 10%;
  --muted:220 10% 95%;--muted-fg:220 5% 45%;
  --border:220 10% 88%;--input:220 10% 90%;
  --ring:220 10% 40%;
  --accent-color:var(--studio-accent,var(--gym-accent,#000)); /* guard:allow-color — CSS var fallback for embed accent; actual value injected via --studio-accent/--gym-accent URL param */
  --radius:var(--gym-radius,6px);
}
.dark{
  --bg:220 6% 4%;--fg:0 0% 90%;
  --card:220 5% 7%;--card-fg:0 0% 90%;
  --muted:220 4% 8%;--muted-fg:220 4% 55%;
  --border:220 4% 13%;--input:220 4% 13%;
  --ring:0 0% 60%;
}

html{font-family:${brand.fontFamily};font-feature-settings:"cv02","cv03","cv04","cv11"}
body{background:hsl(var(--bg));color:hsl(var(--fg));-webkit-font-smoothing:antialiased}

.page{padding:24px 16px 48px}
.container{max-width:720px;margin:0 auto}

/* SCH-FILTER: filter bar */
.filter-bar{
  display:flex;flex-wrap:wrap;gap:8px;
  margin-bottom:20px;
}
.filter-select{
  flex:1 1 140px;
  padding:7px 10px;font-size:0.8125rem;font-family:inherit;
  background:hsl(var(--card));
  border:1px solid hsl(var(--border));border-radius:var(--radius);
  color:hsl(var(--fg));outline:none;cursor:pointer;
  appearance:auto;
}
.filter-select:focus{border-color:var(--accent-color)}

/* SCH-FILTER: filter-empty notice (distinct from .empty-state) */
.filter-empty{
  text-align:center;padding:32px 16px;
  color:hsl(var(--muted-fg));font-size:0.9375rem;
}

.day-group{margin-bottom:32px}
.day-header{font-size:0.9375rem;font-weight:600;letter-spacing:-0.01em;margin-bottom:12px;color:hsl(var(--fg))}

.class-list{display:flex;flex-direction:column;gap:8px}

.class-card{
  background:hsl(var(--card));
  border:1px solid hsl(var(--border));
  border-radius:var(--radius);
  padding:14px 16px;
}

.class-info{display:flex;align-items:flex-start;gap:16px;margin-bottom:10px}
.class-time{font-size:1rem;font-weight:600;color:hsl(var(--fg));min-width:52px;flex-shrink:0}
.class-details{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.class-name{font-size:0.9375rem;font-weight:500;color:hsl(var(--card-fg))}
.class-cat,.class-dur,.class-room{
  font-size:0.75rem;color:hsl(var(--muted-fg));
  background:hsl(var(--muted));border-radius:4px;padding:1px 7px;
}
/* SCH-FILTER: location + trainer chips (same style as other chips) */
.class-loc,.class-trainer{
  font-size:0.75rem;color:hsl(var(--muted-fg));
  background:hsl(var(--muted));border-radius:4px;padding:1px 7px;
}

.enquire-btn{
  display:inline-flex;align-items:center;
  padding:7px 18px;font-size:0.8125rem;font-weight:500;font-family:inherit;
  background:var(--accent-color);color:${brand.primaryText}; /* guard:allow-color — embed widget dark text on tenant primary CTA; no CSS var available in injected iframe context */
  border:none;border-radius:var(--radius);cursor:pointer;
  transition:opacity 0.15s;
}
.enquire-btn:hover{opacity:0.85}
.enquire-btn[aria-expanded="true"]{opacity:0.7}

.enquiry-form{
  margin-top:12px;
  padding:16px;
  background:hsl(var(--muted));
  border-radius:var(--radius);
  border:1px solid hsl(var(--border));
}
.enquiry-intro{font-size:0.8125rem;color:hsl(var(--muted-fg));margin-bottom:12px;line-height:1.5}
.enquiry-intro strong{color:hsl(var(--fg))}

.enq-form{display:flex;flex-direction:column;gap:8px}
.fi{
  width:100%;padding:8px 12px;font-size:0.875rem;font-family:inherit;
  background:hsl(var(--bg));
  border:1px solid hsl(var(--input));border-radius:var(--radius);
  color:hsl(var(--fg));outline:none;
}
.fi:focus{border-color:var(--accent-color);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-color) 20%,transparent)}

.enq-actions{display:flex;gap:8px;margin-top:4px}
.submit-btn{
  padding:8px 20px;font-size:0.8125rem;font-weight:500;font-family:inherit;
  background:var(--accent-color);color:${brand.primaryText}; /* guard:allow-color — embed widget dark text on tenant primary CTA; no CSS var available in injected iframe context */
  border:none;border-radius:var(--radius);cursor:pointer;
}
.submit-btn:hover{opacity:0.85}
.submit-btn:disabled{opacity:0.6;cursor:not-allowed}
.cancel-btn{
  padding:8px 14px;font-size:0.8125rem;font-weight:500;font-family:inherit;
  background:transparent;color:hsl(var(--muted-fg));
  border:1px solid hsl(var(--border));border-radius:var(--radius);cursor:pointer;
}
.cancel-btn:hover{background:hsl(var(--muted))}

.enq-success{
  display:flex;align-items:center;gap:8px;
  font-size:0.875rem;font-weight:500;color:#10b981; /* guard:allow-color — embed widget functional success green; no studio token equivalent */
  padding:8px 0;
}

.empty-state{
  text-align:center;padding:48px 16px;
  color:hsl(var(--muted-fg));font-size:0.9375rem;
}

.toast{
  position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
  padding:10px 20px;border-radius:var(--radius);
  font-size:0.875rem;font-weight:500;z-index:100;
  background:#1f2937;color:#f9fafb; /* guard:allow-color — embed widget functional toast colors (dark bg / light text); no studio token equivalent */
  box-shadow:0 4px 12px rgba(0,0,0,0.3);
}
.toast-error{background:#991b1b} /* guard:allow-color — embed widget functional error toast red; no studio token equivalent */

@media(max-width:540px){
  .class-info{flex-direction:column;gap:6px}
  .class-time{min-width:unset}
  .filter-bar{flex-direction:column}
  .filter-select{flex:none;width:100%}
}
`;
}

// ---------------------------------------------------------------------------
// Main exported handler
// ---------------------------------------------------------------------------

export async function renderScheduleWidget(event: H3Event): Promise<Response> {
  const reqUrl = getRequestURL(event);

  // Resolve live tenant brand (30s cache; falls back to DEFAULT_TENANT_BRAND on error).
  const tenantBrand = await getTenantBrand();

  // Read + sanitize URL-param theming (RESEARCH Pitfall 5 — prevents CSS injection).
  // When the param is absent, fall back to tenant brand defaults rather than #000000
  // (sanitizeHexColor returns "#000000" sentinel for missing/invalid params —
  //  we only call it when the param is actually present).
  const accentParam = reqUrl.searchParams.get("accent");
  const accent = accentParam
    ? sanitizeHexColor(accentParam)
    : tenantBrand.primary;
  const radiusParam = reqUrl.searchParams.get("radius");
  const radius =
    radiusParam !== null ? sanitizeIntPx(radiusParam) : tenantBrand.radius;

  // Fetch upcoming classes from Neon (includes location + trainerName)
  const classes = await getUpcomingClasses();

  const html = renderPage(classes, accent, radius, tenantBrand);

  // Drop the framework middleware's X-Frame-Options: DENY so the widget iframes
  // cross-origin; CSP frame-ancestors * (set below) already permits it.
  removeResponseHeader(event, "X-Frame-Options");

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // frame-ancestors * allows any domain to embed this widget in an iframe
      "Content-Security-Policy": "frame-ancestors *",
      // Short cache: schedule changes frequently; ISR is handled at CDN level
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
    },
  });
}
