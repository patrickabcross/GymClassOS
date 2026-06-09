import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";

export default defineAction({
  description:
    "Write suggested WhatsApp template variable values back to the staff inbox so the coach can review and edit them before sending. " +
    "This is a pure write-back tool — it does NOT call any model and it does NOT send the message. " +
    "The agent's chat loop does the reasoning (mapping each {{N}} placeholder to a value from the template body + member context) and then calls THIS action with the already-computed vars map. " +
    "The coach still reviews every value in the TemplatesDialog and must click Send manually.",
  schema: z.object({
    conversationId: z
      .string()
      .describe("The inbox conversation the Templates dialog is open on"),
    templateName: z
      .string()
      .describe("The WhatsApp template the coach selected"),
    vars: z
      .record(z.string(), z.string())
      .describe(
        'Map of variable slot number to suggested value, e.g. {"1":"Sarah","2":"Reformer Pilates"}',
      ),
  }),
  run: async ({ conversationId, templateName, vars }) => {
    const key = `gymos-template-vars-${conversationId}-${templateName}`;
    // guard:allow-unscoped — single-tenant gym deploy; application_state is framework-scoped, no ownable gym table touched
    await writeAppState(key, JSON.stringify(vars));
    return { ok: true, key, count: Object.keys(vars).length };
  },
});
