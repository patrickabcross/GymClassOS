import { redirect } from "react-router";
import { Spinner } from "@/components/ui/spinner";

export function meta() {
  return [
    { title: "GymOS" },
    {
      name: "description",
      content:
        "GymOS — boutique fitness studio operating system. WhatsApp inbox, class schedule, and member context in one surface.",
    },
  ];
}

// Demo-time root redirect: land staff straight in the GymOS WhatsApp inbox.
// Both server loader and client loader so the navigation completes before
// hydration. Post-demo (P0 audit) this file moves to apps/staff-web/.
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

export default function IndexRoute() {
  // Should never render — both loaders redirect to the default triage tab.
  return null;
}
