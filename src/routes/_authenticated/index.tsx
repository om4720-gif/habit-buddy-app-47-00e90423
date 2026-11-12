import { createFileRoute } from "@tanstack/react-router";
import { format, subDays } from "date-fns";
import { Flame, MoreHorizontal, Palette, Plus, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Buddy, type BuddyMood } from "@/components/Buddy";
import { ExamStrip } from "@/components/ExamStrip";
import { HabitTracker } from "@/components/HabitTracker";
import { habitColor } from "@/lib/habitColors";
import { markYoursSeen, useYoursSeen } from "@/lib/customize";
import { PointsChip, RewardsDialog, useRewards } from "@/components/RewardShop";
import { AddHabitModal } from "@/components/AddHabitModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createHabit,
  deleteHabit,
  getHabitsForDate,
  getStats,
  toggleCompletion,
  updateHabit,
} from "@/lib/habits.functions";
import { supabase } from "@/integrations/supabase/client";
import { isSoundOn, playAllDone, playTick, setSoundOn } from "@/lib/sounds";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Today — Ritual" },
      { name: "description", content: "Your daily habit dashboard." },
      { property: "og:title", content: "Today — Ritual" },
      { property: "og:description", content: "Your daily habit dashboard." },
    ],
  }),
  component: DashboardPage,
});

const today = () => format(new Date(), "yyyy-MM-dd");

function DashboardPage() {
  const date = today();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState<"treats" | "buddy" | null>(null);
  const [reviewDate, setReviewDate] = useState<string | null>(null);
  const yoursSeen = useYoursSeen();
  const [soundOn, setSoundOnState] = useState(isSoundOn);
  const { balance } = useRewards();

  const { data: habits, isPending: habitsPending } = useQuery({
    queryKey: ["habits", date],
    queryFn: () => getHabitsForDate({ data: { date } }),
  });

  const {
    data: reviewHabits,
    isPending: reviewHabitsPending,
    isError: reviewHabitsError,
  } = useQuery({
    queryKey: ["habits", reviewDate],
    queryFn: () => getHabitsForDate({ data: { date: reviewDate ?? date } }),
    enabled: reviewDate !== null,
  });

  const { data: stats, isPending: statsPending } = useQuery({
    queryKey: ["stats", date],
    queryFn: () => getStats({ data: { date } }),
  });

  const reviewableHabits = reviewDate
    ? reviewHabits?.filter(
        (habit) =>
          !habit.created_at || format(new Date(habit.created_at), "yyyy-MM-dd") <= reviewDate,
      )
    : reviewHabits;

  const completedCount = habits?.filter((h) => h.completed).length ?? 0;
  const totalCount = habits?.length ?? 0;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundOnState(next);
    if (next) playTick();
  };

  const handleToggle = async (habitId: string, completionDate = date) => {
    // Play instantly on tick (not on un-tick) so it feels snappy.
    const currentHabits = completionDate === date ? habits : reviewableHabits;
    const completed = currentHabits?.filter((h) => h.completed).length ?? 0;
    const total = currentHabits?.length ?? 0;
    const wasDone = currentHabits?.find((h) => h.id === habitId)?.completed;
    if (!wasDone) {
      if (total > 0 && completed + 1 === total) playAllDone();
      else playTick();
    }
    try {
      await toggleCompletion({ data: { habitId, date: completionDate } });
      queryClient.invalidateQueries({ queryKey: ["habits", completionDate] });
      queryClient.invalidateQueries({ queryKey: ["stats", date] });
      queryClient.invalidateQueries({ queryKey: ["habit-history"] });
      queryClient.invalidateQueries({ queryKey: ["points"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update habit.");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen bg-background text-ink">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-14 animate-rise">
        <Header
          date={date}
          streak={stats?.longestStreak ?? 0}
          balance={balance}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          showNew={!yoursSeen}
          onOpenRewards={() => setRewardsOpen("treats")}
          onOpenCustomize={() => setRewardsOpen("buddy")}
          onSignOut={handleSignOut}
        />

        <ProgressCard
          completed={completedCount}
          total={totalCount}
          progress={progress}
          onAdd={() => setIsAdding(true)}
        />

        <ExamStrip />

        {!yoursSeen && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-cream px-4 py-3 ring-1 ring-black/5">
            <span className="text-lg" aria-hidden="true">
              🎨
            </span>
            <p className="min-w-0 flex-1 text-sm text-ink">
              <span className="font-semibold">New:</span> dress up Buddy and recolor the app with
              your points.
            </p>
            <button
              onClick={() => setRewardsOpen("buddy")}
              className="shrink-0 rounded-full bg-rust px-3 py-1.5 text-xs font-semibold text-cream transition hover:bg-rust/90"
            >
              Take a look
            </button>
            <button
              onClick={markYoursSeen}
              aria-label="Dismiss"
              className="grid size-7 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-sand hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        <section className="mt-10">
          <SectionTitle title="Today" meta={`${completedCount} of ${totalCount} done`} />

          {habitsPending ? (
            <div className="mt-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-cream" />
              ))}
            </div>
          ) : habits && habits.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {habits.map((habit, i) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  color={habitColor(i)}
                  onToggle={() => handleToggle(habit.id)}
                  onUpdate={async (updates) => {
                    await updateHabit({ data: { habitId: habit.id, ...updates } });
                    queryClient.invalidateQueries({ queryKey: ["habits", date] });
                  }}
                  onDelete={async () => {
                    await deleteHabit({ data: { habitId: habit.id } });
                    queryClient.invalidateQueries({ queryKey: ["habits", date] });
                    queryClient.invalidateQueries({ queryKey: ["stats", date] });
                    queryClient.invalidateQueries({ queryKey: ["habit-history"] });
                  }}
                />
              ))}
            </ul>
          ) : (
            <EmptyState onAdd={() => setIsAdding(true)} />
          )}
        </section>

        <HabitTracker
          date={date}
          onSelectDate={setReviewDate}
          footer={
            <StatsRow
              longestStreak={stats?.longestStreak ?? 0}
              longestStreakHabit={stats?.longestStreakHabit ?? "—"}
              consistencyRate={stats?.consistencyRate ?? 0}
              activeHabitCount={stats?.activeHabitCount ?? 0}
              statsPending={statsPending}
            />
          }
        />
      </div>

      <Dialog
        open={reviewDate !== null}
        onOpenChange={(open) => {
          if (!open) setReviewDate(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border-line bg-card">
          {reviewDate && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl text-ink">
                  {format(new Date(`${reviewDate}T00:00:00`), "EEEE, MMMM d")}
                </DialogTitle>
                <DialogDescription>
                  Review and update the habits you completed that day.
                </DialogDescription>
              </DialogHeader>

              {reviewHabitsPending ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-2xl bg-cream" />
                  ))}
                </div>
              ) : reviewHabitsError ? (
                <p className="text-sm text-destructive">Could not load habits for this day.</p>
              ) : reviewableHabits && reviewableHabits.length > 0 ? (
                <>
                  <p className="text-xs tabular-nums text-ink-soft">
                    {reviewableHabits.filter((habit) => habit.completed).length} of{" "}
                    {reviewableHabits.length} done
                  </p>
                  <ul className="space-y-3">
                    {reviewableHabits.map((habit, i) => {
                      const color = habitColor(i);
                      return (
                        <li
                          key={habit.id}
                          className={`flex items-center gap-4 rounded-2xl bg-cream p-4 ring-1 ring-black/5 transition ${
                            habit.completed ? "opacity-70" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleToggle(habit.id, reviewDate)}
                            aria-pressed={habit.completed}
                            aria-label={`Mark ${habit.name} as ${habit.completed ? "not done" : "done"}`}
                            className={`grid size-8 shrink-0 place-items-center rounded-full border-2 transition ${
                              habit.completed ? "stamp-check text-cream" : "text-transparent"
                            }`}
                            style={
                              habit.completed
                                ? { backgroundColor: color, borderColor: color }
                                : { borderColor: `${color}66`, color: `${color}66` }
                            }
                          >
                            <span className="font-display text-sm leading-none font-semibold">
                              ✓
                            </span>
                          </button>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`font-medium text-balance ${
                                habit.completed
                                  ? "text-ink-soft line-through decoration-rust/40"
                                  : "text-ink"
                              }`}
                            >
                              {habit.name}
                            </p>
                            {habit.description ? (
                              <p className="mt-0.5 truncate text-xs text-ink-soft">
                                {habit.description}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-ink-soft">No habits to review for this day.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {isAdding && (
        <AddHabitModal
          onClose={() => setIsAdding(false)}
          onCreate={async (values) => {
            await createHabit({ data: values });
            queryClient.invalidateQueries({ queryKey: ["habits", date] });
            queryClient.invalidateQueries({ queryKey: ["stats", date] });
            queryClient.invalidateQueries({ queryKey: ["habit-history"] });
            setIsAdding(false);
          }}
        />
      )}

      {rewardsOpen && (
        <RewardsDialog initialTab={rewardsOpen} onClose={() => setRewardsOpen(null)} />
      )}
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-soft">{title}</h2>
      {meta ? <span className="text-xs tabular-nums text-ink-soft">{meta}</span> : null}
    </div>
  );
}

function Header({
  date,
  streak,
  balance,
  soundOn,
  onToggleSound,
  onOpenRewards,
  onOpenCustomize,
  showNew,
  onSignOut,
}: {
  date: string;
  streak: number;
  balance: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenRewards: () => void;
  onOpenCustomize: () => void;
  showNew: boolean;
  onSignOut: () => void;
}) {
  const displayDate = format(new Date(`${date}T00:00:00`), "EEEE, MMMM d");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rust">Ritual</p>
        <div className="flex items-center gap-2">
          <span
            title="Best streak"
            className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3.5 py-2 text-sm font-semibold tabular-nums ring-1 ring-black/5"
          >
            <Flame className="size-4 text-rust" />
            {streak}
          </span>
          <PointsChip balance={balance} onClick={onOpenRewards} />
          <button
            onClick={onOpenCustomize}
            className="relative grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-sand hover:text-ink"
            aria-label="Make it yours: dress up Buddy and change colors"
            title="Make it yours"
          >
            <Palette className="size-[18px]" />
            {showNew && (
              <span className="absolute right-1 top-1 size-2.5 rounded-full bg-rust ring-2 ring-background" />
            )}
          </button>
          <button
            onClick={onToggleSound}
            className="grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-sand hover:text-ink"
            aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
            title={soundOn ? "Sound on" : "Sound off"}
          >
            {soundOn ? <Volume2 className="size-[18px]" /> : <VolumeX className="size-[18px]" />}
          </button>
          <button
            onClick={onSignOut}
            className="grid size-9 place-items-center rounded-full text-ink-soft transition hover:bg-sand hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
          </button>
        </div>
      </div>
      <h1 className="font-display mt-6 text-4xl font-semibold leading-tight text-balance sm:text-5xl">
        {greeting}
      </h1>
      <p className="mt-1.5 text-base text-ink-soft">{displayDate}</p>
    </header>
  );
}

function ProgressCard({
  completed,
  total,
  progress,
  onAdd,
}: {
  completed: number;
  total: number;
  progress: number;
  onAdd: () => void;
}) {
  const circumference = 2 * Math.PI * 30;
  const offset = circumference * (1 - progress);
  const left = total - completed;
  const mood: BuddyMood =
    total === 0 ? "wave" : left === 0 ? "party" : completed === 0 ? "ready" : "happy";
  const headline =
    total === 0
      ? "Start your ritual"
      : left === 0
        ? "All habits stamped"
        : completed === 0
          ? `${left} habit${left === 1 ? "" : "s"} to stamp today`
          : `${left} more to go`;
  const sub =
    total === 0
      ? "Add one small habit to begin."
      : left === 0
        ? "A quiet, complete day. Tomorrow is a fresh page."
        : completed === 0
          ? "Start with the easiest one."
          : "Nice rhythm. Keep it loose.";

  return (
    <section className="relative mt-16 rounded-3xl bg-gradient-to-br from-cream to-sand/70 p-6 shadow-sm ring-1 ring-black/5 sm:p-7">
      <div className="absolute -top-[72px] right-5 z-10 sm:right-8">
        <Buddy mood={mood} completed={completed} total={total} />
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative grid size-24 shrink-0 place-items-center">
          <svg viewBox="0 0 72 72" className="size-24 -rotate-90">
            <circle
              cx="36"
              cy="36"
              r="30"
              fill="none"
              className="text-paper"
              stroke="currentColor"
              strokeWidth="6"
            />
            <circle
              cx="36"
              cy="36"
              r="30"
              fill="none"
              className="text-rust"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ animation: "ringFill 0.8s ease-out 0.1s both" }}
            />
          </svg>
          <span className="absolute font-display text-xl font-semibold tabular-nums">
            {completed}
            <span className="text-sm text-ink-soft">/{total}</span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold leading-tight text-balance sm:text-2xl">
            {headline}
          </p>
          <p className="mt-1 text-sm text-ink-soft text-pretty">{sub}</p>
        </div>
        <button
          onClick={onAdd}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rust px-4 py-2.5 text-sm font-semibold text-cream ring-1 ring-rust/40 transition hover:bg-rust/90"
        >
          <Plus className="size-4" />
          Add habit
        </button>
      </div>
    </section>
  );
}

function HabitRow({
  habit,
  color,
  onToggle,
  onUpdate,
  onDelete,
}: {
  habit: Awaited<ReturnType<typeof getHabitsForDate>>[number];
  color: string;
  onToggle: () => void;
  onUpdate: (updates: { name?: string; description?: string }) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      <li
        className={`flex items-center gap-4 rounded-2xl bg-cream p-4 ring-1 ring-black/5 transition hover:shadow-sm ${
          habit.completed ? "opacity-70" : ""
        }`}
      >
        <button
          onClick={onToggle}
          aria-label={`Mark ${habit.name} as ${habit.completed ? "not done" : "done"}`}
          className={`grid size-8 shrink-0 place-items-center rounded-full border-2 transition ${
            habit.completed ? "stamp-check text-cream" : "text-transparent"
          }`}
          style={
            habit.completed
              ? { backgroundColor: color, borderColor: color }
              : { borderColor: `${color}66`, color: `${color}66` }
          }
        >
          <span className="font-display text-sm leading-none font-semibold">✓</span>
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`font-medium text-balance ${
              habit.completed ? "text-ink-soft line-through decoration-rust/40" : "text-ink"
            }`}
          >
            {habit.name}
          </p>
          {habit.description ? (
            <p className="mt-0.5 truncate text-xs text-ink-soft">{habit.description}</p>
          ) : null}
        </div>
        {habit.streak > 0 ? (
          <span
            title={`${habit.streak} day streak`}
            className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-semibold tabular-nums text-ink-soft"
          >
            <Flame className="size-3.5 text-rust" />
            {habit.streak}
          </span>
        ) : null}
        <button
          onClick={() => setIsEditing(true)}
          className="grid size-8 place-items-center rounded-full text-ink-soft transition hover:bg-sand hover:text-ink"
          aria-label="Edit habit"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </li>

      {isEditing && (
        <EditHabitModal
          habit={habit}
          onClose={() => setIsEditing(false)}
          onSave={async (values) => {
            await onUpdate(values);
            setIsEditing(false);
          }}
          onDelete={async () => {
            await onDelete();
            setIsEditing(false);
          }}
        />
      )}
    </>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-4 rounded-2xl bg-cream p-8 text-center ring-1 ring-black/5">
      <p className="font-display text-lg font-semibold text-ink">No habits yet</p>
      <p className="mt-1 text-sm text-ink-soft">
        Add your first small act and start building the streak.
      </p>
      <button
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-rust px-4 py-2 text-sm font-semibold text-cream ring-1 ring-rust/40 transition hover:bg-rust/90"
      >
        <Plus className="size-4" />
        Add habit
      </button>
    </div>
  );
}

function StatsRow({
  longestStreak,
  longestStreakHabit,
  consistencyRate,
  activeHabitCount,
  statsPending,
}: {
  longestStreak: number;
  longestStreakHabit: string;
  consistencyRate: number;
  activeHabitCount: number;
  statsPending: boolean;
}) {
  const stats = [
    { label: "Best streak", value: longestStreak, title: longestStreakHabit },
    { label: "This month", value: `${consistencyRate}%`, title: "Consistency rate" },
    { label: "Active", value: activeHabitCount, title: "Habits in practice now" },
  ];

  return (
    <div className="mt-6 grid grid-cols-3 divide-x divide-line border-t border-line pt-5">
      {stats.map((stat) => (
        <div key={stat.label} title={stat.title} className="px-3 first:pl-0 last:pr-0">
          <p className="font-display text-2xl font-semibold tabular-nums">
            {statsPending ? "—" : stat.value}
          </p>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-soft">
            {stat.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function EditHabitModal({
  habit,
  onClose,
  onSave,
  onDelete,
}: {
  habit: Awaited<ReturnType<typeof getHabitsForDate>>[number];
  onClose: () => void;
  onSave: (values: { name: string; description: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(habit.name);
  const [description, setDescription] = useState(habit.description ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update habit.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this habit and its history?")) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete habit.");
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-cream p-6 ring-1 ring-black/5">
        <h2 className="font-display text-xl font-semibold text-ink">Edit habit</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-soft">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="mt-1.5 block w-full rounded-xl border-0 bg-paper px-3 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-rust"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-soft">
              Note
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              className="mt-1.5 block w-full rounded-xl border-0 bg-paper px-3 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-rust"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2.5 text-sm font-semibold text-destructive ring-1 ring-line transition hover:bg-sand disabled:opacity-60"
            >
              <Trash2 className="size-4" />
              {deleting ? "Deleting..." : "Delete"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full bg-paper px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-line transition hover:bg-sand"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-full bg-rust px-4 py-2.5 text-sm font-semibold text-cream ring-1 ring-rust/40 transition hover:bg-rust/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
