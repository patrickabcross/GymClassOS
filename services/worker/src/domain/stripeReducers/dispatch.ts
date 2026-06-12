import { checkoutSessionCompleted } from "./checkout-session-completed.js";
import { invoicePaid } from "./invoice-paid.js";
import { invoicePaymentFailed } from "./invoice-payment-failed.js";
import { subscriptionUpdated } from "./subscription-updated.js";
import { subscriptionDeleted } from "./subscription-deleted.js";
import { chargeRefunded } from "./charge-refunded.js";
import { accountUpdated } from "./account-updated.js";

/**
 * Stripe event reducer dispatch table — 7 event types (6 P1b + account.updated P1c.1-03).
 *
 * Each value MUST be the unbound reducer function (same shape:
 * `(event, tx, stripe, stripeAccount?) => Promise<void>`). The stripe-event
 * queue handler looks up event.type in this object and runs the value inside a
 * single Drizzle transaction (WEB-06), passing stripeAccount as the 4th arg.
 */
export const reducers = {
  "checkout.session.completed": checkoutSessionCompleted,
  "invoice.paid": invoicePaid,
  "invoice.payment_failed": invoicePaymentFailed,
  "customer.subscription.updated": subscriptionUpdated,
  "customer.subscription.deleted": subscriptionDeleted,
  "charge.refunded": chargeRefunded,
  // P1c.1-03: keep connected_accounts.charges_enabled/payouts_enabled current
  "account.updated": accountUpdated,
} as const;

export type ReducerKey = keyof typeof reducers;
