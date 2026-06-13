"use client";

// CheckoutLinkButton — P1c.1 criterion 4
//
// A self-contained progressive-disclosure affordance for coaches to generate
// a Stripe Checkout link for a specific member from the member profile.
//
// UX flow:
//   1. Coach clicks "Payment link" outline button (DropdownMenu trigger).
//   2. Menu offers "Drop-in class" and "Unlimited membership".
//   3. Selecting a product opens a Dialog, fires the create-checkout-link
//      action with { memberId, productKey }, and displays the returned URL
//      in a read-only Input with a one-click copy-to-clipboard button.
//   4. Copy is optimistic/instant — clipboard write is fire-and-forget.
//
// Constraints: shadcn primitives only, Tabler icons, no emojis, no price IDs
// in the client (productKey resolves server-side via Task 1 resolver).

import { useState } from "react";
import { IconLink, IconCopy, IconCheck } from "@tabler/icons-react";
import { useActionMutation } from "@agent-native/core/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductKey = "drop-in" | "membership";

const PRODUCT_LABELS: Record<ProductKey, string> = {
  "drop-in": "Drop-in class",
  membership: "Unlimited membership",
};

type ActionResult = {
  url?: string;
  productName?: string;
  mode?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CheckoutLinkButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [productKey, setProductKey] = useState<ProductKey | null>(null);
  const [copied, setCopied] = useState(false);

  const mutation = useActionMutation("create-checkout-link", {
    onError: (err) => {
      toast(err.message ?? "Failed to generate link");
    },
  });

  const result = mutation.data as ActionResult | undefined;
  const url = result?.url;

  function handleSelect(key: ProductKey) {
    setProductKey(key);
    setCopied(false);
    mutation.reset();
    setOpen(true);
    // Fire immediately on select — the dialog shows the loading state
    mutation.mutate({ memberId, productKey: key } as Record<
      string,
      unknown
    > as Parameters<typeof mutation.mutate>[0]);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setOpen(false);
      // Reset state when dialog closes so next open is fresh
      setCopied(false);
      mutation.reset();
      setProductKey(null);
    }
  }

  function handleCopy() {
    if (!url) return;
    navigator.clipboard.writeText(url).catch(() => {
      /* clipboard permission denied — silent */
    });
    setCopied(true);
    toast("Checkout link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  const label = productKey ? PRODUCT_LABELS[productKey] : "";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <IconLink size={14} className="mr-1" />
            Payment link
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => handleSelect("drop-in")}>
            Drop-in class
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleSelect("membership")}>
            Unlimited membership
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment link</DialogTitle>
            <DialogDescription>
              {label} for {memberName ?? "this member"}
            </DialogDescription>
          </DialogHeader>

          {mutation.isPending && (
            <p className="text-sm text-muted-foreground">Generating link...</p>
          )}

          {mutation.isError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                {(mutation.error as Error)?.message ?? "Something went wrong."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!productKey) return;
                  mutation.reset();
                  mutation.mutate({ memberId, productKey } as Record<
                    string,
                    unknown
                  > as Parameters<typeof mutation.mutate>[0]);
                }}
              >
                Try again
              </Button>
            </div>
          )}

          {mutation.isSuccess && url && (
            <div className="flex items-center gap-2">
              <Input
                value={url}
                readOnly
                className="text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="shrink-0"
                aria-label="Copy checkout link"
              >
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
