/**
 * Localized homepage content for RunStudio — one entry per market.
 *
 * Built from docs/brand book/homepage-concepts/HomepageBriefs/*. Each market
 * keeps the same on-brand spine (run = operate + move, the software disappears,
 * the agent is a colleague, proof over promise) and the same 7-section skeleton
 * (hero → problem → how-it-works loop → agent thread → proof → objections →
 * final CTA), but adapts emphasis, currency, language, and trust signals.
 *
 *   uk — English. Boldest promise; the full loop is the lean-in. Month-to-month.
 *   us — English. Consolidation / ROI; "stop duct-taping six tools". Demo-led.
 *   fr — Français natif. Pain agrégateurs d'abord, puis RGPD/SEPA/NF525.
 *   de — Deutsch muttersprachlich. Aggregator-Unabhängigkeit, DSGVO/EU-Hosting.
 *
 * Brand name "RunStudio" stays English in every market. h1 strings carry inline
 * markup (<span class="verb">…</span>) and are injected as trusted HTML; every
 * other field is plain text and gets escaped by the renderer.
 */

export type LocaleCode = "uk" | "us" | "fr" | "de";

export interface NavLink {
  label: string;
  href: string;
}
export interface LoopStep {
  k: string;
  title: string;
  body: string;
}
export interface Bubble {
  who: "agent" | "user";
  text: string;
  time: string;
}
export interface QA {
  q: string;
  a: string;
}
export interface Stat {
  value: string;
  label: string;
}

export interface LocaleContent {
  code: LocaleCode;
  lang: string;
  label: string;
  path: string;
  metaTitle: string;
  metaDescription: string;
  ctaHref: string;
  nav: { links: NavLink[]; cta: string };
  hero: {
    eyebrow: string;
    h1: string; // trusted HTML
    lead: string;
    cta: string;
    ctaSecondary: string;
    note: string;
  };
  problem: { eyebrow: string; h2: string; heading: string; points: string[] };
  loop: { eyebrow: string; h2: string; lead: string; steps: LoopStep[] };
  agent: {
    eyebrow: string;
    h2: string;
    lead: string;
    phoneWho: string;
    phoneStatus: string;
    dayTag: string;
    bubbles: Bubble[];
    videoTag: string;
    videoCaption: string;
  };
  proof: { eyebrow: string; h2: string; stats: Stat[] };
  objections: { eyebrow: string; h2: string; items: QA[]; trust: string };
  finalCta: { eyebrow: string; h2: string; cta: string; ctaSecondary: string };
  footer: {
    privacy: string;
    contact: string;
    tagline: string;
    switchLabel: string;
  };
}

const CONTACT = "patrickabcross@outlook.com";

// ─── UNITED KINGDOM ──────────────────────────────────────────────────────────
const uk: LocaleContent = {
  code: "uk",
  lang: "en-GB",
  label: "UK",
  path: "/uk",
  metaTitle: "RunStudio — You teach. Your AI runs everything else.",
  metaDescription:
    "An AI that runs your studio — works your leads, fills your classes, makes and posts your content, and reports back on WhatsApp. You just teach.",
  ctaHref: "/gymos",
  nav: {
    links: [
      { label: "The problem", href: "#problem" },
      { label: "How it runs", href: "#how" },
      { label: "The agent", href: "#agent" },
      { label: "Proof", href: "#proof" },
    ],
    cta: "Run my studio",
  },
  hero: {
    eyebrow: "An AI that runs your studio",
    h1: 'Run your studio.<br>Let it <span class="verb">run</span> itself.',
    lead: "Your RunStudio works your leads, wins back lapsed members, fills your classes, makes and posts your content, and reports back on WhatsApp. You just teach.",
    cta: "Run my studio",
    ctaSecondary: "See it run",
    note: "Month-to-month · live in a week",
  },
  problem: {
    eyebrow: "The problem",
    h2: "You're teaching all day. The marketing never gets done.",
    heading: "Running it yourself",
    points: [
      "You're on TeamUp or Glofox — and still doing the work the software was meant to do.",
      "Leads sit in your DMs unanswered while you're on the floor.",
      "Lapsed members drift off, and no one follows up.",
      "Quiet 6am classes you never got round to promoting.",
      "The content calendar has been 'next week' for months.",
    ],
  },
  loop: {
    eyebrow: "How it runs",
    h2: "One loop. Run end to end.",
    lead: "Set it up once. From then on your RunStudio runs the whole loop — and the software disappears.",
    steps: [
      {
        k: "01",
        title: "Content",
        body: "It writes and designs your posts, emails and class promos — in your voice.",
      },
      {
        k: "02",
        title: "Distribution",
        body: "It posts them where your members are, on schedule, without you.",
      },
      {
        k: "03",
        title: "Conversion",
        body: "It answers every DM and enquiry, qualifies the lead, and books them in.",
      },
      {
        k: "04",
        title: "Booking",
        body: "Classes, waitlists, payments and passes — handled the moment they happen.",
      },
      {
        k: "05",
        title: "Back-office",
        body: "Renewals, win-backs and no-show follow-ups, quietly run in the background.",
      },
    ],
  },
  agent: {
    eyebrow: "The agent, in action",
    h2: "A colleague, not a chatbot.",
    lead: "Specific, accountable and low-drama — it reports to you on WhatsApp, the way a great ops manager would. Read the thread: that's the actual voice.",
    phoneWho: "Your RunStudio",
    phoneStatus: "online · reporting",
    dayTag: "Today · 6:12pm",
    bubbles: [
      { who: "agent", text: "Here's what I did today.", time: "6:12 PM" },
      {
        who: "agent",
        text: "Filled your 6am. Two on the waitlist.",
        time: "6:12 PM",
      },
      {
        who: "agent",
        text: "Won back Maya — she rebooked the Friday class she dropped.",
        time: "6:12 PM",
      },
      {
        who: "agent",
        text: "Recovered £340 in lapsed passes this week.",
        time: "6:13 PM",
      },
      { who: "user", text: "love it. add a Saturday 9am?", time: "6:15 PM" },
      {
        who: "agent",
        text: "Done. It's live and already has one booking.",
        time: "6:15 PM",
      },
    ],
    videoTag: "AI film · 9:16",
    videoCaption: "A day run by your studio · 0:58",
  },
  proof: {
    eyebrow: "Proof over promise",
    h2: "Numbers, not adjectives.",
    stats: [
      { value: "£2,840", label: "recovered / month" },
      { value: "94%", label: "classes filled" },
      { value: "7h", label: "admin saved / week" },
      { value: "38", label: "DMs answered / day" },
    ],
  },
  objections: {
    eyebrow: "The honest bit",
    h2: "The questions you're actually asking.",
    items: [
      {
        q: "Will it sound like me?",
        a: "Read the thread above — that's the real voice. It learns yours, and you approve anything that goes out.",
      },
      {
        q: "I'm already on TeamUp / Glofox.",
        a: "Keep them if you like. RunStudio runs the loop they don't have — content, conversion and follow-up. Switching is painless when you're ready.",
      },
      {
        q: "Locked in?",
        a: "No. Month-to-month. If it isn't running your studio, you leave.",
      },
    ],
    trust:
      "UK cards & Direct Debit via Stripe · GDPR / UK data handling · Built for UK studios",
  },
  finalCta: {
    eyebrow: "Ready when you are",
    h2: "Run your studio. Let it run itself.",
    cta: "Run my studio",
    ctaSecondary: "See it run",
  },
  footer: {
    privacy: "Privacy policy",
    contact: "Contact",
    tagline: "You teach. Your AI runs everything else.",
    switchLabel: "Market",
  },
};

// ─── UNITED STATES ───────────────────────────────────────────────────────────
const us: LocaleContent = {
  code: "us",
  lang: "en-US",
  label: "US",
  path: "/us",
  metaTitle: "RunStudio — One AI runs your whole studio. You just teach.",
  metaDescription:
    "Your booking software, your marketing, your content, your front desk — run by one agent. Stop duct-taping six tools together.",
  ctaHref: `mailto:${CONTACT}?subject=RunStudio%20demo`,
  nav: {
    links: [
      { label: "The problem", href: "#problem" },
      { label: "How it works", href: "#how" },
      { label: "The agent", href: "#agent" },
      { label: "Proof", href: "#proof" },
    ],
    cta: "Get a demo",
  },
  hero: {
    eyebrow: "One AI runs your whole studio",
    h1: 'One AI <span class="verb">runs</span> your whole studio.<br>You just teach.',
    lead: "Your booking software, your marketing, your content, your front desk — run by one agent. Stop duct-taping six tools together.",
    cta: "Get a demo",
    ctaSecondary: "See it run",
    note: "Replaces your booking + marketing + content stack",
  },
  problem: {
    eyebrow: "The problem",
    h2: "You're running a stack of tools. None of them talk.",
    heading: "The six-tool tax",
    points: [
      "Mindbody or Mariana Tek for booking, a social tool, an agency, ClassPass skimming your members.",
      "Six logins, five bills — and the work still lands on you.",
      "Everyone sells you 'AI': a bolt-on receptionist that does one slice of the job.",
      "Leads come from every channel, with no single place that converts them.",
      "Content and social: outsourced, expensive, off-brand — or just not happening.",
    ],
  },
  loop: {
    eyebrow: "How it works",
    h2: "One agent. The whole operating loop.",
    lead: "Not a bolt-on receptionist. RunStudio runs the entire loop — and replaces the stack you're paying for.",
    steps: [
      {
        k: "01",
        title: "Content",
        body: "It creates your posts, emails and promos — on-brand, in your voice.",
      },
      {
        k: "02",
        title: "Distribution",
        body: "It publishes to your channels on schedule. No agency, no calendar to keep.",
      },
      {
        k: "03",
        title: "Conversion",
        body: "It answers every inquiry, qualifies the lead, and books the class.",
      },
      {
        k: "04",
        title: "Booking",
        body: "Scheduling, waitlists, payments and passes — handled in real time.",
      },
      {
        k: "05",
        title: "Back-office",
        body: "Renewals, win-backs and no-show follow-up, run automatically.",
      },
    ],
  },
  agent: {
    eyebrow: "The agent, in action",
    h2: "A colleague, not a bot.",
    lead: "Specific, accountable and low-drama — it reports to you on WhatsApp, the way your best front-desk manager would. The voice is the proof.",
    phoneWho: "Your RunStudio",
    phoneStatus: "online · reporting",
    dayTag: "Today · 6:12pm",
    bubbles: [
      { who: "agent", text: "Here's what I did today.", time: "6:12 PM" },
      {
        who: "agent",
        text: "Filled your 6am. Two on the waitlist.",
        time: "6:12 PM",
      },
      {
        who: "agent",
        text: "Won back Maya — she rebooked the Friday class she dropped.",
        time: "6:12 PM",
      },
      {
        who: "agent",
        text: "Recovered $410 in lapsed packs this week.",
        time: "6:13 PM",
      },
      { who: "user", text: "love it. add a Saturday 9am?", time: "6:15 PM" },
      {
        who: "agent",
        text: "Done. It's live and already has one booking.",
        time: "6:15 PM",
      },
    ],
    videoTag: "AI film · 9:16",
    videoCaption: "A day run by your studio · 0:58",
  },
  proof: {
    eyebrow: "Proof over promise",
    h2: "ROI, not adjectives.",
    stats: [
      { value: "$3,600", label: "revenue recovered / month" },
      { value: "11h", label: "owner hours saved / week" },
      { value: "5", label: "tools replaced" },
      { value: "94%", label: "classes filled" },
    ],
  },
  objections: {
    eyebrow: "Straight answers",
    h2: "How it's different.",
    items: [
      {
        q: "How is this different from Momence AI or WellnessLiving CAASI?",
        a: "Those are bolt-on receptionists. RunStudio runs the whole loop — including making and posting your content, which they don't touch.",
      },
      {
        q: "I'm on Mindbody / Mariana Tek.",
        a: "We consolidate them. Migration is part of onboarding — your data, your members, your history come across.",
      },
      {
        q: "Price?",
        a: "Compare it to the combined cost of your booking platform + marketing tool + content agency + front desk. It replaces the stack.",
      },
    ],
    trust:
      "US embedded payments via Stripe · Migration done for you · Built for boutique studios",
  },
  finalCta: {
    eyebrow: "See it run",
    h2: "One AI runs your whole studio. You just teach.",
    cta: "Get a demo",
    ctaSecondary: "See it run",
  },
  footer: {
    privacy: "Privacy policy",
    contact: "Contact",
    tagline: "One AI runs your whole studio. You just teach.",
    switchLabel: "Market",
  },
};

// ─── FRANCE ──────────────────────────────────────────────────────────────────
const fr: LocaleContent = {
  code: "fr",
  lang: "fr-FR",
  label: "FR",
  path: "/fr",
  metaTitle: "RunStudio — Vous enseignez. Votre IA fait tourner tout le reste.",
  metaDescription:
    "Reprenez le contrôle de vos membres. Votre IA gère vos prospects, remplit vos cours, crée et publie vos contenus, et vous fait un point chaque jour sur WhatsApp.",
  ctaHref: "/gymos",
  nav: {
    links: [
      { label: "Le problème", href: "#problem" },
      { label: "Comment ça marche", href: "#how" },
      { label: "L'agent", href: "#agent" },
      { label: "Preuves", href: "#proof" },
    ],
    cta: "Faire tourner mon studio",
  },
  hero: {
    eyebrow: "Une IA qui fait tourner votre studio",
    h1: 'Reprenez le contrôle de vos membres.<br>Votre IA <span class="verb">fait tourner</span> tout le reste.',
    lead: "Votre RunStudio gère vos prospects, récupère vos membres inactifs, remplit vos cours, crée et publie vos contenus, et vous fait un point chaque jour sur WhatsApp. Vous, vous enseignez.",
    cta: "Faire tourner mon studio",
    ctaSecondary: "Voir RunStudio en action",
    note: "Sans engagement · opérationnel en une semaine",
  },
  problem: {
    eyebrow: "Le problème",
    h2: "Vous travaillez pour les agrégateurs, pas pour vous.",
    heading: "Le faire soi-même",
    points: [
      "Urban Sports Club, Wellhub, ClassPass : des visites payées une misère, des membres qui ne sont pas vraiment les vôtres.",
      "Un logiciel (Deciplus, Resamania, bsport…) que vous payez mais sous-exploitez.",
      "Des prospects qui dorment dans vos messages pendant que vous enseignez.",
      "Des membres inactifs que personne ne relance.",
      "Du contenu à publier… qui ne sort jamais.",
    ],
  },
  loop: {
    eyebrow: "Comment ça marche",
    h2: "Une seule boucle, gérée de bout en bout.",
    lead: "Configurez une fois. Ensuite, votre RunStudio fait tourner toute la boucle — et le logiciel s'efface.",
    steps: [
      {
        k: "01",
        title: "Contenu",
        body: "Elle rédige et conçoit vos posts, e-mails et promos de cours — dans votre voix.",
      },
      {
        k: "02",
        title: "Diffusion",
        body: "Elle les publie au bon moment, là où sont vos membres, sans vous.",
      },
      {
        k: "03",
        title: "Conversion",
        body: "Elle répond à chaque message, qualifie le prospect et le réserve.",
      },
      {
        k: "04",
        title: "Réservation",
        body: "Cours, listes d'attente, paiements et cartes — gérés en temps réel.",
      },
      {
        k: "05",
        title: "Back-office",
        body: "Renouvellements, réactivations et relances d'absents — en arrière-plan.",
      },
    ],
  },
  agent: {
    eyebrow: "L'agent en action",
    h2: "Un collègue, pas un chatbot.",
    lead: "Précis, responsable, sans esbroufe — il vous rend compte sur WhatsApp, comme le ferait un excellent responsable d'exploitation. Lisez le fil : c'est la vraie voix.",
    phoneWho: "Votre RunStudio",
    phoneStatus: "en ligne · rapport",
    dayTag: "Aujourd'hui · 18h12",
    bubbles: [
      {
        who: "agent",
        text: "Voici ce que j'ai fait aujourd'hui.",
        time: "18:12",
      },
      {
        who: "agent",
        text: "J'ai rempli votre cours de 6h. Deux personnes en liste d'attente.",
        time: "18:12",
      },
      {
        who: "agent",
        text: "J'ai récupéré Maya — elle a repris le cours du vendredi qu'elle avait laissé.",
        time: "18:12",
      },
      {
        who: "agent",
        text: "340 € de cartes expirées récupérés cette semaine.",
        time: "18:13",
      },
      {
        who: "user",
        text: "super. tu ajoutes un cours samedi 9h ?",
        time: "18:15",
      },
      {
        who: "agent",
        text: "C'est fait. Il est en ligne et a déjà une réservation.",
        time: "18:15",
      },
    ],
    videoTag: "Film IA · 9:16",
    videoCaption: "Une journée gérée par votre studio · 0:58",
  },
  proof: {
    eyebrow: "La preuve avant la promesse",
    h2: "Des chiffres, pas des adjectifs.",
    stats: [
      { value: "2 840 €", label: "récupérés / mois" },
      { value: "94 %", label: "de cours remplis" },
      { value: "7 h", label: "d'administratif gagnées / semaine" },
      { value: "38", label: "messages traités / jour" },
    ],
  },
  objections: {
    eyebrow: "Les vraies questions",
    h2: "Ce que vous vous demandez, vraiment.",
    items: [
      {
        q: "Mes données sont-elles en sécurité, en Europe ?",
        a: "Oui. RGPD et hébergement en UE. Vos données restent les vôtres.",
      },
      {
        q: "Prélèvement SEPA ?",
        a: "Oui — c'est le moyen de paiement attendu, intégré nativement.",
      },
      {
        q: "Conforme NF525 ?",
        a: "Conçu pour la conformité NF525 (norme ISCA), attestation éditeur fournie.",
      },
      {
        q: "Engagement sur 12 mois ?",
        a: "Non. Sans engagement. Si RunStudio ne fait pas tourner votre studio, vous partez.",
      },
    ],
    trust:
      "RGPD · hébergement UE · SEPA · NF525 (attestation éditeur) · support en français",
  },
  finalCta: {
    eyebrow: "Quand vous voulez",
    h2: "Vous enseignez. Votre IA fait tourner tout le reste.",
    cta: "Faire tourner mon studio",
    ctaSecondary: "Voir RunStudio en action",
  },
  footer: {
    privacy: "Confidentialité",
    contact: "Contact",
    tagline: "Vous enseignez. Votre IA fait tourner tout le reste.",
    switchLabel: "Marché",
  },
};

// ─── DEUTSCHLAND ─────────────────────────────────────────────────────────────
const de: LocaleContent = {
  code: "de",
  lang: "de-DE",
  label: "DE",
  path: "/de",
  metaTitle: "RunStudio — Sie unterrichten. Ihre KI macht den Rest.",
  metaDescription:
    "Gewinnen Sie Ihre Mitglieder zurück — und behalten Sie Ihre Marge. Ihre KI bearbeitet Leads, füllt Kurse, erstellt und postet Inhalte und meldet sich täglich per WhatsApp.",
  ctaHref: `mailto:${CONTACT}?subject=RunStudio%20Demo`,
  nav: {
    links: [
      { label: "Das Problem", href: "#problem" },
      { label: "So funktioniert's", href: "#how" },
      { label: "Der Agent", href: "#agent" },
      { label: "Belege", href: "#proof" },
    ],
    cta: "Demo anfragen",
  },
  hero: {
    eyebrow: "Eine KI, die Ihr Studio betreibt",
    h1: 'Gewinnen Sie Ihre Mitglieder zurück.<br>Ihre KI bringt Ihr Studio zum <span class="verb">Laufen</span>.',
    lead: "Ihr RunStudio bearbeitet Ihre Leads, gewinnt inaktive Mitglieder zurück, füllt Ihre Kurse, erstellt und postet Ihre Inhalte — und meldet sich täglich per WhatsApp. Sie unterrichten.",
    cta: "Demo anfragen",
    ctaSecondary: "RunStudio in Aktion sehen",
    note: "Keine Vertragsbindung · in einer Woche startklar",
  },
  problem: {
    eyebrow: "Das Problem",
    h2: "Sie arbeiten für die Aggregatoren — nicht für sich.",
    heading: "Alles selbst machen",
    points: [
      "Urban Sports Club (Wellhub), EGYM Wellpass: niedrige Auszahlungen pro Besuch, Mitglieder, die nicht wirklich Ihre sind.",
      "Eine Software (Magicline, Eversports…), die Sie bezahlen, aber kaum nutzen.",
      "Leads, die in Ihren Nachrichten liegen, während Sie unterrichten.",
      "Inaktive Mitglieder, die niemand zurückholt.",
      "Inhalte, die gepostet werden sollten — und nie erscheinen.",
    ],
  },
  loop: {
    eyebrow: "So funktioniert's",
    h2: "Eine Schleife. Vollständig betrieben.",
    lead: "Einmal einrichten. Danach bringt Ihr RunStudio die ganze Schleife zum Laufen — und die Software verschwindet.",
    steps: [
      {
        k: "01",
        title: "Content",
        body: "Sie schreibt und gestaltet Ihre Posts, E-Mails und Kursaktionen — in Ihrer Stimme.",
      },
      {
        k: "02",
        title: "Verbreitung",
        body: "Sie postet zur richtigen Zeit dort, wo Ihre Mitglieder sind — ohne Sie.",
      },
      {
        k: "03",
        title: "Konvertierung",
        body: "Sie beantwortet jede Nachricht, qualifiziert den Lead und bucht ihn ein.",
      },
      {
        k: "04",
        title: "Buchung",
        body: "Kurse, Wartelisten, Zahlungen und Karten — in Echtzeit erledigt.",
      },
      {
        k: "05",
        title: "Back-Office",
        body: "Verlängerungen, Reaktivierungen und No-Show-Nachfassen — im Hintergrund.",
      },
    ],
  },
  agent: {
    eyebrow: "Der Agent in Aktion",
    h2: "Ein Kollege, kein Chatbot.",
    lead: "Konkret, verantwortlich, unaufgeregt — und meldet sich per WhatsApp, wie es ein exzellenter Betriebsleiter täte. Der Verlauf ist der Beweis.",
    phoneWho: "Ihr RunStudio",
    phoneStatus: "online · meldet",
    dayTag: "Heute · 18:12",
    bubbles: [
      { who: "agent", text: "Das habe ich heute erledigt.", time: "18:12" },
      {
        who: "agent",
        text: "Ihren 6-Uhr-Kurs gefüllt. Zwei auf der Warteliste.",
        time: "18:12",
      },
      {
        who: "agent",
        text: "Maya zurückgewonnen — sie hat den Freitagskurs wieder gebucht.",
        time: "18:12",
      },
      {
        who: "agent",
        text: "340 € aus abgelaufenen Karten diese Woche zurückgeholt.",
        time: "18:13",
      },
      { who: "user", text: "super. füge samstags 9 Uhr hinzu?", time: "18:15" },
      {
        who: "agent",
        text: "Erledigt. Ist online und hat schon eine Buchung.",
        time: "18:15",
      },
    ],
    videoTag: "KI-Film · 9:16",
    videoCaption: "Ein Tag, betrieben von Ihrem Studio · 0:58",
  },
  proof: {
    eyebrow: "Beweis vor Versprechen",
    h2: "Zahlen, keine Adjektive.",
    stats: [
      { value: "2.840 €", label: "zurückgewonnen / Monat" },
      { value: "94 %", label: "Kurse gefüllt" },
      { value: "7 Std.", label: "Verwaltung gespart / Woche" },
      { value: "38", label: "Nachrichten bearbeitet / Tag" },
    ],
  },
  objections: {
    eyebrow: "Die ehrlichen Fragen",
    h2: "Was Sie wirklich wissen wollen.",
    items: [
      {
        q: "Wo liegen meine Daten?",
        a: "DSGVO-konform, gehostet in der EU. Ihre Daten bleiben Ihre.",
      },
      { q: "Deutschsprachiger Support?", a: "Ja, auf Deutsch." },
      {
        q: "SEPA-Lastschrift?",
        a: "Ja — der erwartete Standard, nativ integriert.",
      },
      {
        q: "Was unterscheidet das von Magicline / Eversports?",
        a: "Die integrierte Schleife — Content-Erstellung, Social und KI-Konvertierung — die keiner von ihnen bietet.",
      },
    ],
    trust: "DSGVO · EU-Hosting · SEPA · deutschsprachiger Support",
  },
  finalCta: {
    eyebrow: "Wann immer Sie bereit sind",
    h2: "Sie unterrichten. Ihre KI macht den Rest.",
    cta: "Demo anfragen",
    ctaSecondary: "RunStudio in Aktion sehen",
  },
  footer: {
    privacy: "Datenschutz",
    contact: "Kontakt",
    tagline: "Sie unterrichten. Ihre KI macht den Rest.",
    switchLabel: "Markt",
  },
};

export const LOCALES: Record<LocaleCode, LocaleContent> = { uk, us, fr, de };
export const LOCALE_ORDER: LocaleCode[] = ["uk", "us", "fr", "de"];
