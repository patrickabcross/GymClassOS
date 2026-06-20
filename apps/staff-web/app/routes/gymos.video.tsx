import { useEffect } from "react";
import { IconVideo } from "@tabler/icons-react";
import { useNavigationState } from "@/hooks/use-navigation-state";

export function meta() {
  return [{ title: "GymClassOS — Video" }];
}

export default function VideoPage() {
  const navState = useNavigationState();
  useEffect(() => {
    navState.sync({ view: "video" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col gap-3 p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <IconVideo size={18} className="text-muted-foreground" aria-hidden />
        <h1 className="text-base font-semibold">Video</h1>
      </div>
      <p className="text-[13px] text-muted-foreground">
        In-browser video compositions arrive in CV3 (Remotion player + agent
        tools).
      </p>
    </div>
  );
}
