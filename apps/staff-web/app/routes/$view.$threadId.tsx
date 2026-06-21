import { redirect } from "react-router";
import { Spinner } from "@/components/ui/spinner";

export function meta() {
  return [{ title: "RunStudio" }];
}

// Legacy Mail-template thread path. Anything matching /<view>/<threadId>
// redirects to the GymOS WhatsApp inbox. Both server loader and client
// loader so the navigation completes before hydration — same pattern as
// routes/_index.tsx and routes/$view.tsx.
export function loader() {
  throw redirect("/gymos");
}

export function clientLoader() {
  throw redirect("/gymos");
}

export function HydrateFallback() {
  return (
    <div className="flex items-center justify-center h-screen w-full">
      <Spinner className="size-8" />
    </div>
  );
}

export default function ThreadRoute() {
  // Should never render — both loaders redirect to /gymos.
  return null;
}
