import { useEffect } from "react";
import { IconFileText } from "@tabler/icons-react";
import { useNavigationState } from "@/hooks/use-navigation-state";

export function meta() {
  return [{ title: "GymClassOS — Content" }];
}

export default function ContentPage() {
  const navState = useNavigationState();
  useEffect(() => {
    navState.sync({ view: "content" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col gap-3 p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <IconFileText size={18} className="text-muted-foreground" aria-hidden />
        <h1 className="text-base font-semibold">Content</h1>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Rich content documents arrive in CV2 (Tiptap editor + agent tools).
      </p>
    </div>
  );
}
