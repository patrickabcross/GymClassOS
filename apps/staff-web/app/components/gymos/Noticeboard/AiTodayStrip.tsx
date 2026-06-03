// AiTodayStrip — P3-05
//
// Full-width strip shown at the top of the noticeboard board area. NOT a Card.
// Shows what the agent has just done or is working on.
//
// States:
//   idle  (no ai_today note): bg-muted/50, "AI READY", idle copy.
//   active (note exists):     bg-primary/5 border border-primary/20 rounded-md,
//                             "AI NOTE", note body verbatim.
//
// Pending proposals badge: Badge variant="secondary" when pendingCount > 0.
// Clicking the badge does NOT navigate — it is informational only.
// Icon: IconMessage (Tabler, 16px) — NOT sparkle/wand/robot per AGENTS.md mandate.

import { IconMessage } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";

type AiTodayStripProps = {
  note?: { body: string } | null;
  pendingCount: number;
};

export function AiTodayStrip({ note, pendingCount }: AiTodayStripProps) {
  const hasNote = note && note.body.trim().length > 0;

  return (
    <div
      className={
        hasNote
          ? "flex items-center gap-3 py-3 px-4 min-h-[44px] bg-primary/5 border border-primary/20 rounded-md"
          : "flex items-center gap-3 py-3 px-4 min-h-[44px] bg-muted/50"
      }
    >
      {/* Icon */}
      <IconMessage size={16} className="shrink-0 text-muted-foreground" />

      {/* State label */}
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
        {hasNote ? "AI NOTE" : "AI READY"}
      </span>

      {/* Separator dot */}
      <span className="text-muted-foreground/50 shrink-0" aria-hidden>
        ·
      </span>

      {/* Body */}
      <span className="text-sm flex-1 min-w-0">
        {hasNote ? (
          note.body
        ) : (
          <span className="text-muted-foreground">
            The agent is ready. Ask a question or request a recommendation in
            the chat.
          </span>
        )}
      </span>

      {/* Pending proposals badge — informational only, no navigation */}
      {pendingCount > 0 && (
        <Badge variant="secondary" className="shrink-0">
          {pendingCount} pending
        </Badge>
      )}
    </div>
  );
}
