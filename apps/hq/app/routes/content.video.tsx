// apps/hq/app/routes/content.video.tsx
//
// HQD-05 Video — thin deferred stub (D-11).
//
// The dedicated Remotion render cluster is OUT OF SCOPE for v2.0.
// This route satisfies HQD-05 as an explicit deferred stub with no
// Remotion dependency, no render pipeline, no worker queue.
//
// Per D-11: "Video last, may slip, no render cluster."
//
// UI rules:
//   - shadcn/ui Card + Button (disabled)
//   - Tabler IconVideo — no emojis as icons
//   - Single disabled "Generate video (coming soon)" Button
//   - No Remotion install (grep remotion apps/hq/package.json = nothing)

import { Link } from "react-router";
import { IconArrowLeft, IconVideo } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ContentVideoPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Back nav */}
      <div className="mb-6">
        <Link to="/content">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5">
            <IconArrowLeft className="size-4" />
            Back to Content
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-1">
            <IconVideo className="size-6 text-muted-foreground" />
            <CardTitle>Video Generation</CardTitle>
          </div>
          <CardDescription>
            HQD-05 — Deferred pending Remotion render cluster
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Operator video generation (HQD-05) is planned for a future phase.
            This feature requires a dedicated Remotion render cluster which is
            out of scope for v2.0 (D-11: no render cluster).
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            When implemented, the operator will be able to generate short
            marketing videos from Brain insights and Content documents.
          </p>

          {/* Disabled CTA — explicitly thin stub per D-11 */}
          <Button type="button" disabled className="gap-2 cursor-not-allowed">
            <IconVideo className="size-4" />
            Generate video (coming soon)
          </Button>

          <p className="text-xs text-muted-foreground">
            This feature is deferred on the Remotion render cluster external
            dependency. No Remotion packages are installed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
