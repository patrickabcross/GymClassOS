/**
 * HQ WABA Client — HQ WhatsApp Business Account send interface (HQD-01, D-13).
 *
 * DEFERRED-ON-EXTERNAL-DEPENDENCY: Live HQ WABA sends require:
 *   (a) HQ second phone number registration in Meta Business Manager
 *   (b) Meta approval of HQ owner-comms templates
 *
 * Build and unit-test now with mockHqWabaClient (exactly mirrors BD2's
 * provision-studio mock-first approach). Real client injected in production
 * once WABA creds are set in HQ secrets.
 */

/**
 * Payload for an HQ owner B2B message.
 * text: free-text within the 24h window.
 * template: approved Meta template (required outside the 24h window).
 */
export type SendOwnerMessagePayload =
  | { type: "text"; body: string }
  | {
      type: "template";
      name: string;
      vars: Record<string, string>;
      language?: string;
    };

/**
 * HqWabaClient — injectable interface for HQ→owner WhatsApp sends.
 * Injected as a dependency so tests use mockHqWabaClient without live WABA calls.
 */
export interface HqWabaClient {
  sendMessage(args: {
    to: string;
    payload: SendOwnerMessagePayload;
  }): Promise<{ wamid: string }>;
}

/**
 * Mock implementation — used in tests and when HQ WABA creds are absent.
 * Returns a deterministic-ish mock wamid for test assertions.
 */
export const mockHqWabaClient: HqWabaClient = {
  sendMessage: async (_args) => ({ wamid: `mock-wamid-${Date.now()}` }),
};

/**
 * Real implementation factory — used in production once HQ WABA is registered.
 *
 * DEFERRED-ON-EXTERNAL-DEPENDENCY: throws a descriptive error until the HQ
 * second phone number registration in Meta Business Manager is complete and
 * the creds are stored in HQ secrets. The error message documents the manual
 * step required.
 *
 * When creds are available, replace the stub body with:
 *   import { WhatsApp } from '@great-detail/whatsapp';
 *   // ... build and return a real client
 */
export function createHqWabaClient(
  _phoneNumberId: string,
  _apiToken: string,
): HqWabaClient {
  // deferred-on-external-dependency: HQ WABA second phone number not yet
  // registered in Meta Business Manager. See BD3-CONTEXT.md D-13 and
  // BD3-RESEARCH.md §HQD WABA Registration for the registration procedure.
  // Once complete: implement using @great-detail/whatsapp WhatsApp client.
  throw new Error(
    "deferred-on-external-dependency: HQ WABA not registered. " +
      "Complete Meta Business Manager phone number registration (D-13) before " +
      "enabling live HQD sends. See BD3-RESEARCH.md §HQD WABA Registration.",
  );
}
