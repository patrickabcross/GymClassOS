// GymClassOS Payments — deferred stub.
//
// D1-03 (Stripe Checkout link generation) was paused at Task 1 awaiting
// STRIPE_SECRET_KEY=rk_test_… in the env file. Plan lives at
// .planning/phases/D1-staff-surfaces-adapted-from-mail-calendar-days-2-4/
// D1-03-payments-stripe-checkout-PLAN.md. Production-grade payments + Stripe
// reducers ship in Phase P1b (see ROADMAP.md §"Phase P1b").
//
// Until then, this stub renders so the top-nav "Payments" link doesn't 404
// (and so the browser back button doesn't crash on a fallback skeleton).

import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";

export function meta() {
  return [{ title: "GymClassOS — Payments" }];
}

export default function GymosPayments() {
  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-[720px] px-6 py-12">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold">Payments</h1>
            <Badge variant="outline" className="text-[11px]">
              Coming soon
            </Badge>
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Stripe Checkout link generation and pass-grant reconciliation are
            coming soon.
          </p>
        </header>

        <div className="rounded-lg border border-border/60 bg-card/30 p-5">
          <p className="text-[12px] text-muted-foreground mb-3">
            When ready, this surface will show:
          </p>
          <ul className="space-y-1.5 text-[13px]">
            <li>· Generate a Stripe Checkout link for a 10-credit pack</li>
            <li>· Send the link to a member over WhatsApp (template)</li>
            <li>· See pass grants land in the member profile on success</li>
            <li>· View recent payments + refunds + subscription state</li>
          </ul>
        </div>

        <Link
          to="/gymos"
          className="mt-6 inline-block text-[12px] text-muted-foreground hover:text-foreground transition"
        >
          ← Back to inbox
        </Link>
      </div>
    </div>
  );
}
