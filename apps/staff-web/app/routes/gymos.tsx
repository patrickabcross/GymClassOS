// GymClassOS layout — wraps every /gymos/* surface with the shared top-nav strip.
//
// In Remix flat routes / @react-router/fs-routes, sibling files like
// `gymos.tsx` + `gymos.members.tsx` are NESTED by default: gymos.tsx is the
// parent route at /gymos and gymos.members.tsx renders inside its <Outlet />.
//
// Previously gymos.tsx rendered the inbox content directly with NO <Outlet />,
// so visiting /gymos/members would match both routes but show only the inbox
// (the child component had nowhere to render). The inbox content has moved to
// gymos._index.tsx; this file now provides the layout shell + nav, and each
// sibling route renders inside <Outlet />.

import { Outlet } from "react-router";
import { GymosTopNav } from "@/components/gymos/GymosTopNav";

export function meta() {
  return [{ title: "GymClassOS" }];
}

export default function GymosLayout() {
  // IMPORTANT: do NOT use `w-screen` / `h-screen` here. This component is
  // wrapped by `<AgentSidebar>` (see apps/staff-web/app/components/layout/
  // AppLayout.tsx) which lays out as a flex row: [content (flex-1) | sidebar].
  // Claiming `w-screen` makes the gym surface ignore the sidebar's width and
  // overflow the viewport horizontally — the AgentSidebar then visually overlays
  // the right edge of the content and the page gets a bottom horizontal
  // scrollbar. `h-full w-full min-w-0` lets the surface fill the available
  // flex cell (which AgentSidebar sizes correctly).
  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-background text-foreground">
      <GymosTopNav />
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
