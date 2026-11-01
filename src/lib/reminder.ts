// Pure date helpers for deadline reminder timing.
// Reminders fire `reminderLeadDays` before the due date, in Cairo time
// (quizzes 2 days ahead, assignments 1 day ahead).

export type DeadlineLike = {
  id: string;
  user_id: string;
  title: string;
  kind: string;
  due_date: string;
};

/** Today's date (YYYY-MM-DD) in Cairo. */
export function cairoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(now);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysUntilDue(dueDate: string, today: string): number {
  return Math.round(
    (Date.parse(dueDate + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86_400_000,
  );
}

export function reminderLeadDays(kind: string): number {
  return kind === "quiz" ? 2 : 1;
}

/** A reminder is due when the deadline falls inside its reminder window. */
export function isDueForReminder(row: DeadlineLike, today: string): boolean {
  const days = daysUntilDue(row.due_date, today);
  return days >= 0 && days <= reminderLeadDays(row.kind);
}

export function reminderTitle(kind: string, daysUntil: number): string {
  if (kind === "quiz") {
    if (daysUntil === 2) return "Quiz in 2 days";
    if (daysUntil === 1) return "Quiz tomorrow";
    return "Quiz today";
  }
  if (daysUntil === 1) return "Assignment due tomorrow";
  return "Assignment due today";
}

export function reminderBody(title: string, courseName?: string | null): string {
  return courseName ? `${title} — ${courseName}` : title;
}
