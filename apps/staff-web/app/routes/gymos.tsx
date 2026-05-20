// GymOS layout — wraps every /gymos/* surface with the shared top-nav strip.
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
  return [{ title: "GymOS" }];
}

export default function GymosLayout() {
  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground">
      <GymosTopNav />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
