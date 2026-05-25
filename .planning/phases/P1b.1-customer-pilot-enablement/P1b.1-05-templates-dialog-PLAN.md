---
phase: P1b.1-customer-pilot-enablement
plan: 05
type: execute
wave: 2
depends_on: [P1b.1-04]
files_modified:
  - apps/staff-web/app/components/gymos/TemplatesDialog.tsx
  - apps/staff-web/app/routes/gymos._index.tsx
autonomous: true
requirements: [WA-05, WA-06, WA-07]
must_haves:
  truths:
    - "Clicking the 'Templates' button in the reply form opens a shadcn Dialog showing all 5 whatsapp_templates rows"
    - "hello_world shows an 'Approved' badge and is selectable; the four pending templates show 'Awaiting approval', are visually disabled (opacity-50), and have a tooltip explaining Meta approval pending"
    - "Selecting hello_world and clicking Send template triggers the existing enqueueOutboundWhatsApp path with payload {type:'template', name:'hello_world', vars:{}}, status='queued' optimistic insert, and Sonner toast 'Template queued'"
    - "Selecting a template with {{N}} placeholders renders one Input per placeholder, with live preview substitution; Send is disabled until all required variables are filled"
    - "Templates Send respects the same worker chokepoint as free-text Send — no direct Meta API calls from staff-web; failed-bubble copy from existing failedCopy(errorCode) handles WindowExpired/NoOptIn/TemplateNotApproved typed errors from the worker"
  artifacts:
    - path: "apps/staff-web/app/components/gymos/TemplatesDialog.tsx"
      provides: "Reusable Templates picker component with left list / right form+preview / footer split"
      min_lines: 150
    - path: "apps/staff-web/app/routes/gymos._index.tsx"
      provides: "Loader now fetches whatsapp_templates; action handles _intent='send-template'; TemplatesButton renders beside Send"
      contains: "send-template"
  key_links:
    - from: "apps/staff-web/app/components/gymos/TemplatesDialog.tsx"
      to: "gymos._index.tsx action with _intent='send-template'"
      via: "fetcher.submit with form data"
      pattern: "send-template"
    - from: "apps/staff-web/app/routes/gymos._index.tsx action"
      to: "@gymos/queue enqueueOutboundWhatsApp"
      via: "type: 'template' payload"
      pattern: "type:\\s*[\"']template[\"']"
    - from: "apps/staff-web/app/routes/gymos._index.tsx loader"
      to: "Neon whatsapp_templates table"
      via: "Drizzle select"
      pattern: "whatsappTemplates"
---

<objective>
Surface the WhatsApp template send path in the staff inbox. Rename "Compose" to "Templates" (the old Compose lived in stripped email chrome; this is a NEW button), open a single shadcn Dialog with the picker UI, send through the existing worker chokepoint. This is the last piece blocking the customer from sending a real outbound WhatsApp on pilot day.

Purpose: WhatsApp Business cannot send free-text outside the 24h window. The Templates button gives coaches a path to proactive outbound (class reminders, retention nudges) and to out-of-window replies — all through the P1b-06 chokepoint that already enforces opt-in, window-state, and template-approved gates.

Output:
- `apps/staff-web/app/components/gymos/TemplatesDialog.tsx` — new component (~200 lines)
- `apps/staff-web/app/routes/gymos._index.tsx` — loader extended, action discriminator added, button slotted into reply form, placeholder copy updated
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-06-worker-sendmessage-chokepoint-SUMMARY.md
@.planning/phases/P1b-webhook-worker-spine-stripe-whatsapp-2-weeks/P1b-08-staffweb-outbound-rotation-SUMMARY.md
@apps/staff-web/app/routes/gymos._index.tsx
@packages/queue/src/types.ts
@apps/staff-web/app/components/ui/dialog.tsx
@apps/staff-web/app/components/ui/badge.tsx

<interfaces>
<!-- Critical existing patterns the Templates dialog must reuse exactly. -->

From packages/queue/src/types.ts (OutboundWhatsAppPayload — verify exact shape at task time):
```typescript
// The payload field on the outbound-whatsapp queue job:
type OutboundWhatsAppPayload =
  | { type: "text"; body: string }
  | { type: "template"; name: string; vars: Record<string, string>; language?: string };
```

From apps/staff-web/app/routes/gymos._index.tsx (existing action — Plan 08 shipped this):
- The route action does an optimistic insert of a `messages` row with `status='queued'`, then calls `enqueueOutboundWhatsApp({ messageId, memberId, payload })`.
- Loader fans out: conversations, messages, members, window-state (raw SQL on whatsapp_window_state VIEW), opt-in rows.
- Existing `failedCopy(errorCode)` mapping handles typed worker errors (NO_OPT_IN → "Member hasn't opted in...", WINDOW_EXPIRED → "24h window closed...", TEMPLATE_NOT_APPROVED → "Template not yet approved...").

From P1b-06 SUMMARY (sendMessage chokepoint):
- The worker's `sendMessage()` is the ONLY caller of Meta's API. Staff-web NEVER calls Meta.
- Template sends bypass the WindowExpired gate (templates can be sent out of window).
- Template sends are still rejected by NoOptInError if the member has no opt-in row.
- Template sends are rejected by TemplateNotApprovedError if `whatsapp_templates.status !== 'approved'`.

From apps/staff-web/app/components/ui/* (shadcn):
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogTrigger`, `DialogFooter` from `~/components/ui/dialog`
- `Button` (variants: default, outline, ghost, destructive)
- `Input`, `Badge`, `Separator`, `ScrollArea`, `Tooltip`, `TooltipTrigger`, `TooltipContent`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend gymos._index.tsx loader + action to support templates</name>
  <files>apps/staff-web/app/routes/gymos._index.tsx</files>
  <read_first>
    - apps/staff-web/app/routes/gymos._index.tsx — read the FULL file. Critical sections: loader (top), action function (around line 285-345 per CONTEXT), reply Form JSX (around line 519-552 per CONTEXT). Identify the existing intent discrimination pattern (if any) and the exact enqueueOutboundWhatsApp call.
    - packages/queue/src/types.ts — confirm exact `OutboundWhatsAppPayload` shape, especially the `template` variant field names (`name`, `vars`, `language`)
    - apps/staff-web/server/db/schema.ts — confirm `whatsappTemplates` Drizzle export
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md §"Copywriting Contract" — exact placeholder text for out-of-window state ("Out of 24h window — use a template" — REMOVE the "(P2)" suffix from current copy)
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Architecture Patterns > 2. Templates Dialog Pattern" — discriminated _intent approach in existing action vs new action file
  </read_first>
  <action>
Edit `apps/staff-web/app/routes/gymos._index.tsx` to support template sends end-to-end.

**Step 1 — Extend the loader.** Add a parallel query to fetch all `whatsapp_templates` rows. The loader currently fans out multiple queries via Promise.all (or sequential awaits — match the existing pattern). Add:

```typescript
const templates = await db
  .select({
    name: schema.whatsappTemplates.name,
    status: schema.whatsappTemplates.status,
    category: schema.whatsappTemplates.category,
    language: schema.whatsappTemplates.language,
    componentsJson: schema.whatsappTemplates.componentsJson,
  })
  .from(schema.whatsappTemplates)
  .orderBy(schema.whatsappTemplates.name);
```

Add `templates` to the loader's returned object.

**Step 2 — Add `_intent='send-template'` branch to the action function.** The existing action handles free-text send. Discriminate on `formData.get("_intent")`:

```typescript
const intent = String(formData.get("_intent") ?? "send-text");
if (intent === "send-template") {
  const conversationId = String(formData.get("conversationId"));
  const templateName = String(formData.get("templateName"));
  const varsJson = String(formData.get("vars") ?? "{}");
  const vars = JSON.parse(varsJson) as Record<string, string>;

  // Look up conversation + member.
  const [conv] = await db
    .select({ id: schema.conversations.id, memberId: schema.conversations.memberId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);

  if (!conv) {
    return json({ ok: false, error: "Conversation not found" }, { status: 404 });
  }

  // Generate messageId, optimistic INSERT messages row with status='queued', direction='outbound', kind='template'.
  const messageId = `msg_${nanoid()}`;
  await db.insert(schema.messages).values({
    id: messageId,
    conversationId: conv.id,
    direction: "outbound",
    status: "queued",
    body: `[template: ${templateName}]`,   // displayable placeholder; worker will replace on send
    createdAt: new Date().toISOString(),
    // ... any other required columns; match the existing INSERT in the send-text branch
  });

  // Enqueue.
  await enqueueOutboundWhatsApp({
    messageId,
    memberId: conv.memberId,
    payload: { type: "template", name: templateName, vars, language: "en_US" },
  });

  return json({ ok: true, messageId });
}

// Existing send-text branch follows below (no change to its behavior).
```

Notes:
- Match the exact INSERT column shape used by the existing send-text branch — read the file before editing
- Use the SAME `messageId` nanoid pattern, `status: 'queued'`, optimistic insert (per D-18)
- DO NOT call Meta directly — `enqueueOutboundWhatsApp` is the only allowed call (WA-05 contract)
- If the existing action returns `{ ok: true }` and clients re-fetch via TanStack/loader revalidation, keep the same response shape

**Step 3 — Update the out-of-window placeholder copy.** Find the existing placeholder string `"Out of 24h window — use a template (P2)"` (or similar with "(P2)" suffix) and change to `"Out of 24h window — use a template"` (verbatim per UI-SPEC copywriting contract). This is dev scaffolding being replaced with pilot copy.

**Step 4 — Add the `<TemplatesDialog>` mount to the reply Form JSX.** The TemplatesDialog component is created in Task 2 — for this task, add the import and the JSX placement.

Locate the reply Form's button row (around line 528 per CONTEXT). Currently:
```tsx
<div className="flex gap-2">
  <Input name="body" ... />
  <Button type="submit" disabled={...}>Send</Button>
</div>
```

Update to:
```tsx
<div className="flex gap-2">
  <Input name="body" ... />
  <TemplatesDialog
    conversationId={data.selectedConversation.id}
    templates={data.templates}
    hasOptIn={selectedHasOptIn}
  />
  <Button type="submit" disabled={...}>Send</Button>
</div>
```

Add the import `import { TemplatesDialog } from "~/components/gymos/TemplatesDialog";` at the top. The TemplatesDialog component itself encapsulates the Templates button + the Dialog body.

Run `pnpm --filter staff-web typecheck` after the edits (will likely fail until Task 2 creates the component — that's fine, complete Task 2 before final verify).
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/staff-web/app/routes/gymos._index.tsx` loader contains `schema.whatsappTemplates` reference (the new query)
    - The loader's returned object includes a `templates` field
    - The action function contains a literal string `"send-template"` (the intent discriminator)
    - The action function contains a literal `type: "template"` (or `type: 'template'`) in the enqueue call payload
    - The action function still contains the existing send-text branch (don't break it)
    - The route file imports `TemplatesDialog` from `~/components/gymos/TemplatesDialog`
    - The JSX contains a literal `<TemplatesDialog` element inside the reply form button row
    - The file does NOT contain `"(P2)"` substring anywhere in placeholder copy (must be removed per UI-SPEC)
    - The file contains the literal string `"Out of 24h window — use a template"` (with em-dash, exact UI-SPEC copy)
    - `pnpm --filter staff-web typecheck` exits with code 0 (after Task 2 also lands)
  </acceptance_criteria>
  <done>
Loader returns the 5 seeded templates with conversation data. Submitting a form with `_intent='send-template'` + `templateName='hello_world'` + `vars='{}'` inserts a `messages` row with `status='queued'`, enqueues an outbound-whatsapp job with `payload.type='template'`. The free-text Send path still works unchanged. Out-of-window inbox placeholder reads "Out of 24h window — use a template" with no "(P2)" debug suffix.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build the TemplatesDialog component</name>
  <files>apps/staff-web/app/components/gymos/TemplatesDialog.tsx</files>
  <read_first>
    - apps/staff-web/app/components/ui/dialog.tsx — confirm exact exports: Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
    - apps/staff-web/app/components/ui/badge.tsx — Badge variants
    - apps/staff-web/app/components/ui/scroll-area.tsx — ScrollArea API
    - apps/staff-web/app/components/ui/tooltip.tsx — Tooltip composition (TooltipProvider, TooltipTrigger, TooltipContent)
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md §"Surface Specifications > 2. Templates Button + Picker Dialog" — full layout spec (640x520, 200px left pane, footer with "Discard draft" + Send)
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md §"Copywriting Contract" — ALL copy strings verbatim
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Common Pitfalls > Pitfall 3" — hello_world has 0 vars, send with vars:{} is valid; executor MUST verify apps/worker/src/domain/sendMessage.ts handles this case before committing
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md §"Code Examples > Template variable extraction from components_json" — extractVariables() helper
    - apps/worker/src/domain/sendMessage.ts — verify the `sendTemplate` call path handles `vars: {}` gracefully (MEDIUM confidence open item from research)
  </read_first>
  <action>
Create `apps/staff-web/app/components/gymos/TemplatesDialog.tsx`. This is the full picker component — both the trigger button and the Dialog body.

```tsx
import { useState, useMemo } from "react";
import { useFetcher } from "react-router";
import { IconTemplate } from "@tabler/icons-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export type TemplateRow = {
  name: string;
  status: "pending" | "approved" | "rejected" | "paused" | "disabled";
  category: string | null;
  language: string;
  componentsJson: string;
};

export type TemplatesDialogProps = {
  conversationId: string;
  templates: TemplateRow[];
  hasOptIn: boolean;
};

function extractVariables(componentsJson: string): string[] {
  try {
    const parsed = JSON.parse(componentsJson);
    const body = (parsed.components ?? []).find((c: any) => c.type === "BODY");
    if (!body?.text) return [];
    const matches = String(body.text).matchAll(/\{\{(\d+)\}\}/g);
    return [...new Set([...matches].map((m) => m[1]))].sort();
  } catch {
    return [];
  }
}

function getBodyText(componentsJson: string): string {
  try {
    const parsed = JSON.parse(componentsJson);
    const body = (parsed.components ?? []).find((c: any) => c.type === "BODY");
    return body?.text ?? "";
  } catch {
    return "";
  }
}

function renderPreview(bodyText: string, vars: Record<string, string>): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[n] || `{{${n}}}`);
}

export function TemplatesDialog({ conversationId, templates, hasOptIn }: TemplatesDialogProps) {
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});

  const selected = selectedName ? templates.find((t) => t.name === selectedName) ?? null : null;
  const variables = useMemo(
    () => (selected ? extractVariables(selected.componentsJson) : []),
    [selected],
  );
  const bodyText = useMemo(
    () => (selected ? getBodyText(selected.componentsJson) : ""),
    [selected],
  );
  const preview = useMemo(() => renderPreview(bodyText, vars), [bodyText, vars]);

  const allFilled = variables.every((v) => (vars[v] ?? "").trim().length > 0);
  const canSend =
    selected !== null && selected.status === "approved" && allFilled && hasOptIn;

  const handleSelect = (name: string, status: string) => {
    if (status !== "approved") return; // disabled rows are not selectable
    setSelectedName(name);
    setVars({});
  };

  const handleSend = () => {
    if (!selected) return;
    const fd = new FormData();
    fd.set("_intent", "send-template");
    fd.set("conversationId", conversationId);
    fd.set("templateName", selected.name);
    fd.set("vars", JSON.stringify(vars));
    fetcher.submit(fd, { method: "post" });
    toast.success("Template queued");
    setOpen(false);
    setSelectedName(null);
    setVars({});
  };

  const handleDiscard = () => {
    setOpen(false);
    setSelectedName(null);
    setVars({});
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <IconTemplate size={14} aria-hidden className="mr-1" />
          Templates
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-[640px] h-[520px] p-0 gap-0 flex flex-col"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-4 py-3 border-b border-border/50">
          <DialogTitle className="text-sm font-semibold">Send a template</DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Approved WhatsApp message templates
          </p>
        </DialogHeader>
        <div className="flex flex-1 min-h-0">
          {/* Left pane: template list */}
          <div className="w-[200px] border-r border-border/50 flex flex-col">
            <ScrollArea className="flex-1">
              <TooltipProvider delayDuration={300}>
                <div className="p-2 flex flex-col gap-1" role="listbox">
                  {templates.map((t) => {
                    const isApproved = t.status === "approved";
                    const isSelected = selectedName === t.name;
                    const row = (
                      <button
                        key={t.name}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={!isApproved}
                        onClick={() => handleSelect(t.name, t.status)}
                        className={[
                          "text-left px-2 py-1.5 rounded text-[13px] transition-colors",
                          isSelected ? "bg-accent" : "hover:bg-accent/40",
                          !isApproved ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                        ].join(" ")}
                      >
                        <div>{t.name}</div>
                        <div className="mt-1">
                          {isApproved ? (
                            <Badge variant="outline" className="text-[10px]">
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] opacity-70">
                              Awaiting approval
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                    return isApproved ? (
                      row
                    ) : (
                      <Tooltip key={t.name}>
                        <TooltipTrigger asChild>
                          <span tabIndex={0}>{row}</span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-[11px] max-w-[220px]">
                            Awaiting Meta approval — submit templates via your Meta Business Manager
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            </ScrollArea>
          </div>
          {/* Right pane: form + preview */}
          <div className="flex-1 px-4 py-3 flex flex-col gap-3">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
                Select a template from the list
              </div>
            ) : (
              <>
                <div className="text-sm font-semibold">{selected.name}</div>
                {variables.length === 0 ? (
                  <div className="text-[12px] text-muted-foreground">
                    This template has no variables.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {variables.map((v) => (
                      <div key={v} className="flex flex-col gap-1">
                        <label className="text-[12px] text-muted-foreground">
                          Variable {v}
                        </label>
                        <Input
                          className="text-[13px]"
                          value={vars[v] ?? ""}
                          onChange={(e) =>
                            setVars((prev) => ({ ...prev, [v]: e.target.value }))
                          }
                        />
                        {(vars[v] ?? "").trim().length === 0 && (
                          <div className="text-[11px] text-destructive">
                            Required
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <Separator className="my-1" />
                <div className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  Preview
                </div>
                <div className="text-[13px] bg-muted/40 rounded p-3 leading-[1.5] whitespace-pre-wrap">
                  {preview || "(empty)"}
                </div>
                {!hasOptIn && (
                  <div className="text-[11px] text-destructive">
                    Member hasn't opted in to WhatsApp messages
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="border-t border-border/50 px-4 py-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleDiscard}>
            Discard draft
          </Button>
          <Button type="button" disabled={!canSend} onClick={handleSend}>
            Send template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Critical contract points (all verbatim from UI-SPEC copywriting):
- Trigger button label: `Templates` (with `IconTemplate` 14px to the left)
- Dialog title: `Send a template`
- Dialog subtitle: `Approved WhatsApp message templates`
- Empty state: `Select a template from the list`
- Approved badge text: `Approved`
- Pending badge text: `Awaiting approval`
- Pending tooltip: `Awaiting Meta approval — submit templates via your Meta Business Manager`
- Discard button: `Discard draft` (NOT "Cancel" — checker fix in UI-SPEC)
- Primary CTA: `Send template`
- Toast on success: `Template queued`
- No-opt-in inline error: `Member hasn't opted in to WhatsApp messages`

Behavior rules:
- Send is disabled if: no selected template, selected is not approved, any required variable is empty, hasOptIn=false
- Dialog closes immediately on Send click (optimistic — toast fires, mutation runs in background via fetcher)
- Clicking Discard draft closes the dialog and clears state
- Escape closes dialog (shadcn default)
- Tab navigates list → inputs → footer buttons

Pitfall 3 verification: BEFORE running typecheck, verify `apps/worker/src/domain/sendMessage.ts` handles `vars: {}` for hello_world without erroring. Read the file; trace the `sendTemplate` adapter call. If it does NOT handle empty vars (e.g. omits the `components` array entirely vs sends empty array), the executor must add a guard in the action handler (gymos._index.tsx) BEFORE enqueueing — pass `components: []` explicitly if needed. Document the verified behavior in the SUMMARY.

Run `pnpm --filter staff-web typecheck` after creation.
  </action>
  <verify>
    <automated>cd apps/staff-web && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/staff-web/app/components/gymos/TemplatesDialog.tsx` exists
    - File line count ≥ 150 lines
    - Contains `export function TemplatesDialog`
    - Imports `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from shadcn dialog component
    - Imports `IconTemplate` from `@tabler/icons-react` (no emoji icons)
    - Imports `Badge` from shadcn
    - Imports `useFetcher` from `react-router` (RR v7)
    - Imports `toast` from `sonner`
    - Contains literal string `"Send a template"` (dialog title)
    - Contains literal string `"Approved WhatsApp message templates"` (subtitle)
    - Contains literal string `"Select a template from the list"` (empty state)
    - Contains literal string `"Approved"` (approved badge text)
    - Contains literal string `"Awaiting approval"` (pending badge text)
    - Contains literal string `"Awaiting Meta approval — submit templates via your Meta Business Manager"` (tooltip — verbatim em-dash)
    - Contains literal string `"Discard draft"` (dismiss button text — NOT "Cancel")
    - Contains literal string `"Send template"` (primary CTA)
    - Contains literal string `"Template queued"` (toast text)
    - Contains literal string `"Member hasn't opted in to WhatsApp messages"` (no-opt-in error)
    - Contains `_intent` set to `send-template` in the fetcher.submit FormData
    - Does NOT contain `window.confirm`, `window.alert`, `window.prompt` (per AGENTS.md)
    - Does NOT contain any emoji as icon (use Tabler only)
    - Does NOT contain raw `fetch` to Meta's graph.facebook.com (WA-05 guard — never direct Meta call)
    - `pnpm --filter staff-web typecheck` exits with code 0
  </acceptance_criteria>
  <done>
With dev server running and `hello_world` seeded as approved, clicking the Templates button in a gymos thread opens the Dialog. Five templates appear in the left list; `hello_world` is selectable (no opacity), the four others are visually disabled (opacity-50) and show the tooltip on hover. Selecting `hello_world`: right pane shows "This template has no variables.", preview block renders "Hello World", Send template button is enabled (assuming member has opt-in). Clicking Send template: dialog closes, Sonner toast "Template queued" fires, a new `messages` row with `status='queued'` appears in the thread optimistically. The worker (running on Fly or local) picks up the job, calls Meta's API for hello_world, status updates to `sent` on success.
  </done>
</task>

</tasks>

<verification>
- Loader returns 5 templates, action handles send-template intent, JSX mounts TemplatesDialog
- TemplatesDialog renders the picker per UI-SPEC dimensions and copy
- All copy strings verbatim from UI-SPEC copywriting contract
- TypeScript compiles
- No direct Meta API calls (WA-05 guard)
- Pitfall 3 verified — hello_world send works with empty vars
</verification>

<success_criteria>
1. ROADMAP success criterion #3: clicking Templates opens picker → selecting hello_world + Send arrives on test WhatsApp number via worker chokepoint
2. UI-SPEC copywriting fully honored (no "Cancel", no "(P2)" debug suffix)
3. Worker chokepoint guarantees preserved (opt-in / window / template-approved gates still authoritative)
4. Optimistic insert pattern matches existing free-text Send (D-18)
</success_criteria>

<output>
After completion, create `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-05-templates-dialog-SUMMARY.md` documenting:
- The exact line numbers in gymos._index.tsx where the loader query, action branch, and JSX mount were added
- Verified behavior of sendTemplate with vars:{} (Pitfall 3 resolution) — did it need a guard in the action handler?
- Confirmation that the "(P2)" debug suffix was removed from placeholder copy
- Any deviations from the verbatim copywriting strings
</output>
