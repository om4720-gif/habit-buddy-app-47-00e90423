import { useState } from "react";

type Category = { id: string; title: string };
export type UnsortedRow = { id: string; course_id: string; title: string; score: number; max_score: number };

/** Grades the app couldn't place in a category. The owner picks the category and it moves there. */
export function UnsortedGrades({
  rows,
  categories,
  onAssign,
  onDismiss,
}: {
  rows: UnsortedRow[];
  categories: Category[];
  onAssign: (row: UnsortedRow, categoryId: string) => void;
  onDismiss: (row: UnsortedRow) => void;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  if (rows.length === 0) return null;
  return (
    <div className="mx-5 mt-4 rounded-2xl border border-dashed border-line bg-paper p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
        Unsorted ({rows.length}) · choose a category
      </p>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">{row.title}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">
              {row.score} / {row.max_score}
            </span>
            <select
              aria-label={`Category for ${row.title}`}
              value={choice[row.id] ?? ""}
              onChange={(e) => setChoice({ ...choice, [row.id]: e.target.value })}
              className="max-w-[12rem] rounded-lg border border-line bg-background px-2 py-1 text-xs text-ink"
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!choice[row.id]}
              onClick={() => choice[row.id] && onAssign(row, choice[row.id]!)}
              className="rounded-full bg-rust px-3 py-1 text-xs font-semibold text-cream disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => onDismiss(row)}
              className="rounded-full px-2 py-1 text-xs text-ink-soft hover:bg-sand hover:text-ink"
              aria-label={`Remove ${row.title}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
