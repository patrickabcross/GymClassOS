import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useNavigationState } from "@/hooks/use-navigation-state";

// Maps the agent's navigate({view}) command to a /gymos/<view> route. Mounted
// once in the gymos layout so every /gymos/* child inherits it.
//
// The legacy MessagesPage consumer (~L428-464) routes to "/<view>" for the mail
// surface — this bridge is the gymos surface equivalent and routes to
// "/gymos/<view>". Both can coexist: the legacy consumer ignores gymos views
// because it only acts on views it recognises (inbox, drafts, etc.); this
// bridge handles all gymos route keys.
const VIEW_TO_PATH: Record<string, string> = {
  home: "/gymos",
  inbox: "/gymos/messages", // "inbox" is the WhatsApp conversations list
  messages: "/gymos/messages",
  schedule: "/gymos/schedule",
  members: "/gymos/members",
  analytics: "/gymos/analytics",
  campaigns: "/gymos/campaigns",
  forms: "/gymos/forms",
  brain: "/gymos/brain",
  content: "/gymos/content",
  video: "/gymos/video",
  settings: "/gymos/settings/integrations",
  // C47: Passes & Classes catalog — agent can navigate({view:'catalog'})
  catalog: "/gymos/catalog",
  // DE6: Kiosk — admin tablet check-in surface
  kiosk: "/gymos/kiosk",
};

export function GymosNavBridge() {
  const navigate = useNavigate();
  const navState = useNavigationState();
  const { data: cmd } = navState.command;
  const lastRef = useRef<string>("");
  useEffect(() => {
    if (!cmd) return;
    const key = JSON.stringify(cmd);
    if (key === lastRef.current) return;
    lastRef.current = key;
    const target = cmd.view ? VIEW_TO_PATH[cmd.view] : undefined;
    if (target) navigate(target);
    navState.clearCommand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd]);
  return null;
}
