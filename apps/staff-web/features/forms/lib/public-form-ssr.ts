import { getMethod, getRequestURL, type H3Event } from "h3";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../../server/db/index.js";
import type { FormField, FormSettings } from "../types.js";
import { getTenantBrand } from "../../../server/lib/tenant-brand-resolver.js";
import type { TenantBrand } from "../../../server/lib/tenant-brand.js";

// In-memory cache
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 60_000;

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < TTL) return entry.data;
  return null;
}

async function getFormBySlugOrId(slugOrId: string) {
  const cached = getCached(slugOrId);
  if (cached) return cached;

  const db = getDb();

  // guard:allow-unscoped — gym domain tables are single-tenant; public form SSR lookup by slug/id.
  // Try matching by slug first, then fall back to ID
  let row = await db
    .select()
    .from(schema.forms)
    .where(eq(schema.forms.slug, slugOrId))
    .then(
      (rows: unknown[]) =>
        rows[0] as typeof schema.forms.$inferSelect | undefined,
    );

  if (!row) {
    row = await db
      .select()
      .from(schema.forms)
      .where(eq(schema.forms.id, slugOrId))
      .then(
        (rows: unknown[]) =>
          rows[0] as typeof schema.forms.$inferSelect | undefined,
      );
  }

  if (!row || row.status !== "published" || row.deletedAt) return null;

  const result = {
    id: row.id,
    title: row.title,
    description: row.description,
    fields: JSON.parse(row.fields) as FormField[],
    settings: JSON.parse(row.settings) as FormSettings,
  };

  cache.set(slugOrId, { data: result, ts: Date.now() });
  return result as typeof result;
}

// ---------------------------------------------------------------------------
// URL-param theming sanitizers (also exported for P1c-05 schedule widget)
// ---------------------------------------------------------------------------

/**
 * Validates a hex colour string — must be exactly `#RRGGBB` format.
 * Falls back to `#000000` to prevent CSS injection via URL params. // guard:allow-color — hex in JSDoc comment (fallback value description); not rendered
 */
export function sanitizeHexColor(value: string | null): string {
  const v = (value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000"; // guard:allow-color — validation regex + CSS injection fallback; not a rendered color value
}

/**
 * Parses an integer from a URL param, clamped to [min, max].
 * Falls back to 6 to prevent CSS injection via URL params.
 */
export function sanitizeIntPx(value: string | null, min = 0, max = 32): number {
  const n = parseInt(value ?? "", 10);
  return isNaN(n) ? 6 : Math.min(max, Math.max(min, n));
}

// ---------------------------------------------------------------------------
// Field rendering helpers
// ---------------------------------------------------------------------------

// Canonical type is string, but the agent occasionally writes objects like
// `{ label, value }` or numbers. Coerce everything to a string here so the
// renderer never crashes on bad data.
function toSafeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const v = value as { label?: unknown; value?: unknown };
    if (typeof v.label === "string") return v.label;
    if (typeof v.value === "string") return v.value;
    return "";
  }
  return String(value);
}

function escapeHtml(value: unknown): string {
  return toSafeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Mirror app/components/builder/FieldRenderer.tsx#dedupeRenderableOptions.
function normalizeOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of options) {
    const trimmed = toSafeString(raw).trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Validate a form-author-supplied post-submit redirect URL. Returns the
 * value verbatim only if it parses as `http:` or `https:` — falls back to
 * an empty string otherwise (caller treats empty as "no redirect").
 *
 * Form publishers control `settings.redirectUrl` and the rendered page
 * assigns it to `window.location.href`. Without scheme validation a
 * `javascript:fetch(...)` redirectUrl would execute attacker JS in the
 * form-publisher origin against any anonymous submitter.
 */
export function safeRedirectUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  // Reject control characters and protocol-relative URLs outright.
  if (/[\x00-\x1f]/.test(trimmed)) return "";
  if (trimmed.startsWith("//")) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? trimmed
      : "";
  } catch {
    return "";
  }
}

function renderField(field: FormField): string {
  const id = escapeHtml(field.id);
  const req = field.required ? " required" : "";
  const ph = field.placeholder
    ? ` placeholder="${escapeHtml(field.placeholder)}"`
    : "";
  const desc = field.description
    ? `<p class="field-desc">${escapeHtml(field.description)}</p>`
    : "";
  const cond = field.conditional
    ? ` data-cond-field="${escapeHtml(field.conditional.fieldId)}" data-cond-op="${escapeHtml(field.conditional.operator)}" data-cond-val="${escapeHtml(field.conditional.value)}"`
    : "";
  const widthClass = field.width === "half" ? " field-half" : "";

  let input = "";

  switch (field.type) {
    case "text":
      input = `<input type="text" name="${id}" class="fi"${ph}${req}>`;
      break;
    case "email":
      input = `<input type="email" name="${id}" class="fi"${ph || ' placeholder="you@example.com"'}${req}>`;
      break;
    case "number":
      input = `<input type="number" name="${id}" class="fi"${ph}${req}${field.validation?.min != null ? ` min="${Number(field.validation.min)}"` : ""}${field.validation?.max != null ? ` max="${Number(field.validation.max)}"` : ""}>`;
      break;
    case "textarea":
      input = `<textarea name="${id}" class="fi fi-ta" rows="4"${ph || ' placeholder="Type your answer..."'}${req}></textarea>`;
      break;
    case "date":
      input = `<input type="date" name="${id}" class="fi"${req}>`;
      break;
    case "select":
      input = `<select name="${id}" class="fi"${req}><option value="">${escapeHtml(field.placeholder) || "Select..."}</option>${normalizeOptions(
        field.options,
      )
        .map(
          (o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`,
        )
        .join("")}</select>`;
      break;
    case "multiselect":
      input = `<div class="ms-group">${normalizeOptions(field.options)
        .map(
          (o) =>
            `<label class="cb-label"><input type="checkbox" name="${id}" value="${escapeHtml(o)}" class="cb"><span>${escapeHtml(o)}</span></label>`,
        )
        .join("")}</div>`;
      break;
    case "checkbox":
      input = `<label class="cb-label"><input type="checkbox" name="${id}" class="cb"><span>${escapeHtml(field.placeholder || field.label)}</span></label>`;
      break;
    case "radio":
      input = `<div class="radio-group">${normalizeOptions(field.options)
        .map(
          (o) =>
            `<label class="cb-label"><input type="radio" name="${id}" value="${escapeHtml(o)}" class="radio"><span>${escapeHtml(o)}</span></label>`,
        )
        .join("")}</div>`;
      break;
    case "rating":
      input = `<div class="rating-group" data-name="${id}">${[1, 2, 3, 4, 5].map((s) => `<button type="button" class="star-btn" data-value="${s}" aria-label="${s} star${s > 1 ? "s" : ""}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>`).join("")}</div><input type="hidden" name="${id}">`;
      break;
    case "scale": {
      const min = Number(field.validation?.min ?? 1);
      const max = Number(field.validation?.max ?? 10);
      input = `<div class="scale-group"><input type="range" name="${id}" class="slider" min="${min}" max="${max}" value="${min}" step="1"><div class="scale-labels"><span>${min}</span><span class="scale-val">${min}</span><span>${max}</span></div></div>`;
      break;
    }
    default:
      input = `<input type="text" name="${id}" class="fi"${ph}${req}>`;
      break;
  }

  return `<div class="field${widthClass}" data-field-id="${id}"${cond}>
    <label class="field-label">${escapeHtml(field.label)}${field.required ? '<span class="req">*</span>' : ""}</label>
    ${desc}${input}</div>`;
}

// ---------------------------------------------------------------------------
// Pure render function — takes a URL, returns { html, status }
// ---------------------------------------------------------------------------

export async function renderPublicFormHtml(
  url: string,
): Promise<{ html: string; status: number }> {
  // Resolve live tenant brand (30s cache; falls back to DEFAULT_TENANT_BRAND on error).
  const tenantBrand = await getTenantBrand();

  const pathname = url.split("?")[0];
  const searchStr = url.includes("?") ? url.slice(url.indexOf("?")) : "";
  const slugOrId = decodeURIComponent(pathname.replace(/^\/(f|preview)\//, ""));
  const formData = slugOrId ? await getFormBySlugOrId(slugOrId) : null;

  if (!formData) {
    return { html: notFoundPage(tenantBrand), status: 404 };
  }

  // Read URL-param theming (sanitized against CSS injection — RESEARCH Pitfall 5).
  // When the param is absent, fall back to tenant brand defaults rather than #000000
  // (sanitizeHexColor returns "#000000" sentinel for missing/invalid params —
  //  we only call it when the param is actually present).
  const searchParams = new URLSearchParams(searchStr);
  const accentParam = searchParams.get("accent");
  const accent = accentParam
    ? sanitizeHexColor(accentParam)
    : tenantBrand.primary;
  const radiusParam = searchParams.get("radius");
  const radius =
    radiusParam !== null ? sanitizeIntPx(radiusParam) : tenantBrand.radius;

  // Resolve studio Meta Pixel ID server-side (single-tenant config).
  // guard:allow-unscoped — single-tenant meta config; studio_owner_config has one row.
  let pixelId: string | undefined;
  try {
    const db2 = getDb() as unknown as {
      execute: (q: unknown) => Promise<{ rows: unknown[] }>;
    };
    const { rows } = await db2.execute(
      sql`SELECT meta_pixel_id FROM studio_owner_config LIMIT 1`,
    );
    const row = rows[0] as { meta_pixel_id?: string | null } | undefined;
    const raw = row?.meta_pixel_id ?? "";
    // Sanitize to digits-only before threading into the inline script.
    const digits = String(raw).replace(/[^0-9]/g, "");
    if (digits) pixelId = digits;
  } catch {
    // Missing config or DB error → no Pixel; form still submits and server CAPI fires.
    pixelId = undefined;
  }

  return {
    html: renderFormPage(
      formData as {
        id: string;
        title: string;
        description?: string | null;
        fields: FormField[];
        settings: FormSettings;
      },
      accent,
      radius,
      tenantBrand,
      pixelId,
    ),
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// H3 handler wrapper — used in production (Nitro routes)
// ---------------------------------------------------------------------------

export async function renderPublicForm(event: H3Event) {
  const reqUrl = getRequestURL(event);
  const url = reqUrl.pathname + reqUrl.search;
  const { html, status } = await renderPublicFormHtml(url);

  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "frame-ancestors *",
  };
  if (status === 200) {
    headers["Cache-Control"] =
      "public, s-maxage=60, stale-while-revalidate=300";
  }
  return new Response(getMethod(event) === "HEAD" ? null : html, {
    status,
    headers,
  });
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function renderFormPage(
  form: {
    id: string;
    title: string;
    description?: string | null;
    fields: FormField[];
    settings: FormSettings;
  },
  accent: string,
  radius: number,
  brand: TenantBrand,
  pixelId?: string,
): string {
  const settings: FormSettings = form.settings || {};
  const fields: FormField[] = form.fields || [];
  const turnstileSiteKey = process.env.VITE_TURNSTILE_SITE_KEY || "";
  const submitPath = `/api/submit/`;

  // Pixel base code — only emitted when a pixelId is resolved (PIX-01).
  // pixelId is already digits-only (sanitized in renderPublicFormHtml).
  const pixelSnippet = pixelId
    ? `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
</script>`
    : "";

  const fieldsHtml = fields.map(renderField).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>${escapeHtml(form.title)}</title>
${form.description ? `<meta name="description" content="${escapeHtml(form.description)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${brand.googleFontsHref}" rel="stylesheet">
${pixelSnippet}
<style>
  :root {
    --gym-accent: ${accent};
    --studio-accent: ${accent};
    --gym-radius: ${radius}px;
  }
  ${CSS(brand)}
</style>
<script>
  try {
    var embedded = window.self !== window.top || new URLSearchParams(location.search).has("embed");
    if (embedded) document.documentElement.classList.add("embedded");
  } catch (e) { document.documentElement.classList.add("embedded"); }
</script>
</head>
<body>
<div class="page">
  <div class="container">
    <div class="form-toolbar">
      <button type="button" class="theme-toggle" id="themeToggle" aria-label="Toggle theme">
        <svg class="icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        <svg class="icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>
    <div class="header">
      <h1>${escapeHtml(form.title)}</h1>
      ${form.description ? `<p class="desc">${escapeHtml(form.description)}</p>` : ""}
    </div>

    <form id="mainForm" novalidate>
      <input type="text" id="_hp" name="website" tabindex="-1" aria-hidden="true" autocomplete="off" style="position:absolute;left:-9999px;opacity:0;pointer-events:none">
      <div class="fields-card">
        ${fieldsHtml || '<p class="empty">This form has no fields yet.</p>'}
      </div>
      ${turnstileSiteKey ? `<div id="turnstile" class="turnstile-wrap"></div>` : ""}
      <button type="submit" class="submit-btn" id="submitBtn">${escapeHtml(settings.submitText || "Send Enquiry")}</button>
    </form>
  </div>

  <div id="successView" class="success-view" style="display:none">
    <div class="success-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    </div>
    <h1>Response submitted</h1>
    <p class="desc">${escapeHtml(settings.successMessage || "Thanks for your enquiry! We'll be in touch soon.")}</p>
  </div>
</div>

<div id="toast" class="toast" style="display:none"></div>

<script>
(function(){
  var FORM_ID = ${JSON.stringify(form.id)};
  var REDIRECT = ${JSON.stringify(safeRedirectUrl(settings.redirectUrl))};
  var TURNSTILE_KEY = ${JSON.stringify(turnstileSiteKey)};
  var FIELDS = ${JSON.stringify(fields.map((f) => ({ id: f.id, type: f.type, required: f.required, validation: f.validation, label: f.label, conditional: f.conditional })))};

  // Theme toggle — default is light (no .dark on <html>).
  // When NOT embedded, honour a saved "dark" preference. When embedded, stay light.
  var html = document.documentElement;
  var embedded = html.classList.contains("embedded");
  if (!embedded) {
    var saved = localStorage.getItem("theme");
    if (saved === "dark") html.classList.add("dark");
  }
  document.getElementById("themeToggle").onclick = function() {
    var dark = html.classList.toggle("dark");
    localStorage.setItem("theme", dark ? "dark" : "light");
  };

  // Height resize postMessage for parent embed.js (P1c-06)
  function sendResize() {
    if (window.parent !== window) {
      try { window.parent.postMessage({ type: "gymos:resize", height: document.body.scrollHeight }, "*"); } catch (_) {}
    }
  }
  // Fire on load
  sendResize();
  // Fire after any DOM mutation (handles conditional visibility changes)
  if (typeof MutationObserver !== "undefined") {
    var obs = new MutationObserver(sendResize);
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
  }

  // When embedded in an iframe, let the parent close the popover on Escape
  if (html.classList.contains("embedded") && window.parent !== window) {
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        try { window.parent.postMessage({ type: "gymos:close" }, "*"); } catch (_) {}
      }
    });
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

  // Rating stars
  document.querySelectorAll(".rating-group").forEach(function(group) {
    var name = group.dataset.name;
    var hidden = group.nextElementSibling;
    var buttons = group.querySelectorAll(".star-btn");
    buttons.forEach(function(btn) {
      btn.onclick = function() {
        var val = parseInt(btn.dataset.value);
        hidden.value = val;
        buttons.forEach(function(b) {
          var v = parseInt(b.dataset.value);
          b.classList.toggle("active", v <= val);
        });
      };
    });
  });

  // Scale sliders
  document.querySelectorAll(".scale-group").forEach(function(group) {
    var slider = group.querySelector(".slider");
    var valLabel = group.querySelector(".scale-val");
    slider.oninput = function() { valLabel.textContent = slider.value; };
  });

  // Conditional visibility
  function updateVisibility() {
    document.querySelectorAll("[data-cond-field]").forEach(function(el) {
      var depId = el.dataset.condField;
      var op = el.dataset.condOp;
      var condVal = el.dataset.condVal;
      var depVal = getFieldValue(depId);
      var show = true;
      if (op === "equals") show = depVal === condVal;
      else if (op === "not_equals") show = depVal !== condVal;
      else if (op === "contains") show = depVal.indexOf(condVal) >= 0;
      el.style.display = show ? "" : "none";
      el.dataset.hidden = show ? "" : "1";
    });
    sendResize();
  }

  function getFieldValue(id) {
    var el = document.querySelector('[name="' + id + '"]');
    if (!el) return "";
    if (el.type === "checkbox" && !el.closest(".ms-group")) return el.checked ? "true" : "";
    return el.value || "";
  }

  document.getElementById("mainForm").addEventListener("input", updateVisibility);
  document.getElementById("mainForm").addEventListener("change", updateVisibility);
  updateVisibility();

  // Collect form data
  function collectData() {
    var data = {};
    FIELDS.forEach(function(f) {
      var el = document.querySelector('[data-field-id="' + f.id + '"]');
      if (!el || el.dataset.hidden === "1") return;
      if (f.type === "multiselect") {
        var checked = [];
        el.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) { checked.push(cb.value); });
        data[f.id] = checked;
      } else if (f.type === "checkbox") {
        data[f.id] = el.querySelector('input[type="checkbox"]').checked;
      } else if (f.type === "rating") {
        var v = el.querySelector('input[type="hidden"]').value;
        if (v) data[f.id] = parseInt(v);
      } else if (f.type === "scale") {
        data[f.id] = parseInt(el.querySelector(".slider").value);
      } else {
        var input = el.querySelector("input, textarea, select");
        if (input && input.value) data[f.id] = input.value;
      }
    });
    return data;
  }

  // Validation
  function validate(data) {
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      var el = document.querySelector('[data-field-id="' + f.id + '"]');
      if (!el || el.dataset.hidden === "1") continue;
      if (f.required) {
        var val = data[f.id];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          return f.label + " is required";
        }
      }
      if (f.validation) {
        var v = data[f.id];
        if (f.validation.min != null && Number(v) < f.validation.min)
          return (f.validation.message || f.label + " must be at least " + f.validation.min);
        if (f.validation.max != null && Number(v) > f.validation.max)
          return (f.validation.message || f.label + " must be at most " + f.validation.max);
        if (f.validation.pattern && typeof v === "string" && !new RegExp(f.validation.pattern).test(v))
          return (f.validation.message || f.label + " is invalid");
      }
    }
    return null;
  }

  // Turnstile
  var captchaToken = null;
  if (TURNSTILE_KEY) {
    window.__turnstileOnLoad = function() {
      window.turnstile.render(document.getElementById("turnstile"), {
        sitekey: TURNSTILE_KEY,
        appearance: "managed",
        callback: function(token) { captchaToken = token; },
      });
    };
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__turnstileOnLoad";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  // Submit
  var PAGE_LOAD_T = Date.now();
  var submitting = false;
  // Read attribution params threaded in by embed.js (PIX-02) — these are query
  // params on the iframe URL set from the parent page's fbclid/_fbc/_fbp cookies.
  var qp = new URLSearchParams(location.search);
  document.getElementById("mainForm").onsubmit = function(e) {
    e.preventDefault();
    if (submitting) return;
    var data = collectData();
    var err = validate(data);
    if (err) { showToast(err); return; }
    submitting = true;
    var btn = document.getElementById("submitBtn");
    btn.textContent = "Submitting...";
    btn.disabled = true;
    var hp = (document.getElementById("_hp") || {}).value || "";

    // CAPI-05: generate ONE event_id BEFORE the fetch so browser Pixel and
    // server CAPI share the identical string for Meta dedup. Pitfall 2: must
    // exist before the fbq call AND before the fetch body is assembled.
    var EVENT_ID = "mc1_" + Math.random().toString(36).slice(2, 9) + "_" + Date.now().toString(36);

    fetch(${JSON.stringify(submitPath)} + FORM_ID, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: data,
        captchaToken: captchaToken,
        _hp: hp,
        _t: PAGE_LOAD_T,
        event_id: EVENT_ID,
        fbc: qp.get("fbc") || undefined,
        fbp: qp.get("fbp") || undefined,
        fbclid: qp.get("fbclid") || undefined,
        page_url: document.referrer || location.href,
      }),
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      if (!res.ok) { throw new Error(res.data.error || "Failed to submit"); }
      if (REDIRECT) { window.location.href = REDIRECT; return; }
      document.querySelector(".container").style.display = "none";
      document.getElementById("successView").style.display = "flex";
      sendResize();
      if (html.classList.contains("embedded") && window.parent !== window) {
        try {
          // Gym-specific postMessage — replaces upstream "agent-native-feedback-submitted"
          window.parent.postMessage({ type: "lead:submitted", formId: FORM_ID, responseId: res.data.id }, "*");
        } catch (_) {}
      }
      // PIX-01 / CAPI-05: fire browser Lead AFTER success with the SAME EVENT_ID
      // so Meta deduplicates browser + server events. eventID is camelCase (4th fbq arg).
      if (typeof fbq !== "undefined") {
        fbq("track", "Lead", {}, { eventID: EVENT_ID });
      }
    })
    .catch(function(err) {
      showToast(err.message || "Something went wrong. Please try again or call us directly.");
      submitting = false;
      btn.textContent = ${JSON.stringify(settings.submitText || "Send Enquiry")};
      btn.disabled = false;
    });
  };
})();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 404 page
// ---------------------------------------------------------------------------

function notFoundPage(brand: TenantBrand) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Form not found</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${brand.googleFontsHref}" rel="stylesheet">
<style>
${CSS(brand)}</style>
</head>
<body>
<div class="page">
  <div class="not-found">
    <h1>Form not found</h1>
    <p class="desc">This form may have been removed or is no longer accepting responses.</p>
    <button class="submit-btn" style="width:auto;padding:8px 20px;font-size:13px" onclick="location.reload()">Try Again</button>
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function CSS(brand: TenantBrand) {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:0 0% 100%;--fg:220 10% 10%;
  --card:0 0% 100%;--card-fg:220 10% 10%;
  --muted:220 10% 95%;--muted-fg:220 5% 45%;
  --border:220 10% 90%;--input:220 10% 90%;
  --ring:220 10% 40%;
  --radius:var(--gym-radius, 0.5rem);
}
.dark{
  --bg:220 6% 4%;--fg:0 0% 90%;
  --card:220 5% 6%;--card-fg:0 0% 90%;
  --muted:220 4% 8%;--muted-fg:220 4% 55%;
  --border:220 4% 12%;--input:220 4% 12%;
  --ring:0 0% 60%;
}

html{font-family:${brand.fontFamily};font-feature-settings:"cv02","cv03","cv04","cv11"}
body{background:hsl(var(--bg));color:hsl(var(--fg));min-height:100vh;-webkit-font-smoothing:antialiased}

.page{min-height:100vh;padding:48px 16px 80px;position:relative}
.container{max-width:640px;margin:0 auto}
.form-toolbar{display:flex;justify-content:flex-end;margin-bottom:12px}

.header{margin-bottom:32px}
.header h1{font-size:1.5rem;font-weight:600;line-height:1.3;letter-spacing:-0.01em}
.desc{margin-top:6px;font-size:0.875rem;color:hsl(var(--muted-fg));line-height:1.5}

.fields-card{display:flex;flex-direction:column;gap:24px}

.field{display:flex;flex-direction:column;gap:6px}
.field-half{width:50%}
.field-label{font-size:0.875rem;font-weight:500;color:hsl(var(--card-fg))}
.field-desc{font-size:0.75rem;color:hsl(var(--muted-fg))}
.req{color:#ef4444;margin-left:2px} /* guard:allow-color — embed widget functional required-field red; no studio token equivalent */

.fi{width:100%;padding:8px 12px;font-size:0.875rem;font-family:inherit;background:transparent;border:1px solid hsl(var(--input));border-radius:var(--radius);color:hsl(var(--fg));outline:none}
.fi:focus{border-color:hsl(var(--ring));box-shadow:0 0 0 2px hsl(var(--ring)/0.15)}
.fi-ta{resize:vertical;min-height:80px}
select.fi{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:30px}
select.fi option{background:hsl(var(--card));color:hsl(var(--fg))}

.cb-label{display:flex;align-items:center;gap:8px;font-size:0.875rem;cursor:pointer}
.cb,.radio{width:16px;height:16px;accent-color:hsl(var(--fg));cursor:pointer}
.ms-group,.radio-group{display:flex;flex-direction:column;gap:8px}

.rating-group{display:flex;gap:4px}
.star-btn{background:none;border:none;cursor:pointer;padding:2px;color:hsl(var(--muted-fg)/0.3)}
.star-btn.active{color:#fbbf24;fill:#fbbf24} /* guard:allow-color — embed widget star rating amber; no studio token equivalent */
.star-btn.active svg{fill:#fbbf24} /* guard:allow-color — embed widget star rating amber SVG fill; no studio token equivalent */

.scale-group{padding-top:8px}
.slider{width:100%;accent-color:hsl(var(--fg));cursor:pointer}
.scale-labels{display:flex;justify-content:space-between;font-size:0.75rem;color:hsl(var(--muted-fg));margin-top:4px}
.scale-val{font-weight:500;color:hsl(var(--fg))}

.turnstile-wrap{margin-top:16px}

.submit-btn{
  margin-top:16px;padding:10px 24px;
  font-size:0.875rem;font-weight:500;font-family:inherit;
  background:var(--studio-accent,var(--gym-accent,#000));color:${brand.primaryText}; /* guard:allow-color — embed widget dark text on tenant primary CTA; --studio-accent injected from URL param; #000 is CSS var fallback only */
  border:none;border-radius:var(--radius);cursor:pointer;
}
.submit-btn:hover{opacity:0.9}
.submit-btn:disabled{opacity:0.6;cursor:not-allowed}

.theme-toggle{
  background:none;border:1px solid hsl(var(--border));border-radius:var(--radius);
  width:36px;height:36px;display:flex;align-items:center;justify-content:center;
  cursor:pointer;color:hsl(var(--muted-fg));
}
.theme-toggle:hover{background:hsl(var(--muted));color:hsl(var(--fg))}
.dark .icon-sun{display:none}
.dark .icon-moon{display:block}
html:not(.dark) .icon-sun{display:block}
html:not(.dark) .icon-moon{display:none}

.success-view{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;max-width:400px;margin:120px auto 0;
}
.success-icon{
  width:56px;height:56px;border-radius:50%;
  background:rgba(16,185,129,0.1);
  display:flex;align-items:center;justify-content:center;
  color:#10b981;margin-bottom:16px; /* guard:allow-color — embed widget functional success green; no studio token equivalent */
}

.not-found{text-align:center;margin-top:120px}
.not-found h1{font-size:1.5rem;font-weight:600;margin-bottom:8px}
.not-found .submit-btn{margin-top:16px;display:inline-block}

.embedded .theme-toggle{display:none}
.embedded .page{padding:20px 16px 32px}
.embedded .header{margin-bottom:20px}
.embedded .header h1{font-size:1.125rem}
.embedded .desc{font-size:0.8125rem}
.embedded .success-view{margin-top:32px}
.embedded .success-view h1{font-size:1.125rem}

.toast{
  position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
  padding:10px 20px;border-radius:var(--radius);
  font-size:0.875rem;font-weight:500;z-index:100;
  background:#1f2937;color:#f9fafb; /* guard:allow-color — embed widget functional toast colors (dark bg / light text); no studio token equivalent */
  box-shadow:0 4px 12px rgba(0,0,0,0.3);
}
.toast-error{background:#991b1b} /* guard:allow-color — embed widget functional error toast red; no studio token equivalent */

.empty{text-align:center;color:hsl(var(--muted-fg));padding:32px 0}

@media(max-width:640px){
  .page{padding:32px 12px 80px}  .field-half{width:100%}
}
`;
}
