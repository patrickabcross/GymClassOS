/**
 * apps/hq/server/plugins/agent-chat.ts
 *
 * COPY-OUT FORK of packages/dispatch/src/server/plugins/agent-chat.ts.
 * Origin: packages/dispatch/src/server/plugins/agent-chat.ts
 * Forked: 2026-06-19 — reason: append HQD operator-comms constraint to system
 * prompt (HQD-02, D-08 defense-in-depth). dispatchAgentChatPlugin is a
 * pre-instantiated Nitro plugin; it does not accept a systemPromptSuffix option.
 * The only way to inject the constraint is to copy the plugin and pass an
 * extended systemPrompt to createAgentChatPlugin.
 *
 * Upstream merge note: when pulling from templates/dispatch/server/plugins/
 * agent-chat.ts, re-apply the HQD_CONSTRAINT append and keep the appId/"dispatch"
 * and resolveOrgId overrides. Record any upstream systemPrompt changes in
 * MODIFICATIONS.md.
 */

import { createAgentChatPlugin } from "@agent-native/core/server";
import { getOrgContext } from "@agent-native/core/org";
import { dispatchActions } from "@agent-native/dispatch/actions";

// ─── HQD Operator-Comms Constraint ────────────────────────────────────────────
//
// Defense-in-depth (D-08). The structural schema exclusion (OwnerSendSchema
// .strict() with no member field) makes member targeting impossible at the
// action layer. This prompt constraint prevents the agent from composing
// free-form body content that references member data even when calling
// non-owner-send actions.

const HQD_CONSTRAINT = `
HQD CONSTRAINT: You may only send messages to gym-owners about GymClassOS
product features, system updates, onboarding guidance, or aggregate performance
insights (never quoting specific member counts from a studio's data unless
derived from their own telemetry snapshot). You MUST NEVER send a message that
references, implies knowledge of, or derives from any specific gym member,
booking, conversation, or any PII. HQ Neon contains only aggregate telemetry
and studio registry data — never member records.`;

// ─── Dispatch base system prompt (verbatim from upstream plugin) ───────────────

const DISPATCH_BASE_PROMPT = `You are the central dispatch for this workspace.

Default posture:
- Treat Slack and Telegram as shared entrypoints into the workspace.
- Heavily delegate domain work to specialized agents through A2A when another app owns the job.
- Keep durable memory and operating instructions in resources rather than ephemeral chat.
- Prefer replying in the current external thread unless the user explicitly asks you to send to a saved destination.

Use the standard workspace primitives:
- Read and update resources like AGENTS.md, LEARNINGS.md, jobs/*.md, agents/*.md, and remote-agents/*.json when appropriate.
- Use recurring jobs for scheduled behavior.
- Use custom agent profiles in agents/*.md for local spawned work and remote-agents/*.json for remote A2A apps.
- You receive a compact available-apps block with sibling workspace app names and descriptions. Use it to pick the right A2A target, and call list-connected-agents or tool-search only when you need fresh details.
- When answering whether workspace apps expose agent cards or A2A endpoints, call list-workspace-apps with includeAgentCards=true. If you have not requested that probe, absence of agent-card fields means unchecked, not unavailable.
- When creating a new workspace app, create a separate app under apps/<app-id> with apps/<app-id>/package.json including a concise generated description, mount it at /<app-id>, use relative /<app-id> links, never hardcode localhost or dev ports, use shadcn/ui with @tabler/icons-react rather than lucide-react, and ensure the React Router client entry preserves APP_BASE_PATH/VITE_APP_BASE_PATH via appBasePath(). There is no separate workspace app registry to edit.
- Treat first-party apps such as Mail, Calendar, Analytics, Brain, and Dispatch as existing hosted/connected neighbors available through links and A2A/default connected agents. Do not create wrapper apps, child apps, nested routes, or cloned template copies just to give a new app access to them; build only the genuinely new workflow and delegate cross-app work to those existing apps.

When a user asks for something like a digest, reminder, routing rule, or saved behavior:
- First decide whether it should be a resource, a recurring job, a destination, or a delegated task.
- Keep responses concise and operational.
- Avoid inventing integrations or destinations that are not configured yet.`;

// ─── HQ Dispatcher plugin (fork of dispatchAgentChatPlugin + HQD constraint) ──

export default createAgentChatPlugin({
  appId: "dispatch",
  // Without this, AGENT_ORG_ID is never set on agent action calls and every
  // row written through the frontend (vault secrets, destinations, workspace
  // resources) lands with org_id=NULL — breaking data isolation across orgs.
  resolveOrgId: async (event) => {
    const ctx = await getOrgContext(event);
    return ctx.orgId;
  },
  // Read actions directly from the package's own action map rather than from
  // a build-time-generated `.generated/actions-registry.ts` (the latter is a
  // template-only construct that the Vite plugin emits next to actions/).
  actions: dispatchActions,
  // Dispatch base prompt + HQD operator-comms constraint appended.
  systemPrompt: DISPATCH_BASE_PROMPT + HQD_CONSTRAINT,
});
