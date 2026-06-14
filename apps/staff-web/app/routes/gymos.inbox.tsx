// R3-04 route shim — /gymos/inbox → /gymos/messages (301, query-preserving).
// The messaging surface was relocated to gymos.messages.tsx in R3 (NAME-03).
// Hustle (live customer) uses /gymos/inbox daily; this shim keeps their
// bookmarks / deep links / WhatsApp-shared URLs working. Per CONTEXT D-08
// the shim STAYS through R3 — removing the old route is a later step, only
// after the redirect is verified on the live Vercel deploy.
import { redirect, type LoaderFunctionArgs } from "react-router";

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // Forward ?conversation=, ?filter=leads, ?sent=1 etc. unchanged.
  return redirect(`/gymos/messages${url.search}`, 301);
}
