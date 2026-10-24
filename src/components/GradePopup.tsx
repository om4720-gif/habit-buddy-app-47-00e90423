import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { dismissGradeNotifications, getUnreadGradeNotifications } from "@/lib/grades.functions";

type Note = {
  id: string;
  course_name: string;
  course_code: string | null;
  grade_title: string;
  score: number;
  max_score: number;
};

/** Pops up each new grade that arrived from GUC, one at a time. Dismissing marks it as read. */
export function GradePopup() {
  const qc = useQueryClient();
  const fetchUnread = useServerFn(getUnreadGradeNotifications);
  const dismiss = useServerFn(dismissGradeNotifications);
  const { data: notes = [] } = useQuery({
    queryKey: ["grade-notifications"],
    queryFn: () => fetchUnread(),
    refetchInterval: 60_000, // check every minute while the app is open
    refetchOnWindowFocus: true,
  });
  const [shown, setShown] = useState<Note | null>(null);

  useEffect(() => {
    if (!shown && notes.length > 0) setShown(notes[0] as Note);
  }, [notes, shown]);

  if (!shown) return null;
  const remaining = notes.filter((n) => n.id !== shown.id).length;

  async function close() {
    await dismiss({ data: { notificationIds: [shown!.id] } });
    setShown(null);
    await qc.invalidateQueries({ queryKey: ["grade-notifications"] });
  }

  return (
    <div className="fixed inset-x-4 bottom-6 z-[70] mx-auto max-w-sm rounded-2xl border border-line bg-card p-4 shadow-lg" role="alertdialog" aria-live="polite">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rust">New grade posted</p>
      <p className="mt-1 font-display text-lg text-ink">
        {shown.course_name}
        {shown.course_code ? ` · ${shown.course_code}` : ""}
      </p>
      <p className="text-sm text-ink-soft">
        {shown.grade_title}: <span className="font-semibold text-ink">{shown.score} / {shown.max_score}</span>
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-ink-soft">{remaining > 0 ? `${remaining} more` : ""}</span>
        <Button size="sm" className="rounded-full" onClick={close}>
          Got it
        </Button>
      </div>
    </div>
  );
}
