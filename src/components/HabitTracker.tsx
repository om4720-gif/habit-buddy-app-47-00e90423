import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { useState, type ReactNode } from "react";

import { getHabitHistory } from "@/lib/habits.functions";
import { habitColor } from "@/lib/habitColors";

type Range = "week" | "month" | "year";
type DayState = "done" | "missed" | "future" | "before";

const RANGES: Range[] = ["week", "month", "year"];
const WEEK_STARTS_ON = 1; // Monday. Use 6 for Saturday, 0 for Sunday.
const fmt = (d: Date) => format(d, "yyyy-MM-dd");
const leadBlanks = (d: Date) => (getDay(d) - WEEK_STARTS_ON + 7) % 7;

export function shiftBy(now: Date, range: Range, offset: number) {
  if (range === "week") return addWeeks(now, offset);
  if (range === "month") return addMonths(now, offset);
  return addYears(now, offset);
}

function boundsFor(range: Range, now: Date) {
  if (range === "week")
    return {
      start: startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON }),
      end: endOfWeek(now, { weekStartsOn: WEEK_STARTS_ON }),
    };
  if (range === "month") return { start: startOfMonth(now), end: endOfMonth(now) };
  return { start: startOfYear(now), end: endOfYear(now) };
}

export type TrackerData = {
  habits: { id: string; name: string; created_at: string }[];
  completions: { habit_id: string; completed_date: string }[];
};

export function HabitTracker({
  date,
  footer,
  onSelectDate,
}: {
  date: string;
  footer?: ReactNode;
  onSelectDate: (date: string) => void;
}) {
  const [range, setRange] = useState<Range>("month");
  const [offset, setOffset] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);

  const today = new Date(`${date}T00:00:00`);
  const { start, end } = boundsFor(range, shiftBy(today, range, offset));
  const startStr = fmt(start);
  const endStr = fmt(end);

  const { data, isPending } = useQuery({
    queryKey: ["habit-history", range, startStr],
    queryFn: () => getHabitHistory({ data: { start: startStr, end: endStr } }),
  });

  return (
    <TrackerView
      date={date}
      range={range}
      onRange={(r) => {
        setRange(r);
        setOffset(0);
      }}
      offset={offset}
      onOffset={setOffset}
      focusId={focusId}
      onFocus={setFocusId}
      onOpenMonth={(m) => {
        setRange("month");
        setOffset((m.getFullYear() - today.getFullYear()) * 12 + (m.getMonth() - today.getMonth()));
      }}
      data={data}
      isPending={isPending}
      footer={footer}
      onSelectDate={onSelectDate}
    />
  );
}

/** Pure view: everything is derived from props, so it is easy to test. */
export function TrackerView({
  date,
  range,
  onRange,
  offset,
  onOffset,
  focusId,
  onFocus,
  onOpenMonth,
  data,
  isPending,
  footer,
  onSelectDate,
}: {
  date: string;
  range: Range;
  onRange: (r: Range) => void;
  offset: number;
  onOffset: (n: number) => void;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  onOpenMonth: (month: Date) => void;
  data: TrackerData | undefined;
  isPending: boolean;
  footer?: ReactNode;
  onSelectDate: (date: string) => void;
}) {
  const today = new Date(`${date}T00:00:00`);
  const base = shiftBy(today, range, offset);
  const { start, end } = boundsFor(range, base);
  const startStr = fmt(start);

  const days = eachDayOfInterval({ start, end });
  const dayIndex = new Map(days.map((d, i) => [fmt(d), i]));
  const months = range === "year" ? eachMonthOfInterval({ start, end }) : [];

  const doneByHabit = new Map<string, Set<string>>();
  for (const c of data?.completions ?? []) {
    const set = doneByHabit.get(c.habit_id) ?? new Set<string>();
    set.add(c.completed_date);
    doneByHabit.set(c.habit_id, set);
  }

  const rows = (data?.habits ?? []).map((habit, index) => {
    const done = doneByHabit.get(habit.id) ?? new Set<string>();
    const created = habit.created_at ? fmt(new Date(habit.created_at)) : startStr;
    const firstDone = [...done].sort()[0];
    const since = firstDone && firstDone < created ? firstDone : created;
    const states: DayState[] = days.map((d) => {
      const s = fmt(d);
      if (s > date) return "future";
      if (s < since) return "before";
      return done.has(s) ? "done" : "missed";
    });
    const doneCount = states.filter((s) => s === "done").length;
    const possible = states.filter((s) => s === "done" || s === "missed").length;
    return {
      habit,
      color: habitColor(index),
      states,
      doneCount,
      possible,
      rate: possible > 0 ? doneCount / possible : 0,
    };
  });

  const focused = focusId ? rows.find((r) => r.habit.id === focusId) : undefined;
  const visible = focused ? [focused] : rows;
  const cols = Math.max(1, Math.min(visible.length, visible.length <= 6 ? 3 : 4));
  const dotSize =
    range === "week"
      ? focused
        ? "size-5"
        : "size-3 sm:size-3.5"
      : focused
        ? "size-3.5"
        : "size-1.5 sm:size-2";

  const stateOf = (r: (typeof rows)[number], s: string): DayState =>
    r.states[dayIndex.get(s) ?? -1] ?? "before";

  const dotsFor = (d: Date) => (
    <div className="mt-1 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}>
      {visible.map((r) => {
        const st = stateOf(r, fmt(d));
        return (
          <span
            key={r.habit.id}
            title={`${r.habit.name}, ${format(d, "EEE d MMM")}: ${
              st === "done"
                ? "done"
                : st === "missed"
                  ? "missed"
                  : st === "future"
                    ? "upcoming"
                    : "not started"
            }`}
            className={`block rounded-full ${dotSize}`}
            style={
              st === "done"
                ? { backgroundColor: r.color }
                : st === "missed"
                  ? { backgroundColor: `${r.color}22` }
                  : undefined
            }
          />
        );
      })}
    </div>
  );

  const period =
    range === "week"
      ? `${format(start, "MMM d")} – ${format(end, "MMM d")}`
      : range === "month"
        ? format(start, "MMMM yyyy")
        : format(start, "yyyy");

  const weekdayLetters = eachDayOfInterval({
    start: startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }),
    end: endOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }),
  }).map((d) => format(d, "EEEEE"));

  const arrow =
    "grid size-8 place-items-center rounded-full text-ink-soft transition hover:bg-paper hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">
          Calendar
        </h2>
        <div className="inline-flex rounded-full bg-paper p-1 ring-1 ring-black/5">
          {RANGES.map((r) => (
            <button
              key={r}
              aria-pressed={range === r}
              onClick={() => onRange(r)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                range === r
                  ? "bg-cream text-ink shadow-sm ring-1 ring-black/5"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-3xl bg-cream p-5 ring-1 ring-black/5 sm:p-6">
        <div className="flex items-center justify-between">
          <button
            className={arrow}
            aria-label={`Previous ${range}`}
            onClick={() => onOffset(offset - 1)}
          >
            ‹
          </button>
          <div className="text-center">
            <p className="font-display text-lg font-semibold tabular-nums text-ink">{period}</p>
            <p className="text-[11px] text-ink-soft">Select a day to review its habits.</p>
          </div>
          <button
            className={arrow}
            aria-label={`Next ${range}`}
            disabled={offset >= 0}
            onClick={() => onOffset(offset + 1)}
          >
            ›
          </button>
        </div>

        {isPending ? (
          <div className="mt-4 h-56 animate-pulse rounded-xl bg-paper" />
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            Add a habit and its dots will show up on the calendar.
          </p>
        ) : (
          <>
            {range === "week" && (
              <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
                {days.map((d) => {
                  const day = fmt(d);
                  const isToday = day === date;
                  const future = day > date;
                  return (
                    <button
                      key={day}
                      type="button"
                      data-day={day}
                      disabled={future}
                      onClick={() => onSelectDate(day)}
                      aria-label={`Review habits for ${format(d, "EEEE, MMMM d")}`}
                      title={future ? undefined : "Review habits for this day"}
                      className={`flex flex-col items-center rounded-2xl bg-paper px-1 py-3 transition enabled:hover:bg-sand enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-rust/50 ${
                        isToday ? "ring-2 ring-rust/50" : ""
                      } ${future ? "opacity-60" : ""}`}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                        {format(d, "EEE")}
                      </span>
                      <span
                        className={`font-display text-lg font-semibold tabular-nums ${isToday ? "text-rust" : "text-ink"}`}
                      >
                        {d.getDate()}
                      </span>
                      {dotsFor(d)}
                    </button>
                  );
                })}
              </div>
            )}

            {range === "month" && (
              <div className="mt-4">
                <div className="grid grid-cols-7 gap-1" aria-hidden="true">
                  {weekdayLetters.map((l, i) => (
                    <span
                      key={i}
                      className="text-center text-[10px] font-semibold uppercase text-ink-soft"
                    >
                      {l}
                    </span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {Array.from({ length: leadBlanks(start) }).map((_, i) => (
                    <span key={`b${i}`} />
                  ))}
                  {days.map((d) => {
                    const day = fmt(d);
                    const isToday = day === date;
                    const future = day > date;
                    return (
                      <button
                        key={day}
                        type="button"
                        data-day={day}
                        disabled={future}
                        onClick={() => onSelectDate(day)}
                        aria-label={`Review habits for ${format(d, "EEEE, MMMM d")}`}
                        title={future ? undefined : "Review habits for this day"}
                        className={`flex min-h-[44px] w-full flex-col items-center rounded-xl px-0.5 py-1 transition enabled:hover:bg-paper enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-rust/50 sm:min-h-[56px] ${
                          isToday ? "bg-rust/10 ring-1 ring-rust/40" : ""
                        }`}
                      >
                        <span
                          className={`text-[11px] font-semibold tabular-nums ${
                            isToday ? "text-rust" : future ? "text-ink-soft/40" : "text-ink-soft"
                          }`}
                        >
                          {d.getDate()}
                        </span>
                        {dotsFor(d)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {range === "year" && (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {months.map((m) => {
                  const monthDays = days.filter((d) => d.getMonth() === m.getMonth());
                  const upcoming = startOfMonth(m) > today;
                  return (
                    <button
                      key={m.getMonth()}
                      disabled={upcoming}
                      onClick={() => onOpenMonth(m)}
                      aria-label={`Open ${format(m, "MMMM")}`}
                      className="rounded-2xl p-2 text-left transition enabled:hover:bg-paper disabled:opacity-50"
                    >
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                        {format(m, "MMM")}
                      </p>
                      <div className="grid grid-cols-7 gap-[2px]">
                        {Array.from({ length: leadBlanks(startOfMonth(m)) }).map((_, i) => (
                          <span key={`b${i}`} />
                        ))}
                        {monthDays.map((d) => {
                          const s = fmt(d);
                          let style: React.CSSProperties | undefined;
                          if (focused) {
                            const st = stateOf(focused, s);
                            style =
                              st === "done"
                                ? { backgroundColor: focused.color }
                                : st === "missed"
                                  ? { backgroundColor: `${focused.color}22` }
                                  : undefined;
                          } else {
                            const sts = rows
                              .map((r) => stateOf(r, s))
                              .filter((x) => x === "done" || x === "missed");
                            if (sts.length > 0) {
                              const frac = sts.filter((x) => x === "done").length / sts.length;
                              style = {
                                backgroundColor: "var(--rust)",
                                opacity: 0.15 + 0.85 * frac,
                              };
                            }
                          }
                          return (
                            <span
                              key={s}
                              data-day={s}
                              className={`aspect-square rounded-[3px] ${style ? "" : "bg-sand/40"}`}
                              style={style}
                            />
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <ul className="mt-5 space-y-1 border-t border-line pt-4">
              {rows.map((r) => {
                const active = focusId === r.habit.id;
                return (
                  <li key={r.habit.id}>
                    <button
                      aria-pressed={active}
                      onClick={() => onFocus(active ? null : r.habit.id)}
                      className={`w-full rounded-xl px-2 py-1.5 text-left transition hover:bg-paper ${
                        active ? "bg-paper ring-1 ring-black/5" : focusId ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: r.color }}
                          />
                          <span className="truncate">{r.habit.name}</span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-ink-soft">
                          {r.doneCount}/{r.possible} · {Math.round(r.rate * 100)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand/60">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round(r.rate * 100)}%`,
                            backgroundColor: r.color,
                          }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-ink-soft">Tap a habit to see only its dots.</p>
          </>
        )}

        {footer}
      </div>
    </section>
  );
}
