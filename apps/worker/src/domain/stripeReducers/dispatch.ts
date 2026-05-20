import { checkoutSessionCompleted } from "./checkout-session-completed.js";
import { invoicePaid } from "./invoice-paid.js";
import { invoicePaymentFailed } from "./invoice-payment-failed.js";
import { subscriptionUpdated } from "./subscription-updated.js";
import { subscriptionDeleted } from "./subscription-deleted.js";
import { chargeRefunded } from "./charge-refunded.js";

/**
 * Stripe event reducer dispatch table — all 6 P1b event types (D-22).
 *
 * Each value MUST be the unbound reducer function (same shape:
 * `(event, tx, stripe) => Promise<void>`). The stripe-event queue handler
 * looks up event.type in this object and runs the value inside a single
 * Drizzle transaction (WEB-06).
 */
export const reducers = {
  "checkout.session.completed": checkoutSessionCompleted,
  "invoice.paid": invoicePaid,
  "invoice.payment_failed": invoicePaymentFailed,
  "customer.subscription.updated": subscriptionUpdated,
  "customer.subscription.deleted": subscriptionDeleted,
  "charge.refunded": chargeRefunded,
} as const;

export type ReducerKey = keyof typeof reducers;
