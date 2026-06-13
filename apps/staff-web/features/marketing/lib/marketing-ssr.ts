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
 * CONTENT IS PLATFORM-BRANDED ("GymClassOS") per the product owner's choice.
 */

import { getMethod, type H3Event } from "h3";

// ---------------------------------------------------------------------------
// Static site facts (single source of truth for both pages)
// ---------------------------------------------------------------------------

const SITE = {
  name: "GymClassOS",
  tagline: "Run your studio's entire day from one inbox-and-schedule surface.",
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

export function renderHomePage(event: H3Event): Response {
  return htmlResponse(event, homePage());
}

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
    <span class="brand-mark">GC</span>
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

function featureCard(icon: string, title: string, body: string): string {
  return `<div class="card">
    <div class="card-icon">${icon}</div>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
  </div>`;
}

function homePage(): string {
  // Inline Tabler-style stroke icons (no emoji-as-icon per conventions).
  const iconChat = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9h8"/><path d="M8 13h6"/><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-5l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"/></svg>`;
  const iconCalendar = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M11 15h1v3"/></svg>`;
  const iconDevice = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M11 5h2"/><path d="M12 17v.01"/></svg>`;

  const body = `${header()}
<main>
  <section class="hero">
    <div class="hero-inner">
      <p class="eyebrow">Boutique fitness studio OS</p>
      <h1>${escapeHtml(SITE.tagline)}</h1>
      <p class="lede">${escapeHtml(SITE.name)} brings WhatsApp conversations, class bookings, and member context together on one screen — so coaches and studio managers stop cobbling together separate messaging, calendar, and CRM tools.</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="${SITE.appPath}">Open the app</a>
        <a class="btn btn-ghost btn-lg" href="/privacy">Read our privacy policy</a>
      </div>
    </div>
  </section>

  <section class="features">
    <div class="features-grid">
      ${featureCard(iconChat, "WhatsApp inbox with context", "Every member conversation sits next to their bookings, pass balance, and history — reply in the moment without switching apps.")}
      ${featureCard(iconCalendar, "Schedule, bookings & passes", "Run the class timetable, manage capacity and bookings, and track pass credits and renewals from one schedule.")}
      ${featureCard(iconDevice, "Members on mobile", "Members book, pay, and log activity from the studio's existing app — including a calorie counter and coaching assistant.")}
    </div>
  </section>

  <section class="cta-band">
    <div class="cta-inner">
      <h2>One surface for your studio's day</h2>
      <p>Coaches run the inbox and schedule; members self-serve on mobile. Payments are handled securely by Stripe.</p>
      <a class="btn btn-primary btn-lg" href="${SITE.appPath}">Open the app</a>
    </div>
  </section>
</main>
${footer()}`;

  return shell({
    title: `${SITE.name} — boutique fitness studio operating system`,
    description: SITE.tagline,
    body,
  });
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
// CSS (self-contained; HSL token system mirrors the forms SSR pages)
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
