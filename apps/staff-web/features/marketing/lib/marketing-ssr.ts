/**
 * Public SSR marketing pages — homepage (`/`) and privacy policy (`/privacy`).
 *
 * Returned as standalone self-contained HTML (no React Router shell, no auth).
 * This mirrors the public form / schedule-widget SSR pattern in
 * `features/forms/lib/*-ssr.ts`: a Nitro server route re-exports one of these
 * H3 handlers, so crawlers and the Meta app-review bot get real HTML rather
 * than a client-only spinner (root.tsx wraps every RR route in <ClientOnly>).
 *
 * Why these exist: Meta requires a Privacy Policy URL on the WhatsApp app
 * before it can go live, and a legitimate homepage smooths app review. Both
 * must be reachable without a staff session — see the `publicPaths` + allowlist
 * skip entries added in server/plugins/auth.ts.
 *
 * CONTENT IS PLATFORM-BRANDED ("RunStudio") per the product owner's choice.
 * The homepage follows the RunStudio brand book (docs/brand book/BRAND.md):
 * the double meaning of "run" (operate + move), the agent reporting over
 * WhatsApp, pulse held to accent-only, warm --track ground, Space Grotesk /
 * Inter / Space Mono. The homepage is a fully self-contained document; the
 * privacy page keeps the lighter shared shell below.
 */

import { getMethod, type H3Event } from "h3";
import {
  LOCALES,
  LOCALE_ORDER,
  type LocaleCode,
  type LocaleContent,
} from "./marketing-content.js";

// ---------------------------------------------------------------------------
// Static site facts (single source of truth for both pages)
// ---------------------------------------------------------------------------

const SITE = {
  name: "RunStudio",
  tagline: "You teach. Your AI runs everything else.",
  contactEmail: "patrickabcross@outlook.com",
  // Privacy policy effective / last-updated date (ISO). Bump when the policy
  // text materially changes.
  policyUpdated: "2026-06-02",
  appPath: "/gymos",
} as const;

function escapeHtml(value: unknown): string {
  const s = value == null ? "" : String(value);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format an ISO date (YYYY-MM-DD) as e.g. "2 June 2026". */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (!y || !m || !d || !months[m - 1]) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// H3 handlers (wired up by server/routes/index.get.ts + privacy.get.ts)
// ---------------------------------------------------------------------------

function htmlResponse(event: H3Event, html: string): Response {
  return new Response(getMethod(event) === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}

function makeHomeRenderer(code: LocaleCode) {
  return (event: H3Event): Response =>
    htmlResponse(event, homePage(LOCALES[code]));
}

// One renderer per market. The bare "/" route is canonical UK English.
export const renderHomeUK = makeHomeRenderer("uk");
export const renderHomeUS = makeHomeRenderer("us");
export const renderHomeFR = makeHomeRenderer("fr");
export const renderHomeDE = makeHomeRenderer("de");
export const renderHomePage = renderHomeUK;

export function renderPrivacyPage(event: H3Event): Response {
  return htmlResponse(event, privacyPage());
}

// ---------------------------------------------------------------------------
// Shared page shell
// ---------------------------------------------------------------------------

function shell(opts: {
  title: string;
  description: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
<style>
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/inter-variable.woff2") format("woff2-variations");
}
${CSS()}</style>
<script>
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light") document.documentElement.classList.remove("dark");
  } catch (e) {}
</script>
</head>
<body>
${opts.body}
<script>
(function(){
  var btn = document.getElementById("themeToggle");
  if (!btn) return;
  var html = document.documentElement;
  btn.onclick = function(){
    var dark = html.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
  };
})();
</script>
</body>
</html>`;
}

function header(): string {
  return `<header class="nav">
  <a class="brand" href="/">
    <span class="brand-mark">RS</span>
    <span class="brand-name">${escapeHtml(SITE.name)}</span>
  </a>
  <div class="nav-right">
    <a class="nav-link" href="/privacy">Privacy</a>
    <a class="btn btn-primary nav-cta" href="${SITE.appPath}">Open app</a>
    <button type="button" class="theme-toggle" id="themeToggle" aria-label="Toggle theme">
      <svg class="icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <svg class="icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
  </div>
</header>`;
}

function footer(): string {
  return `<footer class="footer">
  <div class="footer-inner">
    <span>&copy; ${SITE.policyUpdated.slice(0, 4)} ${escapeHtml(SITE.name)}</span>
    <div class="footer-links">
      <a href="/privacy">Privacy policy</a>
      <a href="mailto:${escapeHtml(SITE.contactEmail)}">Contact</a>
    </div>
  </div>
</footer>`;
}

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

// The RunStudio motion mark — a double chevron (play/run arrow + runner's
// forward lean). Used in the nav and the WhatsApp thread avatar. (BRAND.md §4)
const MARK_SVG = `<svg viewBox="0 0 58 58" aria-hidden="true"><path d="M20 16 L36 29 L20 42" fill="none" stroke="#C8FF3D" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 16 L46 29 L30 42" fill="none" stroke="#16786A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/></svg>`;
const PLAY_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M8 6 L18 12 L8 18 Z" fill="#14171C"/></svg>`;

/**
 * An AI-video slot. When `opts.src` is provided it renders a real `<video>`
 * element (autoplay muted loop playsinline) with the tag and caption overlaid
 * via the existing z-index CSS — the play-button placeholder is dropped.
 * When `opts.src` is absent the placeholder (pulse play button + mono caption)
 * is rendered instead, keeping the layout stable.
 *
 * Current wiring:
 *   agentSection() → videoSlot({ src: "/marketing/runstudio-film.mp4", … })
 */
function videoSlot(opts: {
  ar: "ar-16x9" | "ar-9x16";
  tag: string;
  caption: string;
  src?: string;
  className?: string;
}): string {
  const inner = opts.src
    ? `<video src="${escapeHtml(opts.src)}" autoplay muted loop playsinline preload="metadata"></video>`
    : `<!-- Drop a real AI clip in here: <video src="…" autoplay muted loop playsinline></video> -->
    <div class="video-slot__play" aria-hidden="true">${PLAY_SVG}</div>`;
  return `<div class="video-slot ${opts.ar}${opts.className ? " " + opts.className : ""}">
    <span class="video-slot__tag">${escapeHtml(opts.tag)}</span>
    ${inner}
    <span class="video-slot__cap"><span class="rec"></span> ${escapeHtml(opts.caption)}</span>
  </div>`;
}

// Giant ghost motion-mark that drifts behind the hero.
const GHOST_SVG = `<svg viewBox="0 0 58 58"><path d="M16 10 L40 29 L16 48" fill="none" stroke="#C8FF3D" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 10 L54 29 L30 48" fill="none" stroke="#16786A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ─── Section builders (every field escaped except hero.h1, trusted markup) ───

function navBar(L: LocaleContent): string {
  const links = L.nav.links
    .map((l) => `<a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`)
    .join("\n    ");
  return `<header class="r-nav">
  <div class="r-wrap r-nav-inner">
    <a class="wordmark" href="${escapeHtml(L.path)}" aria-label="${escapeHtml(SITE.name)}"><b>run</b><span>Studio</span><span class="dot">.</span></a>
    <nav class="r-nav-links">
      ${links}
    </nav>
    <div class="r-nav-right">
      <a class="r-login" href="${escapeHtml(SITE.appPath)}">${escapeHtml(L.nav.login)}</a>
      <a class="btn btn-pulse" href="${escapeHtml(L.ctaHref)}">${escapeHtml(L.nav.cta)} <span class="chev">&rsaquo;</span></a>
    </div>
  </div>
</header>`;
}

// The WhatsApp agent thread, shown not described (BRAND.md §6). Rendered in the
// hero so the brand's core surface is above the fold.
function phoneMarkup(L: LocaleContent): string {
  const bubbles = L.agent.bubbles
    .map(
      (b) =>
        `<div class="bubble ${b.who}">${escapeHtml(b.text)}<span class="time">${escapeHtml(b.time)}</span></div>`,
    )
    .join("\n                ");
  return `<div class="phone" role="img" aria-label="${escapeHtml(L.agent.phoneWho)}">
          <div class="phone-screen">
            <div class="phone-top">
              <span class="av">${MARK_SVG}</span>
              <span><span class="who">${escapeHtml(L.agent.phoneWho)}</span><br><span class="stat-mini">${escapeHtml(L.agent.phoneStatus)}</span></span>
            </div>
            <div class="phone-body">
              <span class="day-tag">${escapeHtml(L.agent.dayTag)}</span>
              <div class="thread">
                ${bubbles}
              </div>
            </div>
          </div>
        </div>`;
}

function heroSection(L: LocaleContent): string {
  return `<section class="r-hero">
    <div class="ghost" aria-hidden="true">${GHOST_SVG}</div>
    <div class="r-wrap r-hero-grid">
      <div class="reveal">
        <div class="mark-lockup">
          <span class="mark">${MARK_SVG}</span>
          <span class="eyebrow on-dark">${escapeHtml(L.hero.eyebrow)}</span>
        </div>
        <h1 class="r-h1">${L.hero.h1}</h1>
        <p class="r-lead">${escapeHtml(L.hero.lead)}</p>
        <div class="r-cta">
          <a class="btn btn-pulse" href="${escapeHtml(L.ctaHref)}">${escapeHtml(L.hero.cta)} <span class="chev">&rsaquo;</span></a>
          <a class="btn btn-ghost on-dark" href="#agent">${escapeHtml(L.hero.ctaSecondary)}</a>
          <span class="note">${escapeHtml(L.hero.note)}</span>
        </div>
      </div>
      <div class="reveal">
        ${phoneMarkup(L)}
      </div>
    </div>
  </section>`;
}

function problemSection(L: LocaleContent): string {
  const points = L.problem.points
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join("\n          ");
  return `<section class="r-sec sec-light" id="problem">
    <div class="r-wrap">
      <div class="r-head reveal">
        <span class="eyebrow">${escapeHtml(L.problem.eyebrow)}</span>
        <h2 class="r-h2">${escapeHtml(L.problem.h2)}</h2>
      </div>
      <div class="problem-card reveal">
        <h3>${escapeHtml(L.problem.heading)}</h3>
        <ul class="vs-list pain">
          ${points}
        </ul>
      </div>
    </div>
  </section>`;
}

function loopSection(L: LocaleContent): string {
  const steps = L.loop.steps
    .map(
      (s) =>
        `<div class="pri"><span class="n">${escapeHtml(s.k)}</span><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.body)}</p></div>`,
    )
    .join("\n        ");
  return `<section class="r-sec sec-dark" id="how">
    <div class="r-wrap">
      <div class="r-head reveal">
        <span class="eyebrow on-dark">${escapeHtml(L.loop.eyebrow)}</span>
        <h2 class="r-h2">${escapeHtml(L.loop.h2)}</h2>
        <p class="r-lead">${escapeHtml(L.loop.lead)}</p>
      </div>
      <div class="loop reveal">
        ${steps}
      </div>
    </div>
  </section>`;
}

function agentSection(L: LocaleContent): string {
  return `<section class="r-sec sec-dark" id="agent">
    <div class="r-wrap film-wrap">
      <div class="r-head center reveal">
        <span class="eyebrow on-dark">${escapeHtml(L.agent.eyebrow)}</span>
        <h2 class="r-h2">${escapeHtml(L.agent.h2)}</h2>
        <p class="r-lead">${escapeHtml(L.agent.lead)}</p>
      </div>
      ${videoSlot({ ar: "ar-16x9", src: "/marketing/runstudio-film.mp4", tag: L.agent.videoTag, caption: L.agent.videoCaption, className: "reveal" })}
    </div>
  </section>`;
}

function proofSection(L: LocaleContent): string {
  const stats = L.proof.stats
    .map(
      (s) =>
        `<div class="stat-cell"><div class="stat">${escapeHtml(s.value)}</div><div class="stat-label">${escapeHtml(s.label)}</div></div>`,
    )
    .join("\n        ");
  return `<section class="r-sec sec-dark" id="proof">
    <div class="r-wrap">
      <div class="r-head center reveal">
        <span class="eyebrow on-dark">${escapeHtml(L.proof.eyebrow)}</span>
        <h2 class="r-h2">${escapeHtml(L.proof.h2)}</h2>
      </div>
      <div class="stat-row reveal">
        ${stats}
      </div>
    </div>
  </section>`;
}

function objectionsSection(L: LocaleContent): string {
  const items = L.objections.items
    .map(
      (o) =>
        `<div class="obj-card"><h3>${escapeHtml(o.q)}</h3><p>${escapeHtml(o.a)}</p></div>`,
    )
    .join("\n        ");
  return `<section class="r-sec sec-light" id="faq">
    <div class="r-wrap">
      <div class="r-head reveal">
        <span class="eyebrow">${escapeHtml(L.objections.eyebrow)}</span>
        <h2 class="r-h2">${escapeHtml(L.objections.h2)}</h2>
      </div>
      <div class="obj-grid reveal">
        ${items}
      </div>
      <p class="trust reveal">${escapeHtml(L.objections.trust)}</p>
    </div>
  </section>`;
}

function finalCtaSection(L: LocaleContent): string {
  return `<section class="r-sec sec-dark">
    <div class="r-wrap">
      <div class="final-cta reveal">
        <span class="eyebrow on-dark">${escapeHtml(L.finalCta.eyebrow)}</span>
        <h2 class="r-h2">${escapeHtml(L.finalCta.h2)}</h2>
        <div class="r-cta">
          <a class="btn btn-pulse" href="${escapeHtml(L.ctaHref)}">${escapeHtml(L.finalCta.cta)} <span class="chev">&rsaquo;</span></a>
          <a class="btn btn-ghost on-dark" href="#agent">${escapeHtml(L.finalCta.ctaSecondary)}</a>
        </div>
      </div>
    </div>
  </section>`;
}

function localeSwitcher(L: LocaleContent): string {
  const links = LOCALE_ORDER.map((code) => {
    const t = LOCALES[code];
    const cur = code === L.code ? ' aria-current="page"' : "";
    return `<a href="${escapeHtml(t.path)}"${cur}>${escapeHtml(t.label)}</a>`;
  }).join("");
  return `<div class="r-switch"><span class="r-switch-label">${escapeHtml(L.footer.switchLabel)}</span>${links}</div>`;
}

function footerBar(L: LocaleContent): string {
  return `<footer class="r-foot">
  <div class="r-wrap r-foot-inner">
    <a class="wordmark on-dark" href="${escapeHtml(L.path)}"><b>run</b><span>Studio</span><span class="dot">.</span></a>
    <div class="r-foot-links">
      <a href="/privacy">${escapeHtml(L.footer.privacy)}</a>
      <a href="mailto:${escapeHtml(SITE.contactEmail)}">${escapeHtml(L.footer.contact)}</a>
    </div>
    ${localeSwitcher(L)}
    <span class="r-foot-tag">&copy; ${SITE.policyUpdated.slice(0, 4)} ${escapeHtml(SITE.name)} &middot; runstudio.ai</span>
  </div>
</footer>`;
}

const REVEAL_SCRIPT = `<script>
(function(){
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll(".reveal").forEach(function(el){ el.classList.add("in"); });
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if (e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach(function(el){ io.observe(el); });
})();
</script>`;

/** Full standalone homepage for one market — "The Disappearing Software". */
function homePage(L: LocaleContent): string {
  const body = `${navBar(L)}
<main>
  ${heroSection(L)}
  ${problemSection(L)}
  ${loopSection(L)}
  ${agentSection(L)}
  ${proofSection(L)}
  ${objectionsSection(L)}
  ${finalCtaSection(L)}
</main>
${footerBar(L)}
${REVEAL_SCRIPT}`;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(L.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(L.metaTitle)}</title>
<meta name="description" content="${escapeHtml(L.metaDescription)}">
<meta name="theme-color" content="#14171C">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap">
<style>${homeCSS()}</style>
</head>
<body class="r-body">
${body}
</body>
</html>`;
}
// ---------------------------------------------------------------------------
// Privacy policy
// ---------------------------------------------------------------------------

function privacyPage(): string {
  const updated = formatDate(SITE.policyUpdated);
  const email = escapeHtml(SITE.contactEmail);

  const body = `${header()}
<main class="doc">
  <div class="doc-inner">
    <h1>Privacy Policy</h1>
    <p class="doc-meta">Last updated: ${escapeHtml(updated)}</p>

    <p>${escapeHtml(SITE.name)} ("we", "us", "our") provides software that boutique fitness studios use to manage member messaging, class bookings, and payments. This policy explains what personal data we process, why, and the choices you have. We act as the data processor on behalf of the studio that uses ${escapeHtml(SITE.name)} (the data controller for its members' data); for staff accounts and the platform itself we are the controller.</p>

    <h2>1. Who we are</h2>
    <p>For any privacy question or request, contact us at <a href="mailto:${email}">${email}</a>.</p>

    <h2>2. Data we collect</h2>
    <ul>
      <li><strong>Staff accounts.</strong> When studio staff sign in with Google, we receive their name and email address to authenticate them and control access. We do not read Gmail, Calendar, or Contacts.</li>
      <li><strong>Members.</strong> On behalf of the studio we process member details such as name, phone number, email, class bookings and attendance, and pass or membership status.</li>
      <li><strong>WhatsApp messages.</strong> When a member messages the studio's WhatsApp Business number, or the studio replies, we process the content and metadata of those messages to deliver the conversation to the studio's inbox. WhatsApp messaging is provided through the WhatsApp Business Platform operated by Meta.</li>
      <li><strong>Payments.</strong> Payments are processed by Stripe. We never see or store full card details — only tokenised customer, subscription, and payment identifiers returned by Stripe.</li>
      <li><strong>Member mobile activity.</strong> If a member uses the studio's mobile app, we may process activity they log, including food and calorie entries they choose to record.</li>
      <li><strong>Technical data.</strong> A session cookie keeps staff signed in. We keep operational logs needed to run and secure the service.</li>
    </ul>

    <h2>3. How we use data</h2>
    <ul>
      <li>To deliver the core service: showing member conversations, managing the schedule and bookings, and recording passes and payments.</li>
      <li>To send WhatsApp messages a studio initiates, subject to member opt-in and Meta's messaging rules (including the requirement to use approved message templates outside the 24-hour customer-service window).</li>
      <li>To process payments and keep membership and pass records accurate.</li>
      <li>To secure, maintain, and improve the service and to comply with our legal obligations.</li>
    </ul>
    <p>We do not sell personal data, and we do not use member messages for advertising.</p>

    <h2>4. WhatsApp and Meta</h2>
    <p>Messaging features rely on the WhatsApp Business Platform. When you interact with a studio over WhatsApp, your message is also processed by Meta under <a href="https://www.whatsapp.com/legal/privacy-policy" rel="noopener noreferrer" target="_blank">WhatsApp's own privacy policy</a>. Members must opt in to receive WhatsApp messages from the studio and can opt out at any time by telling the studio or replying to stop messages.</p>

    <h2>5. Sharing and processors</h2>
    <p>We share data only with service providers that help us run ${escapeHtml(SITE.name)}, under contracts that require them to protect it:</p>
    <ul>
      <li><strong>Meta / WhatsApp</strong> — message delivery.</li>
      <li><strong>Stripe</strong> — payment processing.</li>
      <li><strong>Neon</strong> — managed database hosting.</li>
      <li><strong>Vercel and Fly.io</strong> — application and webhook hosting.</li>
      <li><strong>Google</strong> — staff sign-in.</li>
    </ul>
    <p>We may also disclose data if required by law or to protect our rights, users, or the public.</p>

    <h2>6. Retention</h2>
    <p>We keep personal data for as long as the studio's account is active and as needed to provide the service, then delete or anonymise it within a reasonable period, unless a longer period is required by law (for example, financial records). Studios can request deletion of member data on a member's behalf.</p>

    <h2>7. Security</h2>
    <p>We use industry-standard measures to protect data, including encryption in transit and encryption at rest for stored secrets. Card data is handled entirely by Stripe (a PCI-DSS Level 1 provider) and never stored on our systems.</p>

    <h2>8. Your rights</h2>
    <p>Depending on where you live, you may have rights to access, correct, delete, or restrict the processing of your personal data, and to object or request portability. To exercise these rights, contact us at <a href="mailto:${email}">${email}</a> or the studio you interact with. If you reached us through a studio, we will work with that studio to handle your request.</p>

    <h2>9. Children</h2>
    <p>${escapeHtml(SITE.name)} is not directed to children under 16, and we do not knowingly collect their personal data.</p>

    <h2>10. Changes to this policy</h2>
    <p>We may update this policy from time to time. When we do, we will revise the "Last updated" date above and, where appropriate, provide additional notice.</p>

    <h2>11. Contact</h2>
    <p>Questions about this policy or our handling of your data? Email <a href="mailto:${email}">${email}</a>.</p>

    <p class="doc-back"><a href="/">&larr; Back to home</a></p>
  </div>
</main>
${footer()}`;

  return shell({
    title: `Privacy Policy — ${SITE.name}`,
    description: `How ${SITE.name} collects, uses, and protects personal data, including WhatsApp messaging and payment information.`,
    body,
  });
}

// ---------------------------------------------------------------------------
// Homepage CSS — RunStudio brand tokens (docs/brand book/tokens.css) + the
// "Disappearing Software" layout. Self-contained; pulse held to accent only.
// ---------------------------------------------------------------------------

function homeCSS(): string {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#14171C;--ink-soft:#2A2F38;--pulse:#C8FF3D;--pulse-deep:#9FD500;
  --distance:#0E5C50;--distance-soft:#16786A;--track:#F3F1EA;--track-deep:#E7E3D7;
  --lane:#9AA1AC;--lane-faint:#C9CDD3;--white:#FFFFFF;
  --f-display:"Space Grotesk","Helvetica Neue",Arial,sans-serif;
  --f-body:"Inter","Helvetica Neue",Arial,sans-serif;
  --f-mono:"Space Mono",ui-monospace,Menlo,monospace;
  --ls-display:-0.025em;--ls-eyebrow:0.16em;
  --r-card:14px;--r-pill:100px;--r-bubble:15px;
  --maxw:1080px;--gutter:clamp(20px,5vw,64px);--section-y:clamp(56px,9vw,120px);
  --ease:cubic-bezier(.7,0,.2,1);--dur:1.1s;
}
@media (prefers-reduced-motion:reduce){:root{--dur:0.001ms}}
html{scroll-behavior:smooth}
.r-body{background:var(--ink);color:var(--track);font-family:var(--f-body);font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
svg{display:block}
.r-wrap{max-width:var(--maxw);margin:0 auto;padding-inline:var(--gutter)}
.r-sec{padding-block:var(--section-y)}
.sec-light{background:var(--track);color:var(--ink)}
.sec-dark{background:var(--ink);color:var(--track)}

/* type */
.r-h1{font-family:var(--f-display);font-weight:700;letter-spacing:var(--ls-display);line-height:.97;font-size:clamp(40px,5.6vw,82px);margin:22px 0 0;max-width:20ch;color:var(--track)}
.r-h1 .fade{color:var(--lane)}
.r-h1 .verb{color:var(--pulse)}
.r-h2{font-family:var(--f-display);font-weight:600;letter-spacing:var(--ls-display);font-size:clamp(28px,4.4vw,46px);line-height:1.04;margin:0}
.sec-light .r-h2{color:var(--ink)}
.sec-dark .r-h2{color:var(--track)}
.r-h2.on-ink{color:var(--track)}
.r-lead{font-size:clamp(18px,2.1vw,22px);line-height:1.5;margin-top:14px;color:var(--ink-soft)}
.sec-dark .r-lead{color:var(--lane)}
.r-hero .r-lead{color:var(--lane-faint);max-width:44ch}
.eyebrow{font-family:var(--f-mono);font-size:12.5px;text-transform:uppercase;letter-spacing:var(--ls-eyebrow);color:var(--distance);display:inline-flex;align-items:center;gap:9px}
.eyebrow::before{content:"";width:7px;height:7px;border-radius:2px;background:var(--pulse);flex:none}
.eyebrow.on-dark{color:var(--pulse)}

/* wordmark */
.wordmark{font-family:var(--f-display);letter-spacing:var(--ls-display);font-size:22px;line-height:1;display:inline-flex;align-items:baseline;color:var(--track)}
.wordmark b{font-weight:700}.wordmark span{font-weight:400}
.wordmark .dot{color:var(--pulse);font-weight:700}
.wordmark.on-dark{color:var(--track)}

/* buttons */
.btn{font-family:var(--f-body);font-weight:500;font-size:17px;border-radius:var(--r-pill);padding:14px 26px;border:1px solid transparent;display:inline-flex;align-items:center;gap:10px;cursor:pointer;transition:background .25s var(--ease),color .25s var(--ease),border-color .25s var(--ease);white-space:nowrap}
.btn-pulse{background:var(--pulse);color:var(--ink);font-weight:600}
.btn-pulse:hover{background:#d6ff63}
.btn-ghost{background:transparent;color:var(--ink);border-color:var(--track-deep)}
.btn-ghost:hover{border-color:var(--ink)}
.btn-ghost.on-dark{color:var(--track);border-color:rgba(243,241,234,.25)}
.btn-ghost.on-dark:hover{border-color:var(--track)}
.btn .chev{font-family:var(--f-mono);font-weight:700}

/* nav */
.r-nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--ink) 80%,transparent);backdrop-filter:saturate(140%) blur(10px);border-bottom:1px solid rgba(243,241,234,.1)}
.r-nav-inner{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-block:16px}
.r-nav-links{display:flex;gap:28px;align-items:center;font-size:13.5px;color:var(--lane)}
.r-nav-links a:hover{color:var(--track)}
@media(max-width:760px){.r-nav-links{display:none}}
.r-nav-right{display:flex;align-items:center;gap:16px}
.r-login{font-size:13.5px;font-weight:500;color:var(--lane);white-space:nowrap}
.r-login:hover{color:var(--track)}

.mark{display:inline-grid;place-items:center;border-radius:14px;background:var(--ink);width:46px;height:46px;flex:none}
.mark svg{width:26px;height:26px}
.r-nav .mark{width:34px;height:34px}.r-nav .mark svg{width:20px;height:20px}

/* hero */
.r-hero{position:relative;min-height:clamp(520px,80vh,800px);display:flex;align-items:center;overflow:hidden;background:radial-gradient(80% 60% at 82% 14%,rgba(14,92,80,.42),transparent 60%),radial-gradient(60% 50% at 10% 92%,rgba(14,92,80,.22),transparent 55%),var(--ink)}
.r-hero .ghost{position:absolute;left:-10%;top:50%;transform:translateY(-50%);width:min(48vw,520px);opacity:.05;pointer-events:none}
.r-hero .ghost svg{width:100%;height:auto}
.r-hero-grid{position:relative;z-index:2;display:grid;gap:clamp(32px,5vw,56px);align-items:center}
@media(min-width:920px){.r-hero-grid{grid-template-columns:1.05fr .95fr}}
.mark-lockup{display:inline-flex;align-items:center;gap:12px}
.r-cta{margin-top:32px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.r-cta.center{justify-content:center}
.r-cta .note{font-family:var(--f-mono);font-size:12.5px;color:var(--lane)}

/* phone + thread */
.phone{background:#1b1f26;border:1px solid rgba(243,241,234,.12);border-radius:30px;padding:14px;box-shadow:0 40px 90px -34px rgba(0,0,0,.7);max-width:360px;margin-inline:auto;width:100%}
.phone-screen{background:var(--track);border-radius:20px;overflow:hidden}
.phone-top{background:var(--distance);color:var(--track);padding:14px 16px;display:flex;align-items:center;gap:11px}
.phone-top .av{width:34px;height:34px;border-radius:10px;background:var(--ink);display:grid;place-items:center;flex:none}
.phone-top .av svg{width:20px;height:20px}
.phone-top .who{font-family:var(--f-display);font-weight:600;font-size:15px;letter-spacing:var(--ls-display)}
.phone-top .stat-mini{font-family:var(--f-mono);font-size:11px;opacity:.85}
.phone-body{padding:16px;display:flex;flex-direction:column;gap:10px;min-height:360px}
.day-tag{align-self:center;font-family:var(--f-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--lane);background:var(--track-deep);padding:4px 12px;border-radius:var(--r-pill)}
.thread{display:flex;flex-direction:column;gap:10px}
.bubble{max-width:86%;padding:11px 14px;border-radius:var(--r-bubble);font-size:15px;line-height:1.45}
.bubble.agent{align-self:flex-start;background:var(--pulse);color:var(--ink);border-bottom-left-radius:5px}
.bubble.user{align-self:flex-end;background:var(--distance-soft);color:var(--white);border-bottom-right-radius:5px}
.bubble .time{display:block;font-family:var(--f-mono);font-size:10.5px;margin-top:5px;opacity:.65}

/* section heads */
.r-head{max-width:54ch;margin-bottom:clamp(28px,4vw,48px)}
.r-head.center{margin-inline:auto;text-align:center}
.r-head .r-h2{margin-top:14px}
.film-wrap{max-width:940px;margin-inline:auto}

/* the shift */
.vs{display:grid;gap:18px}
@media(min-width:760px){.vs{grid-template-columns:1fr 1fr}}
.vs-card{border-radius:var(--r-card);padding:28px;border:1px solid}
.vs-card.old{background:transparent;border-color:rgba(20,23,28,.16);color:var(--ink-soft)}
.vs-card.new{background:var(--ink);border-color:var(--ink);color:var(--track)}
.vs-card h3{font-family:var(--f-mono);font-size:12.5px;text-transform:uppercase;letter-spacing:.14em;margin:0 0 16px}
.vs-card.old h3{color:var(--lane)}
.vs-card.new h3{color:var(--pulse)}
.vs-list{list-style:none;display:flex;flex-direction:column;gap:12px;font-size:13.5px}
.vs-list li{display:flex;gap:11px;align-items:flex-start;line-height:1.4}
.vs-list li::before{font-family:var(--f-mono);font-weight:700;flex:none}
.vs-card.old .vs-list li::before{content:"\\00d7";color:var(--lane)}
.vs-card.new .vs-list li::before{content:"\\203a";color:var(--pulse)}

/* problem (pain list) */
.problem-card{border:1px solid rgba(20,23,28,.16);border-radius:var(--r-card);padding:clamp(24px,4vw,40px);color:var(--ink-soft)}
.problem-card h3{font-family:var(--f-mono);font-size:12.5px;text-transform:uppercase;letter-spacing:.14em;color:var(--lane);margin:0 0 18px}
.vs-list.pain{display:grid;gap:13px}
@media(min-width:680px){.vs-list.pain{grid-template-columns:1fr 1fr;gap:13px 30px}}
.problem-card .vs-list li::before{content:"\\00d7";color:var(--lane);font-family:var(--f-mono);font-weight:700;flex:none}

/* the loop (5 steps) */
.loop{display:grid;gap:1px;background:rgba(243,241,234,.12);border:1px solid rgba(243,241,234,.12);border-radius:var(--r-card);overflow:hidden;grid-template-columns:repeat(auto-fit,minmax(176px,1fr))}
.pri{background:var(--ink);padding:26px}
.pri .n{font-family:var(--f-mono);color:var(--pulse);font-size:12.5px;letter-spacing:.1em}
.pri h3{font-family:var(--f-display);font-weight:600;letter-spacing:var(--ls-display);font-size:19px;margin:12px 0 8px;color:var(--track)}
.pri p{margin:0;font-size:13.5px;color:var(--lane);line-height:1.5}

/* agent (thread + film) */
.agent-grid{display:grid;gap:clamp(24px,4vw,44px);align-items:center}
@media(min-width:860px){.agent-grid{grid-template-columns:minmax(0,360px) 1fr}}
.agent-grid .video-slot{max-width:420px;margin-inline:auto;width:100%}

/* proof */
.stat-row{display:grid;gap:22px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.stat-cell{text-align:center}
.stat{font-family:var(--f-display);font-weight:700;letter-spacing:var(--ls-display);font-size:clamp(34px,4.8vw,56px);line-height:1.04;color:var(--ink);white-space:nowrap}
.stat .unit{color:var(--distance)}
.stat-label{font-family:var(--f-mono);font-size:12.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--ink-soft);margin-top:10px;line-height:1.4}
.sec-dark .stat{color:var(--track)}
.sec-dark .stat .unit{color:var(--pulse)}
.sec-dark .stat-label{color:var(--lane)}

/* objections + trust */
.obj-grid{display:grid;gap:16px}
@media(min-width:760px){.obj-grid{grid-template-columns:1fr 1fr}}
.obj-card{background:var(--white);border:1px solid var(--track-deep);border-radius:var(--r-card);padding:24px}
.obj-card h3{font-family:var(--f-display);font-weight:600;letter-spacing:var(--ls-display);font-size:18px;margin:0 0 8px;color:var(--ink)}
.obj-card p{margin:0;font-size:15px;color:var(--ink-soft);line-height:1.5}
.trust{margin:clamp(28px,4vw,40px) auto 0;text-align:center;font-family:var(--f-mono);font-size:12.5px;letter-spacing:.04em;color:var(--lane);max-width:64ch}

/* final CTA */
.final-cta{max-width:760px;margin:0 auto;text-align:center}
.final-cta .eyebrow{justify-content:center;display:inline-flex}
.final-cta .r-h2{margin:16px auto 0;max-width:20ch}
.final-cta .r-cta{margin-top:26px;justify-content:center}

/* video slot */
.video-slot{position:relative;border-radius:var(--r-card);overflow:hidden;background:radial-gradient(120% 90% at 30% 15%,color-mix(in srgb,var(--distance) 30%,var(--ink)) 0%,var(--ink) 60%);border:1px solid rgba(243,241,234,.12);display:grid;place-items:center;isolation:isolate;box-shadow:0 50px 120px -50px rgba(0,0,0,.8)}
.video-slot.ar-16x9{aspect-ratio:16/9}
.video-slot.ar-9x16{aspect-ratio:9/16}
.video-slot video,.video-slot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1}
.video-slot::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,color-mix(in srgb,var(--pulse) 10%,transparent) 50%,transparent 65%);background-size:220% 100%;animation:sheen 6s var(--ease) infinite;z-index:-1}
@keyframes sheen{0%{background-position:140% 0}100%{background-position:-40% 0}}
@media(prefers-reduced-motion:reduce){.video-slot::after{animation:none}}
.video-slot__play{width:64px;height:64px;border-radius:50%;background:var(--pulse);display:grid;place-items:center;box-shadow:0 10px 40px rgba(0,0,0,.35);transition:transform .3s var(--ease)}
.video-slot:hover .video-slot__play{transform:scale(1.07)}
.video-slot__play svg{width:26px;height:26px}
.video-slot__cap{position:absolute;left:18px;bottom:16px;right:18px;font-family:var(--f-mono);font-size:12.5px;letter-spacing:.04em;color:var(--track);display:flex;align-items:center;gap:9px}
.video-slot__cap .rec{width:8px;height:8px;border-radius:50%;background:var(--pulse);box-shadow:0 0 0 4px color-mix(in srgb,var(--pulse) 25%,transparent);flex:none}
.video-slot__tag{position:absolute;top:14px;left:14px;font-family:var(--f-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);background:var(--pulse);padding:4px 9px;border-radius:var(--r-pill);z-index:1}

/* closing */
.foot-cta{background:var(--ink);color:var(--track);border-radius:24px;padding:clamp(40px,6vw,72px);text-align:center}
.foot-cta .eyebrow{justify-content:center;display:inline-flex}
.foot-cta .r-h2{margin:16px auto 0;max-width:18ch}
.foot-cta .r-cta{margin-top:26px}

/* footer */
.r-foot{background:var(--ink);border-top:1px solid rgba(243,241,234,.12);padding-block:40px;color:var(--lane);font-size:13.5px}
.r-foot-inner{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:18px}
.r-foot-links{display:flex;gap:18px}
.r-foot-links a:hover{color:var(--track)}
.r-foot-tag{font-family:var(--f-mono);font-size:12.5px;color:var(--lane)}
.r-switch{display:flex;align-items:center;gap:8px;font-family:var(--f-mono);font-size:12px}
.r-switch-label{text-transform:uppercase;letter-spacing:.12em;opacity:.65}
.r-switch a{padding:3px 9px;border-radius:var(--r-pill);border:1px solid rgba(243,241,234,.16);color:var(--lane)}
.r-switch a:hover{color:var(--track);border-color:var(--track)}
.r-switch a[aria-current=page]{background:var(--pulse);color:var(--ink);border-color:var(--pulse)}

/* reveal */
.reveal{opacity:0;transform:translateY(18px);transition:opacity var(--dur) var(--ease),transform var(--dur) var(--ease)}
.reveal.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none}}
`;
}

// ---------------------------------------------------------------------------
// CSS (self-contained; HSL token system mirrors the forms SSR pages)
// Used by the privacy page (shared shell).
// ---------------------------------------------------------------------------

function CSS(): string {
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:0 0% 100%;--fg:220 14% 11%;
  --muted:220 14% 96%;--muted-fg:220 8% 42%;
  --border:220 13% 91%;
  --card:0 0% 100%;
  --accent:221 83% 53%;--accent-fg:0 0% 100%;
  --radius:12px;
}
.dark{
  --bg:222 14% 5%;--fg:0 0% 95%;
  --muted:222 12% 9%;--muted-fg:220 9% 60%;
  --border:222 10% 14%;
  --card:222 13% 7%;
  --accent:217 91% 60%;--accent-fg:222 14% 5%;
}

html{font-family:"Inter",system-ui,-apple-system,sans-serif;font-feature-settings:"cv02","cv03","cv04","cv11";scroll-behavior:smooth}
body{background:hsl(var(--bg));color:hsl(var(--fg));min-height:100vh;-webkit-font-smoothing:antialiased;line-height:1.5}
a{color:inherit;text-decoration:none}

/* Nav */
.nav{display:flex;align-items:center;justify-content:space-between;max-width:1080px;margin:0 auto;padding:20px 24px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-0.02em}
.brand-mark{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:hsl(var(--accent));color:hsl(var(--accent-fg));font-size:13px;font-weight:800}
.brand-name{font-size:1rem}
.nav-right{display:flex;align-items:center;gap:14px}
.nav-link{font-size:0.875rem;color:hsl(var(--muted-fg));font-weight:500}
.nav-link:hover{color:hsl(var(--fg))}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;font-family:inherit;font-weight:500;font-size:0.875rem;border-radius:10px;padding:9px 16px;cursor:pointer;border:1px solid transparent;transition:opacity .15s,background .15s,border-color .15s;white-space:nowrap}
.btn-primary{background:hsl(var(--accent));color:hsl(var(--accent-fg))}
.btn-primary:hover{opacity:.9}
.btn-ghost{background:transparent;border-color:hsl(var(--border));color:hsl(var(--fg))}
.btn-ghost:hover{background:hsl(var(--muted))}
.btn-lg{padding:12px 22px;font-size:0.95rem;border-radius:11px}

.theme-toggle{background:transparent;border:1px solid hsl(var(--border));border-radius:9px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:hsl(var(--muted-fg))}
.theme-toggle:hover{background:hsl(var(--muted));color:hsl(var(--fg))}
.dark .icon-sun{display:none}.dark .icon-moon{display:block}
html:not(.dark) .icon-sun{display:block}html:not(.dark) .icon-moon{display:none}

/* Hero */
.hero{position:relative;overflow:hidden}
.hero::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 60% at 50% 0%,hsl(var(--accent)/0.14),transparent 70%);pointer-events:none}
.hero-inner{position:relative;max-width:760px;margin:0 auto;padding:72px 24px 56px;text-align:center}
.eyebrow{display:inline-block;font-size:0.78rem;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:hsl(var(--accent));background:hsl(var(--accent)/0.1);padding:5px 12px;border-radius:999px;margin-bottom:22px}
.hero h1{font-size:clamp(2rem,5vw,3.25rem);font-weight:800;line-height:1.08;letter-spacing:-0.03em;margin-bottom:20px}
.lede{font-size:clamp(1rem,2.2vw,1.2rem);color:hsl(var(--muted-fg));max-width:600px;margin:0 auto 32px}
.hero-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}

/* Features */
.features{max-width:1080px;margin:0 auto;padding:24px 24px 64px}
.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.card{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:var(--radius);padding:26px 24px}
.card-icon{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;background:hsl(var(--accent)/0.1);color:hsl(var(--accent));margin-bottom:16px}
.card h3{font-size:1.02rem;font-weight:600;letter-spacing:-0.01em;margin-bottom:8px}
.card p{font-size:0.9rem;color:hsl(var(--muted-fg));line-height:1.55}

/* CTA band */
.cta-band{border-top:1px solid hsl(var(--border));background:hsl(var(--muted)/0.4)}
.cta-inner{max-width:680px;margin:0 auto;padding:64px 24px;text-align:center}
.cta-inner h2{font-size:clamp(1.4rem,3vw,2rem);font-weight:700;letter-spacing:-0.02em;margin-bottom:12px}
.cta-inner p{color:hsl(var(--muted-fg));margin-bottom:26px;font-size:1rem}

/* Doc (privacy) */
.doc{max-width:760px;margin:0 auto;padding:24px 24px 72px}
.doc-inner h1{font-size:2rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:6px}
.doc-meta{color:hsl(var(--muted-fg));font-size:0.875rem;margin-bottom:28px}
.doc-inner h2{font-size:1.15rem;font-weight:600;letter-spacing:-0.01em;margin:30px 0 10px}
.doc-inner p{color:hsl(var(--fg)/0.88);margin-bottom:12px}
.doc-inner ul{margin:0 0 14px;padding-left:20px;display:flex;flex-direction:column;gap:8px}
.doc-inner li{color:hsl(var(--fg)/0.88)}
.doc-inner a{color:hsl(var(--accent));text-decoration:underline;text-underline-offset:2px}
.doc-inner a:hover{opacity:.85}
.doc-back{margin-top:36px;padding-top:20px;border-top:1px solid hsl(var(--border));font-size:0.9rem}

/* Footer */
.footer{border-top:1px solid hsl(var(--border))}
.footer-inner{max-width:1080px;margin:0 auto;padding:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:0.85rem;color:hsl(var(--muted-fg))}
.footer-links{display:flex;gap:18px}
.footer-links a:hover{color:hsl(var(--fg))}

@media(max-width:760px){
  .features-grid{grid-template-columns:1fr}
  .nav-cta{display:none}
  .hero-inner{padding:52px 20px 40px}
}
`;
}
