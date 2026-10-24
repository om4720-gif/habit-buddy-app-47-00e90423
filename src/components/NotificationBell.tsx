import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { listGradeNotifications, markAllGradeNotificationsRead } from "@/lib/grades.functions";

type Note = {
  id: string;
  course_name: string;
  course_code: string | null;
  grade_title: string;
  score: number;
  max_score: number;
  received_at: string;
  read_at: string | null;
};

/** Bell with a count of new grade alerts; opening it lists them, like a notification centre. */
export function NotificationBell() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGradeNotifications);
  const readAllFn = useServerFn(markAllGradeNotificationsRead);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["grade-notification-list"],
    queryFn: () => listFn(),
    refetchInterval: 60_000,
  });
  const notes = data as Note[];
  const unread = notes.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function markAllRead() {
    await readAllFn();
    await qc.invalidateQueries({ queryKey: ["grade-notification-list"] });
    await qc.invalidateQueries({ queryKey: ["grade-notifications"] });
  }

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `${unread} new grade alerts` : "Grade alerts"}
        className="relative grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-sand hover:text-ink"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-rust px-1 text-center text-[10px] font-bold leading-5 text-cream">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[70] w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-line bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Grade alerts</p>
            {unread > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-medium text-rust hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {notes.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-soft">No grade alerts yet.</li>}
            {notes.map((n) => {
              const pct = n.max_score > 0 ? (n.score / n.max_score) * 100 : 0;
              return (
                <li key={n.id} className="flex gap-3 border-b border-line/60 px-4 py-3 last:border-0">
                  <span className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-900/80 text-emerald-200">
                    <Bell className="size-4" />
                    {!n.read_at && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-orange-400 ring-2 ring-card" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">New grade</p>
                      <span className="shrink-0 text-[11px] text-ink-soft" title={format(new Date(n.received_at), "PPpp")}>
                        {formatDistanceToNowStrict(new Date(n.received_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="truncate text-xs text-ink-soft">
                      {n.course_name} · {n.grade_title} · {n.score} / {n.max_score}
                      {pct < 50 && <span className="ml-1 font-semibold text-orange-400">Important</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
