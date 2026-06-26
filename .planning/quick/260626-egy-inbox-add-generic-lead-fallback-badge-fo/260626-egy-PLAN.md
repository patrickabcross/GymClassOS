---
phase: quick-260626-egy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/staff-web/app/routes/gymos.messages.tsx
autonomous: true
requirements: [INBX-MERGE-01]
must_haves:
  truths:
    - "A lead conversation with no resolved source (no whatsapp_opt_in row, no form_submission) renders a visible badge labelled 'Lead'"
    - "Member (non-lead) rows still render NO source badge"
    - "Leads with a resolved source (Form / WhatsApp / Imported / Meta ad) still render their existing specific badge unchanged"
    - "TypeScript compiles clean (tsc)"
  artifacts:
    - path: "apps/staff-web/app/routes/gymos.messages.tsx"
      provides: "Generic 'Lead' fallback badge + sourceIcon case + IconUserPlus import"
      contains: "case \"lead\""
  key_links:
    - from: "loader leadSource map"
      to: "badge JSX render block (~line 1047)"
      via: "c.leadSource = { type: 'lead', label: 'Lead' } fallback flows to existing .type/.label reader"
      pattern: "type: \"lead\", label: \"Lead\""
---

<objective>
Add a generic "Lead" fallback badge in the staff inbox for lead conversations that have no resolved source, so source-less leads (e.g. the "Diag Test" rows) are visually distinguishable from member rows instead of appearing identical.

Purpose: Currently a lead with no `whatsapp_opt_in` row AND no `form_submission` resolves `leadSource` to `null`, so no badge renders and the lead looks like a member. Operators can't tell at a glance that the row is a lead.

Output: Single-file change to `apps/staff-web/app/routes/gymos.messages.tsx` — a fallback in the existing loader map plus an explicit `sourceIcon()` case and its icon import. No schema migration, no new query.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Root + app conventions already loaded by the executor via CLAUDE.md → AGENTS.md:
- Tabler icons only (no emojis as icons)
- TypeScript everywhere; keep tsc clean
- No schema migrations for this change (purely a fallback in an existing in-memory map)

<interfaces>
<!-- Extracted from apps/staff-web/app/routes/gymos.messages.tsx — executor needs no further exploration. -->

Line 221 — sourceMap type (the fallback object MUST conform to this shape):
```ts
const sourceMap: Record<string, { type: string; label: string }> = {};
```
The fallback `{ type: "lead", label: "Lead" }` matches `{ type: string; label: string }` exactly — no type widening or union issue.

Lines 54-58 — current Tabler icon imports (IconUserPlus is NOT among them, MUST be added):
```ts
  IconUser,
  IconForms,
  IconUpload,
  IconBrandWhatsapp,
  IconBrandMeta,
```

Lines 284-289 — the loader map to change:
```ts
  // Attach leadSource to each conversation row.
  const conversations = conversationsRows.map((c) => ({
    ...c,
    leadSource:
      c.status === "lead" ? (sourceMap[c.id] ?? null) : (null as null),
  }));
```

Lines 913-927 — the sourceIcon() switch to extend:
```ts
// INBX-MERGE-01: map lead source type → Tabler icon component
function sourceIcon(type: string) {
  switch (type) {
    case "form_submission":
      return IconForms;
    case "import":
      return IconUpload;
    case "inbound_reply":
      return IconBrandWhatsapp;
    case "meta_lead_ads":
      return IconBrandMeta;
    default:
      return IconUser;
  }
}
```

Lines 1047-1062 — the render block (NO change needed; reads `.type` and `.label` generically):
```tsx
{c.leadSource &&
  (() => {
    const SrcIcon = sourceIcon(c.leadSource.type);
    return (
      <Badge variant="secondary" className="...">
        <SrcIcon size={10} aria-hidden />
        <span className="max-w-[140px] truncate">{c.leadSource.label}</span>
      </Badge>
    );
  })()}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add generic "Lead" fallback badge for source-less leads</name>
  <files>apps/staff-web/app/routes/gymos.messages.tsx</files>
  <action>
    Three edits in this single file (per INBX-MERGE-01). Members (non-lead) MUST stay null — no badge.

    1. Loader fallback (lines ~287-288). Change the lead branch so a lead with no resolved source falls back to a generic Lead descriptor instead of null:
       From:
         leadSource:
           c.status === "lead" ? (sourceMap[c.id] ?? null) : (null as null),
       To:
         leadSource:
           c.status === "lead"
             ? (sourceMap[c.id] ?? { type: "lead", label: "Lead" })
             : (null as null),
       This keeps the non-lead branch returning null (no badge for members). The fallback object conforms to sourceMap's `{ type: string; label: string }` type — no tsc widening issue.

    2. Icon import (lines ~54-58). Add `IconUserPlus,` to the existing @tabler/icons-react named-import block (a lead = a prospective member). Place it alphabetically near the other Icon* entries. Confirm it is not already imported (it is not — only IconUser, IconForms, IconUpload, IconBrandWhatsapp, IconBrandMeta exist).

    3. sourceIcon() case (lines ~914-927). Add an explicit case above `default`:
         case "lead":
           return IconUserPlus;
       This gives the fallback badge a distinct icon (the existing `default: IconUser` would otherwise apply, but an explicit case is clearer and visually distinguishes a generic lead from the member-profile IconUser used elsewhere).

    Do NOT touch the badge render JSX block (~lines 1047-1062) — it already reads `c.leadSource.type` / `.label` generically and handles the new shape.
    Do NOT add a migration or new query — this is purely an in-memory fallback.
    Run `npx prettier --write apps/staff-web/app/routes/gymos.messages.tsx` after editing (project convention).
  </action>
  <verify>
    <automated>cd apps/staff-web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "gymos.messages" || echo "TSC CLEAN for gymos.messages.tsx"</automated>
  </verify>
  <done>
    - Lead conversations with no source resolve `leadSource` to `{ type: "lead", label: "Lead" }` (visible badge), members stay null (no badge).
    - `IconUserPlus` is imported and returned by `sourceIcon("lead")`.
    - `npx tsc --noEmit` reports no new errors referencing gymos.messages.tsx.
  </done>
</task>

</tasks>

<verification>
- A source-less lead row (e.g. "Diag Test") shows a secondary badge reading "Lead" with the IconUserPlus glyph.
- Member (non-lead) rows show no badge.
- Leads with a resolved source still show their existing specific badge (Form / WhatsApp / Imported / Meta ad) — unchanged.
- `npx tsc --noEmit` is clean (no new errors from this file).
</verification>

<success_criteria>
- Single-file change to apps/staff-web/app/routes/gymos.messages.tsx.
- No schema migration, no new query added.
- Tabler icons only (IconUserPlus) — no emoji.
- tsc passes.
</success_criteria>

<output>
After completion, create `.planning/quick/260626-egy-inbox-add-generic-lead-fallback-badge-fo/260626-egy-SUMMARY.md`
</output>
