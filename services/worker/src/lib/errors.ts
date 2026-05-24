/**
 * Typed errors for the sendMessage chokepoint (Plan 06).
 *
 * Defined here in Plan 05 so the file structure is stable across plans —
 * Plan 06 (outbound-whatsapp worker) will import these to surface specific
 * refusal reasons up to the staff UI without leaking SDK error shapes.
 */

export class NoOptInError extends Error {
  readonly code = "NO_OPT_IN" as const;
  constructor(public readonly memberId: string) {
    super(`Member ${memberId} has no whatsapp_opt_in record`);
    this.name = "NoOptInError";
  }
}

export class WindowExpiredError extends Error {
  readonly code = "WINDOW_EXPIRED" as const;
  constructor(
    public readonly memberId: string,
    public readonly lastInboundAt: Date | null,
  ) {
    super(
      `24h window expired for member ${memberId} (lastInboundAt=${lastInboundAt?.toISOString() ?? "null"}) — template send required`,
    );
    this.name = "WindowExpiredError";
  }
}

export class TemplateNotApprovedError extends Error {
  readonly code = "TEMPLATE_NOT_APPROVED" as const;
  constructor(public readonly templateName: string) {
    super(`Template '${templateName}' is not approved in whatsapp_templates`);
    this.name = "TemplateNotApprovedError";
  }
}
