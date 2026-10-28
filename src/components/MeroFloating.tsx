import { format } from "date-fns";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BuddyFace, usePupilFollow } from "@/components/Buddy";
import { MeroBriefing } from "@/components/MeroBriefing";
import { MeroChat } from "@/components/MeroChat";
import { useUserSettings } from "@/lib/useUserSettings";

export function MeroFloating() {
  const [open, setOpen] = useState(false);
  const agent = useUserSettings().settings.agent_name;
  const [thinking, setThinking] = useState(false);
  const [hop, setHop] = useState(false);
  const hopTimer = useRef<number | undefined>(undefined);
  const { svgRef, pupilsRef } = usePupilFollow(thinking);

  const celebrate = () => {
    window.clearTimeout(hopTimer.current);
    setHop(true);
    hopTimer.current = window.setTimeout(() => setHop(false), 1000);
  };
  useEffect(() => () => window.clearTimeout(hopTimer.current), []);

  // Mero stays in one place, bottom-right. He keeps his idle animation (bobbing, blinking, wings).
  const spot = "bottom-6 right-6";

  return (
    <>
      {open && (
        <div className="fixed inset-x-3 bottom-24 z-50 max-h-[75vh] overflow-y-auto sm:inset-x-auto sm:right-6 sm:w-[420px] animate-rise">
          <div className="relative">
            <button
              aria-label={`Close ${agent}`}
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-full p-1 text-ink-soft hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="rounded-3xl border border-border bg-card p-6 shadow-xl [&>section]:mt-0 [&>section]:border-0 [&>section]:p-0 [&>section]:shadow-none">
              <MeroBriefing date={format(new Date(), "yyyy-MM-dd")} />
              <MeroChat onThinking={setThinking} onReply={(changed) => changed && celebrate()} />
            </div>
          </div>
        </div>
      )}
      <button
        aria-label={`Open ${agent}`}
        onClick={() => {
          setOpen((o) => !o);
          celebrate();
        }}
        className={`fixed z-50 transition-all duration-[2000ms] ease-in-out ${open ? "bottom-6 right-6" : spot}`}
      >
        <span className="relative block">
          <BuddyFace
            className="size-16 drop-shadow-md"
            mood={thinking ? "think" : "happy"}
            joy={hop}
            confetti={hop}
            svgRef={svgRef}
            pupilsRef={pupilsRef}
          />
          {!open && (
            <span className="absolute -top-7 right-0 whitespace-nowrap rounded-full bg-card px-2.5 py-1 text-xs font-medium shadow border border-border">
              Hi, I'm {agent} 👋
            </span>
          )}
        </span>
      </button>
    </>
  );
}
