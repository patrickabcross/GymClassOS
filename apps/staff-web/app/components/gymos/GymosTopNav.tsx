// GymClassOS top-nav strip (INBX-07 demo cohesion).
//
// Visual unifier that ties the four demo surfaces (Inbox / Schedule / Members /
// Payments) into one back-office product. Active tab is highlighted via
// useLocation().pathname.
//
// Rendered by the gymos.tsx layout (parent route), so all /gymos/* children
// inherit it via <Outlet />. Previously this lived inline inside gymos.tsx and
// only ever rendered on the inbox; extracted during the P1b-01 hotfix when
// /gymos children weren't rendering at all (gymos.tsx was a parent route
// without an <Outlet />, latent since D1).

import { Link, useLocation } from "react-router";
import { IconSettings } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export function GymosTopNav() {
  const location = useLocation();
  const path = location.pathname;
  const tabClass = (active: boolean) =>
    cn(
      "px-2.5 py-1 rounded text-[12px] transition",
      active
        ? "bg-accent text-foreground font-medium"
        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
    );
  const isInbox = path === "/gymos";
  const isSchedule = path.startsWith("/gymos/schedule");
  const isMembers = path.startsWith("/gymos/members");
  const isPayments = path.startsWith("/gymos/payments");
  const isAnalytics = path.startsWith("/gymos/analytics");
  // P1b-08: Settings → Integrations (Stripe key rotation).
  const isSettings = path.startsWith("/gymos/settings");
  return (
    <nav className="flex items-center gap-1 px-4 h-11 border-b border-border/50 bg-card/40 shrink-0">
      <span className="text-[12px] font-semibold mr-3">GymClassOS</span>
      <Link to="/gymos" className={tabClass(isInbox)}>
        Inbox
      </Link>
      <Link to="/gymos/schedule" className={tabClass(isSchedule)}>
        Schedule
      </Link>
      <Link to="/gymos/members" className={tabClass(isMembers)}>
        Members
      </Link>
      <Link to="/gymos/payments" className={tabClass(isPayments)}>
        Payments
      </Link>
      <Link to="/gymos/analytics" className={tabClass(isAnalytics)}>
        Analytics
      </Link>
      <Link
        to="/gymos/settings/integrations"
        className={cn(
          tabClass(isSettings),
          "ml-auto inline-flex items-center gap-1",
        )}
        aria-label="Settings"
      >
        <IconSettings size={14} aria-hidden />
        Settings
      </Link>
    </nav>
  );
}
