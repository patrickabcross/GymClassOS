// queue-client.ts — staff-web side wrapper around @gymos/queue publishers.
//
// Why this re-export exists:
//   Route files import publishers via "~/lib/queue-client" instead of pulling
//   @gymos/queue directly. Makes a future swap (e.g. inline a direct pg-boss
//   instance, or fan-out by environment) a one-file change instead of a
//   workspace-wide grep.
//
// D-11 (P1b-CONTEXT): staff-web NEVER imports @gymos/whatsapp. Outbound sends
// go staff-web -> @gymos/queue (here) -> worker -> @gymos/whatsapp. The
// worker enforces opt-in + 24h-window + template-approved gates at the
// single sendMessage() chokepoint (apps/worker/src/domain/sendMessage.ts).

import { enqueueOutboundWhatsApp } from "@gymos/queue";

export { enqueueOutboundWhatsApp };
