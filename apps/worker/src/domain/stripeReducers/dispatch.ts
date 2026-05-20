import { checkoutSessionCompleted } from "./checkout-session-completed.js";
import { invoicePaid } from "./invoice-paid.js";
import { invoicePaymentFailed } from "./invoice-payment-failed.js";

/**
 * Stripe event reducer dispatch table.
 *
 * Task 2a registers checkout + invoice handlers; Task 2b extends this
 * object with subscription + charge.refunded reducers. The shape is a
 * plain const object so dispatch is O(1) and tree-shakeable per reducer.
 */
export const reducers = {
  "checkout.session.completed": checkoutSessionCompleted,
  "invoice.paid": invoicePaid,
  "invoice.payment_failed": invoicePaymentFailed,
} as const;

export type ReducerKey = keyof typeof reducers;
