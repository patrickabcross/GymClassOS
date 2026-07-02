// RunStudio top-nav strip (INBX-07 demo cohesion).
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
//
// SWEB-07: Admin tabs (Payments/Analytics/Campaigns/Forms/Settings) are
// DOM-omitted for coaches. Role is determined client-side by comparing the
// signed-in email (fetched from /_agent-native/auth/session on mount) against
// the GYMOS_ADMIN_EMAILS allowlist surfaced through the root loader.
// While the session resolves, isAdmin defaults to false → coach-level tabs
// only (safe fallback per R4-UI-SPEC §6).

import { useState, useEffect } from "react";
import { Link, useLocation, useRouteLoaderData } from "react-router";
import { cn } from "@/lib/utils";

export function GymosTopNav() {
  const location = useLocation();
  const path = location.pathname;
  const rootData = useRouteLoaderData("root") as
    | {
        skin?: { displayName?: string; logo?: string | null };
        adminEmails?: string[];
        adminOpen?: boolean;
      }
    | undefined;
  const displayName = rootData?.skin?.displayName ?? "RunStudio";
  const logo = rootData?.skin?.logo ?? null;
  const adminEmails = rootData?.adminEmails ?? [];
  const adminOpen = rootData?.adminOpen ?? false;

  // SWEB-07: Fetch the signed-in user's email once on mount to compare against
  // the admin allowlist. Defaults to null → isAdmin=false (coach-level) until
  // the session resolves, per R4-UI-SPEC §6 "Fallback: undefined role → coach".
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/_agent-native/auth/session", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (active) setEmail(s?.user?.email ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // When no allowlist is configured (adminOpen), everyone is admin
  // (single-pilot default). When the session hasn't resolved yet (email==null
  // and not adminOpen), isAdmin is false → coach-level tabs only.
  const isAdmin =
    adminOpen || (email != null && adminEmails.includes(email.toLowerCase()));

  const tabClass = (active: boolean) =>
    cn(
      "px-2.5 py-1 rounded text-[12px] transition",
      active
        ? "bg-accent text-foreground font-semibold"
        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
    );
  const isHome = path === "/gymos";
  const isMessages = path.startsWith("/gymos/messages");
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
  // BD4-01: Studio Brain (GOB-03) — admin-only tab.
  const isBrain = path.startsWith("/gymos/brain");
  // C47: Passes & Classes catalog tab (admin-only).
  const isCatalog = path.startsWith("/gymos/catalog");
  // CV1 NAV-01: Video studio tab (admin-only authoring surface).
  // Content tab is intentionally hidden from the nav — gyms aren't writing
  // articles. The /gymos/content route still exists but is unlinked.
  const isVideo = path.startsWith("/gymos/video");
  // DE6: Kiosk tab — admin-only tablet check-in surface.
  const isKiosk = path.startsWith("/gymos/kiosk");

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
      {/* Coach-level tabs — always rendered */}
      <Link to="/gymos" className={tabClass(isHome)}>
        Home
      </Link>
      <Link to="/gymos/messages" className={tabClass(isMessages)}>
        Messages
      </Link>
      <Link to="/gymos/schedule" className={tabClass(isSchedule)}>
        Schedule
      </Link>
      <Link to="/gymos/members" className={tabClass(isMembers)}>
        Members
      </Link>
      {/* Admin-only tabs — DOM-omitted for coaches (not CSS-hidden) */}
      {isAdmin && (
        <Link to="/gymos/payments" className={tabClass(isPayments)}>
          Payments
        </Link>
      )}
      {isAdmin && (
        <Link to="/gymos/analytics" className={tabClass(isAnalytics)}>
          Analytics
        </Link>
      )}
      {isAdmin && (
        <Link to="/gymos/campaigns" className={tabClass(isCampaigns)}>
          Campaigns
        </Link>
      )}
      {isAdmin && (
        <Link to="/gymos/forms" className={tabClass(isForms)}>
          Forms
        </Link>
      )}
      {isAdmin && (
        <Link to="/gymos/brain" className={tabClass(isBrain)}>
          Brain
        </Link>
      )}
      {isAdmin && (
        <Link to="/gymos/catalog" className={tabClass(isCatalog)}>
          Catalog
        </Link>
      )}
      {/* Content tab hidden — gyms aren't writing articles. Route still exists. */}
      {isAdmin && (
        <Link to="/gymos/video" className={tabClass(isVideo)}>
          Video
        </Link>
      )}
      {isAdmin && (
        <Link to="/gymos/kiosk" className={tabClass(isKiosk)}>
          Kiosk
        </Link>
      )}
      {/* Right-aligned cluster: Settings (admin-only) + Sign out (always).
          ml-auto is on the group container so Sign out stays right-aligned
          regardless of whether Settings renders. */}
      <div className="flex items-center gap-1 ml-auto">
        {isAdmin && (
          <Link
            to="/gymos/settings/integrations"
            className={tabClass(isSettings)}
          >
            Settings
          </Link>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className={tabClass(false)}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
