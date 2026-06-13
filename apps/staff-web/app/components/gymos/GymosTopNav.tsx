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

import { Link, useLocation, useRouteLoaderData } from "react-router";
import { cn } from "@/lib/utils";

export function GymosTopNav() {
  const location = useLocation();
  const path = location.pathname;
  const rootData = useRouteLoaderData("root") as
    | { skin?: { displayName?: string; logo?: string | null } }
    | undefined;
  const displayName = rootData?.skin?.displayName ?? "GymClassOS";
  const logo = rootData?.skin?.logo ?? null;
  const tabClass = (active: boolean) =>
    cn(
      "px-2.5 py-1 rounded text-[12px] transition",
      active
        ? "bg-accent text-foreground font-semibold"
        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
    );
  const isHome = path === "/gymos";
  const isInbox = path.startsWith("/gymos/inbox");
  const isSchedule = path.startsWith("/gymos/schedule");
  const isMembers = path.startsWith("/gymos/members");
  const isPayments = path.startsWith("/gymos/payments");
  const isAnalytics = path.startsWith("/gymos/analytics");
  // 260531-n7i Task 3: Campaigns tab (missed-session re-engagement).
  const isCampaigns = path.startsWith("/gymos/campaigns");
  // P1c-04: Forms builder tab.
  const isForms = path.startsWith("/gymos/forms");
  // P1b-08: Settings → Integrations (Stripe key rotation).
  const isSettings = path.startsWith("/gymos/settings");

  // P1b.1-livefix: sign-out hits the better-auth backward-compat shim at
  // POST /_agent-native/auth/logout (see packages/core/src/server/auth.ts:2697
  // and the pattern already used in access-denied.tsx). We swallow errors so
  // a cookie-already-expired response still ends up at "/" — the auth guard
  // will then route the user into the sign-in flow.
  const handleSignOut = async () => {
    try {
      await fetch("/_agent-native/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    window.location.href = "/";
  };

  return (
    <nav className="flex items-center gap-1 px-4 h-11 border-b border-border/50 bg-card/40 shrink-0">
      <span className="text-[12px] font-semibold mr-3">
        {logo ? (
          <img src={logo} alt={displayName} className="h-5 w-auto" />
        ) : (
          displayName
        )}
      </span>
      <Link to="/gymos" className={tabClass(isHome)}>
        Home
      </Link>
      <Link to="/gymos/inbox" className={tabClass(isInbox)}>
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
      <Link to="/gymos/campaigns" className={tabClass(isCampaigns)}>
        Campaigns
      </Link>
      <Link to="/gymos/forms" className={tabClass(isForms)}>
        Forms
      </Link>
      <Link
        to="/gymos/settings/integrations"
        className={cn(tabClass(isSettings), "ml-auto")}
      >
        Settings
      </Link>
      <button type="button" onClick={handleSignOut} className={tabClass(false)}>
        Sign out
      </button>
    </nav>
  );
}
