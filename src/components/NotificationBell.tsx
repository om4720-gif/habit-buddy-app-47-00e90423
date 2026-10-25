import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  clearGradeNotifications,
  deleteGradeNotification,
  listGradeNotifications,
  markAllGradeNotificationsRead,
} from "@/lib/grades.functions";

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

/** Grade alerts: a glowing bell with a live count, and a panel to read, mark and delete alerts. */
export function NotificationBell() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGradeNotifications);
  const readAllFn = useServerFn(markAllGradeNotificationsRead);
  const deleteFn = useServerFn(deleteGradeNotification);
  const clearFn = useServerFn(clearGradeNotifications);
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

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["grade-notification-list"] });
    await qc.invalidateQueries({ queryKey: ["grade-notifications"] });
  };

  async function markAllRead() {
    await readAllFn();
    await refresh();
  }

  async function remove(id: string) {
    try {
      await deleteFn({ data: { id } });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that alert");
    }
  }

  async function clearAll() {
    if (!window.confirm("Delete all grade alerts?")) return;
    try {
      await clearFn();
      await refresh();
      toast.success("Alerts cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear the alerts");
    }
  }

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `${unread} new grade alerts` : "Grade alerts"}
        className="group relative grid size-9 place-items-center rounded-full text-ink-soft transition hover:text-ink"
      >
        <span className="absolute inset-0 rounded-full bg-emerald-400/0 transition group-hover:bg-emerald-400/15" />
        <Bell className="relative size-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[1.25rem] place-items-center rounded-full bg-gradient-to-br from-rose-500 to-orange-400 px-1 text-[10px] font-bold leading-5 text-white shadow-[0_0_12px_rgba(244,63,94,0.7)]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[70] w-[22rem] max-w-[92vw] overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/85 text-zinc-100 shadow-[0_0_60px_-12px_rgba(16,185,129,0.45)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-emerald-500/25 to-transparent blur-2xl" />
          <div className="relative flex items-center justify-between px-5 pb-3 pt-4">
            <div>
              <p className="bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-300 bg-clip-text text-sm font-semibold tracking-wide text-transparent">
                Grade alerts
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                {unread} new · {notes.length} total
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button type="button" onClick={markAllRead} className="rounded-full px-2.5 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-emerald-400/30 hover:bg-emerald-400/10">
                  Mark read
                </button>
              )}
              {notes.length > 0 && (
                <button type="button" onClick={clearAll} className="rounded-full px-2.5 py-1 text-[11px] font-medium text-rose-300 ring-1 ring-rose-400/30 hover:bg-rose-400/10">
                  Clear all
                </button>
              )}
            </div>
          </div>

          <ul className="relative max-h-96 space-y-2 overflow-y-auto px-3 pb-3">
            {notes.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-zinc-500">No grade alerts. Nothing new yet.</li>
            )}
            {notes.map((n) => {
              const pct = n.max_score > 0 ? (n.score / n.max_score) * 100 : 0;
              const tone = pct >= 60 ? "from-emerald-400/30 to-cyan-400/10 text-emerald-300" : pct >= 50 ? "from-amber-400/30 to-yellow-400/10 text-amber-300" : "from-rose-500/30 to-orange-400/10 text-rose-300";
              return (
                <li
                  key={n.id}
                  className={`group relative flex gap-3 rounded-2xl border p-3 transition ${
                    n.read_at ? "border-white/5 bg-white/[0.02]" : "border-emerald-400/20 bg-emerald-400/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  }`}
                >
                  <span className={`relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${tone} ring-1 ring-white/10`}>
                    <Bell className="size-4" />
                    {!n.read_at && (
                      <span className="absolute -right-1 -top-1 size-2.5 animate-pulse rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.9)]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-white">New grade</p>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                        {formatDistanceToNowStrict(new Date(n.received_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="truncate text-xs text-zinc-400">
                      {n.course_name}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="truncate text-xs text-zinc-300">{n.grade_title}</span>
                      <span className={`shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[11px] font-semibold ${tone.split(" ").pop()}`}>
                        {n.score}/{n.max_score}
                      </span>
                      {pct < 50 && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-orange-400">Important</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(n.id)}
                    aria-label={`Delete alert for ${n.grade_title}`}
                    className="absolute right-2 top-2 grid size-6 place-items-center rounded-full text-zinc-500 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
