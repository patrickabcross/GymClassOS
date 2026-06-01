/**
 * embed-snippet.ts — builds the vanilla-JS IIFE string served at GET /embed.js.
 *
 * Usage on the studio's marketing site (doyouhustle.co.uk):
 *
 *   <!-- Embed a lead-capture form -->
 *   <div data-gymos-form="trial-signup" data-accent="#ff5733" data-radius="8"></div>
 *
 *   <!-- Embed the schedule widget -->
 *   <div data-gymos-schedule data-accent="#ff5733" data-radius="8"></div>
 *
 *   <script src="https://gym-class-os.vercel.app/embed.js" async></script>
 *
 * Callbacks on the host page:
 *
 *   document.addEventListener("lead:submitted", (e) => {
 *     console.log("lead:submitted", e.detail); // { type, formId, responseId }
 *   });
 *   document.addEventListener("enquiry:created", (e) => {
 *     console.log("enquiry:created", e.detail); // { type, occurrenceId, responseId }
 *   });
 *
 * postMessage contract (emitted by the iframes):
 *   { type: "gymos:resize",     height: <number> }
 *   { type: "lead:submitted",   formId: <string>, responseId: <string> }
 *   { type: "enquiry:created",  occurrenceId: <string>, responseId: <string> }
 *
 * Security:
 *   - The listener checks ev.origin === BASE before processing any message.
 *   - Theming values from data attributes are URI-encoded before use in URLs.
 */

/**
 * Returns the embed.js source string with the given base origin baked in.
 *
 * @param baseOrigin  The deployed staff-web origin, e.g. "https://gym-class-os.vercel.app".
 *                    Injected into the IIFE as the VAR BASE constant so the origin check
 *                    and the iframe src both use exactly the same value.
 */
export function buildEmbedScript(baseOrigin: string): string {
  // Sanitise baseOrigin so it can safely appear as a JS string literal.
  // Only allow http/https origins; strip any trailing slash.
  const safeBase = /^https?:\/\/[^\s"'\\]+$/.test(baseOrigin)
    ? baseOrigin.replace(/\/$/, "")
    : "https://gym-class-os.vercel.app";

  return `(function(){
"use strict";

/** The deployed GymClassOS staff-web origin.  Baked in at request time. */
var BASE = ${JSON.stringify(safeBase)};

// ---------------------------------------------------------------------------
// iframe injection
// ---------------------------------------------------------------------------

function buildParams(accent, radius) {
  var p = "";
  if (accent) p += "&accent=" + encodeURIComponent(accent);
  if (radius) p += "&radius=" + encodeURIComponent(radius);
  return p;
}

function makeIframe(src) {
  var iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.style.cssText = "border:none;width:100%;min-height:300px;display:block;";
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("allowtransparency", "true");
  iframe.setAttribute("title", "GymClassOS embed");
  return iframe;
}

function injectEmbeds() {
  // --- form embeds: [data-gymos-form="<slug>"] ---
  var formEls = document.querySelectorAll("[data-gymos-form]");
  for (var i = 0; i < formEls.length; i++) {
    var el = formEls[i];
    if (el.dataset._gymosInjected) continue;
    el.dataset._gymosInjected = "1";
    var slug = el.getAttribute("data-gymos-form") || "";
    if (!slug) continue;
    var accent = el.getAttribute("data-accent") || "";
    var radius = el.getAttribute("data-radius") || "";
    var src = BASE + "/f/" + encodeURIComponent(slug) + "?embed=1" + buildParams(accent, radius);
    el.appendChild(makeIframe(src));
  }

  // --- schedule embeds: [data-gymos-schedule] ---
  var schedEls = document.querySelectorAll("[data-gymos-schedule]");
  for (var j = 0; j < schedEls.length; j++) {
    var sEl = schedEls[j];
    if (sEl.dataset._gymosInjected) continue;
    sEl.dataset._gymosInjected = "1";
    var sAccent = sEl.getAttribute("data-accent") || "";
    var sRadius = sEl.getAttribute("data-radius") || "";
    var sSrc = BASE + "/embed/schedule?embed=1" + buildParams(sAccent, sRadius);
    sEl.appendChild(makeIframe(sSrc));
  }
}

// Run once the DOM is ready (safe with async script loading)
if (document.readyState === "interactive" || document.readyState === "complete") {
  injectEmbeds();
} else {
  document.addEventListener("DOMContentLoaded", injectEmbeds);
}

// ---------------------------------------------------------------------------
// postMessage listener — origin-checked relay to host CustomEvents
// ---------------------------------------------------------------------------

window.addEventListener("message", function(ev) {
  // SECURITY: reject messages from any origin other than the embed origin.
  // This must be the FIRST check — before any data access.
  if (ev.origin !== BASE) return;

  var d = ev.data;
  if (!d || typeof d.type !== "string") return;

  // gymos:resize — auto-resize the sending iframe to fit its content
  if (d.type === "gymos:resize") {
    var height = d.height;
    if (typeof height !== "number" || height < 0 || height > 20000) return;
    // Find the iframe whose contentWindow === ev.source
    var iframes = document.querySelectorAll("iframe");
    for (var k = 0; k < iframes.length; k++) {
      try {
        if (iframes[k].contentWindow === ev.source) {
          iframes[k].style.height = height + "px";
          break;
        }
      } catch (_) {}
    }
    return;
  }

  // lead:submitted — re-dispatch as a CustomEvent on the host document
  if (d.type === "lead:submitted") {
    document.dispatchEvent(new CustomEvent("lead:submitted", { detail: d }));
    return;
  }

  // enquiry:created — re-dispatch as a CustomEvent on the host document
  if (d.type === "enquiry:created") {
    document.dispatchEvent(new CustomEvent("enquiry:created", { detail: d }));
    return;
  }
});

})();
`;
}
