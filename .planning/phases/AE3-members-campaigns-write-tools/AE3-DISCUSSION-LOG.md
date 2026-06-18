# Phase AE3: Members + Campaigns Write Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** AE3-members-campaigns-write-tools
**Areas discussed:** Segment storage, Builder UX, At-risk fate, Phone input

---

## Segment storage

| Option | Description | Selected |
|--------|-------------|----------|
| application_state | Store each named segment as a filter-spec row in the framework's application_state table (UI + agent read/write). Honors "no schema change", survives reload, canonical agent-native pattern. | ✓ |
| New campaign_segments table | A proper domain table. Cleaner long-term but VIOLATES the locked "no schema changes" v1.2 constraint. | |
| Ephemeral React state only | Segment lives only in the page session. Simplest, but would NOT survive a reload — weakly satisfies success criterion 6. | |

**User's choice:** application_state (Recommended)
**Notes:** Reference pattern already exists — `suggest-template-vars.ts` writes to application_state.

---

## Builder UX

| Option | Description | Selected |
|--------|-------------|----------|
| Structured controls + agent | Inline filter controls for the 3 locked axes (# classes attended, recency, lead date), composable with AND. Agent writes the same spec via a save-segment action. UI + agent in sync. | ✓ |
| Natural-language box only | Coach types a description; agent parses it. No structured controls. Less discoverable, harder to tweak one filter. | |
| Structured controls only | UI controls but no agent segment-build tool. Contradicts success criterion 6 — not viable alone. | |

**User's choice:** Structured controls + agent (Recommended)
**Notes:** Both exposures mandatory for agent-native parity.

---

## At-risk fate

| Option | Description | Selected |
|--------|-------------|----------|
| Becomes a built-in preset | Keep at-risk's exact criteria (14d inactive OR 0 bookings/30d OR pass expiring) as a preset that pre-fills the builder, alongside custom segments. Nothing lost. | ✓ |
| Remove entirely | Delete the hardcoded at-risk segment; coaches rebuild equivalent filters manually. Loses the curated churn-outreach default already wired to send. | |

**User's choice:** Becomes a built-in preset (Recommended)

---

## Phone input

| Option | Description | Selected |
|--------|-------------|----------|
| Validate E.164, reject otherwise | Zod-validate against an E.164 pattern; reject non-conforming input with a clear error. No silent reformatting. Matches success criterion 1; protects the WhatsApp natural key. | ✓ |
| Normalize loosely-typed input | Accept "07700 900123" etc. and normalize (assume GB). More forgiving but guessing a country code can corrupt the natural key. | |

**User's choice:** Validate E.164, reject otherwise (Recommended)

---

## Claude's Discretion

- application_state key naming + JSON shape for the segment spec
- Whether building a segment auto-selects it for sending or just saves it
- Inline vs Popover/Sheet placement of the structured filter controls
- Empty-state / zero-match copy for a custom segment

## Deferred Ideas

- Proper `campaign_segments` domain table (post-v1.2)
- Loose phone normalization / country-code inference
- OR / nested boolean composition across segment axes
- Agent-initiated bulk member edits and bulk segment sends
- Write tools for Payments / Settings / Analytics tabs
