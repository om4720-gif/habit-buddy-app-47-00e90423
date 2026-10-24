import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  connectGradeFeed,
  disconnectGradeFeed,
  getGradeFeedStatus,
  syncGradeFeedNow,
} from "@/lib/grade-feed.functions";
import {
  createGradeItem,
  deleteGradeItem,
  getCourseGradeSettings,
  getGradeItems,
  saveCourseGradeSettings,
  updateGradeItem,
} from "@/lib/grades.functions";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImportGrades } from "@/components/ImportGrades";
import { WeightsImport } from "@/components/WeightsImport";
import { checkWeights, type WeightRow } from "@/lib/weights";
import { Input } from "@/components/ui/input";
type Course = { id: string; name: string; code: string | null; color: string | null };
type GradeItem = {
  id: string;
  course_id: string;
  title: string;
  score: number | null;
  max_score: number;
  weight: number;
  is_final: boolean;
  marks?: GradeMark[];
  best_count?: number | null;
  expected_count?: number | null;
};
type GradeMark = {
  id: string;
  name: string;
  score: number | null;
  max_score: number;
  counts_for?: string;
};
type CourseGradeSettings = {
  course_id: string;
  credit_hours: number;
  grade_cutoffs: Record<string, { minimum: number; gpaStart: number; gpaEnd: number }>;
};
type GradeForm = {
  title: string;
  score: string;
  maxScore: string;
  weight: string;
  isFinal: boolean;
  bestCount: string;
  expectedCount: string;
  marks: { id: string; name: string; score: string; maxScore: string; countsFor: string }[];
};
type GradeCutoff = { label: string; minimum: string; gpaStart: string; gpaEnd: string };

const emptyForm: GradeForm = {
  title: "",
  score: "",
  maxScore: "100",
  weight: "",
  isFinal: false,
  bestCount: "",
  expectedCount: "",
  marks: [],
};
const defaultCutoffs: GradeCutoff[] = [
  { label: "A+", minimum: "94", gpaStart: "0.99", gpaEnd: "0.7" },
  { label: "A", minimum: "90", gpaStart: "1.29", gpaEnd: "1.0" },
  { label: "A-", minimum: "86", gpaStart: "1.69", gpaEnd: "1.3" },
  { label: "B+", minimum: "82", gpaStart: "1.99", gpaEnd: "1.7" },
  { label: "B", minimum: "78", gpaStart: "2.29", gpaEnd: "2.0" },
  { label: "B-", minimum: "74", gpaStart: "2.69", gpaEnd: "2.3" },
  { label: "C+", minimum: "70", gpaStart: "2.99", gpaEnd: "2.7" },
  { label: "C", minimum: "65", gpaStart: "3.29", gpaEnd: "3.0" },
  { label: "C-", minimum: "60", gpaStart: "3.69", gpaEnd: "3.3" },
  { label: "D+", minimum: "55", gpaStart: "3.99", gpaEnd: "3.7" },
  { label: "D", minimum: "50", gpaStart: "4.99", gpaEnd: "4.0" },
  { label: "F", minimum: "0", gpaStart: "5.0", gpaEnd: "5.0" },
];
const percent = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
type GradeBand = { label: string; minimum: number; gpaStart: number; gpaEnd: number };

function itemProgress(item: GradeItem) {
  if (item.score !== null) {
    const ratio = item.max_score > 0 ? item.score / item.max_score : 0;
    return { markedWeight: item.weight, earnedWeight: item.weight * ratio, ratio };
  }

  const marks = (item.marks ?? []).filter(
    (mark) => mark.score !== null && mark.counts_for !== "exclude" && mark.max_score > 0,
  );
  if (marks.length === 0) return { markedWeight: 0, earnedWeight: 0, ratio: null };

  const bestCount = Math.max(1, item.best_count ?? item.expected_count ?? marks.length);
  const selected = marks
    .slice()
    .sort((a, b) => (b.score ?? 0) / b.max_score - (a.score ?? 0) / a.max_score)
    .slice(0, bestCount);
  const coverage = Math.min(1, selected.length / bestCount);
  const ratio =
    selected.reduce((sum, mark) => sum + (mark.score ?? 0) / mark.max_score, 0) / selected.length;
  const markedWeight = item.weight * coverage;
  return { markedWeight, earnedWeight: markedWeight * ratio, ratio };
}

function gpaForGrade(average: number, bands: GradeBand[]) {
  const index = bands.findIndex((band) => average >= band.minimum);
  if (index < 0) return null;
  const band = bands[index]!;
  const upperBound = index === 0 ? 100 : bands[index - 1]!.minimum - 0.1;
  const progress =
    upperBound <= band.minimum
      ? 1
      : Math.max(0, Math.min(1, (average - band.minimum) / (upperBound - band.minimum)));
  return band.gpaStart + (band.gpaEnd - band.gpaStart) * progress;
}

function readCutoffs(value: unknown): GradeCutoff[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultCutoffs;
  const rows = Object.entries(value).flatMap(([label, cutoff]) => {
    if (!cutoff || typeof cutoff !== "object" || Array.isArray(cutoff)) return [];
    const values = cutoff as { minimum?: unknown; gpaStart?: unknown; gpaEnd?: unknown };
    if (
      typeof values.minimum !== "number" ||
      typeof values.gpaStart !== "number" ||
      typeof values.gpaEnd !== "number"
    )
      return [];
    return [
      {
        label,
        minimum: String(values.minimum),
        gpaStart: String(values.gpaStart),
        gpaEnd: String(values.gpaEnd),
      },
    ];
  });
  return rows.length ? rows : defaultCutoffs;
}

const LOCAL_GRADES_KEY = "habit-buddy:course-grades:v1";

function readLocalGrades(): { items: GradeItem[]; settings: CourseGradeSettings[] } {
  try {
    const raw = localStorage.getItem(LOCAL_GRADES_KEY);
    if (!raw) return { items: [], settings: [] };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { items: [], settings: [] };
    const data = parsed as { items?: unknown; settings?: unknown };
    return {
      items: Array.isArray(data.items) ? (data.items as GradeItem[]) : [],
      settings: Array.isArray(data.settings) ? (data.settings as CourseGradeSettings[]) : [],
    };
  } catch {
    return { items: [], settings: [] };
  }
}

export function GradesSection({ courses }: { courses: Course[] }) {
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id ?? "");
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GradeItem | null>(null);
  const [form, setForm] = useState<GradeForm>(emptyForm);
  const [cutoffForm, setCutoffForm] = useState<GradeCutoff[]>(defaultCutoffs);
  const [creditHours, setCreditHours] = useState("3");
  const [gradeItems, setGradeItems] = useState<GradeItem[]>([]);
  const [gradeSettings, setGradeSettings] = useState<CourseGradeSettings[]>([]);
  const [importCourseId, setImportCourseId] = useState<string | null>(null);
  const [gradeFileOpen, setGradeFileOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedKey, setFeedKey] = useState("");
  const connectFeedFn = useServerFn(connectGradeFeed);
  const disconnectFeedFn = useServerFn(disconnectGradeFeed);
  const feedStatusFn = useServerFn(getGradeFeedStatus);
  const syncFeedFn = useServerFn(syncGradeFeedNow);
  const { data: feed, refetch: refetchFeed } = useQuery({
    queryKey: ["grade-feed-status"],
    queryFn: () => feedStatusFn(),
    retry: false,
  });

  const queryClient = useQueryClient();
  const fetchItems = useServerFn(getGradeItems);
  const fetchSettings = useServerFn(getCourseGradeSettings);
  const createItemFn = useServerFn(createGradeItem);
  const updateItemFn = useServerFn(updateGradeItem);
  const deleteItemFn = useServerFn(deleteGradeItem);
  const saveSettingsFn = useServerFn(saveCourseGradeSettings);

  const { data: remoteItems, isPending: itemsPending } = useQuery({
    queryKey: ["grade-items"],
    queryFn: () => fetchItems({ data: {} }),
  });
  const { data: remoteSettings } = useQuery({
    queryKey: ["grade-settings"],
    queryFn: () => fetchSettings({ data: {} }),
  });

  useEffect(() => {
    if (!remoteItems) return;
    setGradeItems(
      remoteItems.map((row) => ({
        id: row.id,
        course_id: row.course_id,
        title: row.title,
        score: row.score === null ? null : Number(row.score),
        max_score: Number(row.max_score),
        weight: Number(row.weight),
        is_final: row.is_final,
        marks: Array.isArray(row.marks) ? (row.marks as unknown as GradeMark[]) : [],
        best_count: row.best_count,
        expected_count: row.expected_count,
      })),
    );
  }, [remoteItems]);

  useEffect(() => {
    if (!remoteSettings) return;
    setGradeSettings(
      remoteSettings.map((row) => ({
        course_id: row.course_id,
        credit_hours: Number(row.credit_hours),
        grade_cutoffs: row.grade_cutoffs as unknown as CourseGradeSettings["grade_cutoffs"],
      })),
    );
  }, [remoteSettings]);

  // One-time move: grades saved in this browser before the database switch are copied to the account.
  useEffect(() => {
    if (itemsPending || !remoteItems || remoteItems.length > 0) return;
    const saved = readLocalGrades();
    if (saved.items.length === 0 && saved.settings.length === 0) return;
    void syncToServer([], saved.items, [], saved.settings).then(() => {
      try {
        localStorage.removeItem(LOCAL_GRADES_KEY);
      } catch {
        /* storage unavailable: nothing to clean up */
      }
      toast.success("Your saved grades were moved to your account.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsPending, remoteItems]);

  /** Saves weights from the import dialog. Returns an error message, or null when saved. */
  function importWeights(courseId: string, rows: WeightRow[], creditHours: number | null): string | null {
    const current = gradeItems.filter((item) => item.course_id === courseId);
    const problem = checkWeights(rows, current);
    if (problem) return problem;
    const created: GradeItem[] = rows.map((row) => ({
      id: crypto.randomUUID(),
      course_id: courseId,
      title: row.title,
      score: null,
      max_score: 100,
      weight: row.weight,
      is_final: row.isFinal,
      marks: [],
      best_count: row.bestCount ?? null,
      expected_count: row.expectedCount ?? null,
    }));
    let nextSettings = gradeSettings;
    if (creditHours !== null && creditHours > 0 && creditHours <= 30) {
      const hasSettings = gradeSettings.some((setting) => setting.course_id === courseId);
      nextSettings = hasSettings
        ? gradeSettings.map((setting) =>
            setting.course_id === courseId ? { ...setting, credit_hours: creditHours } : setting,
          )
        : [
            ...gradeSettings,
            {
              course_id: courseId,
              credit_hours: creditHours,
              grade_cutoffs: Object.fromEntries(
                defaultCutoffs.map((item) => [
                  item.label,
                  { minimum: Number(item.minimum), gpaStart: Number(item.gpaStart), gpaEnd: Number(item.gpaEnd) },
                ]),
              ),
            },
          ];
    }
    persistLocalGrades([...gradeItems, ...created], nextSettings);
    return null;
  }

  function persistLocalGrades(items: GradeItem[], settings: CourseGradeSettings[]) {
    const previousItems = gradeItems;
    const previousSettings = gradeSettings;
    setGradeItems(items);
    setGradeSettings(settings);
    void syncToServer(previousItems, items, previousSettings, settings);
  }

  /** Writes only what changed to the database, then refreshes the page from it. */
  async function syncToServer(
    previousItems: GradeItem[],
    nextItems: GradeItem[],
    previousSettings: CourseGradeSettings[],
    nextSettings: CourseGradeSettings[],
  ) {
    try {
      const nextIds = new Set(nextItems.map((item) => item.id));
      for (const item of previousItems) {
        if (!nextIds.has(item.id)) await deleteItemFn({ data: { gradeItemId: item.id } });
      }
      const previousById = new Map(previousItems.map((item) => [item.id, item]));
      for (const item of nextItems) {
        const payload = {
          courseId: item.course_id,
          title: item.title,
          score: item.score,
          maxScore: item.max_score,
          weight: item.weight,
          isFinal: item.is_final,
          marks: (item.marks ?? []).map((mark) => ({
            id: mark.id,
            name: mark.name,
            score: mark.score,
            max_score: mark.max_score,
            counts_for: String(mark.counts_for),
          })),
          bestCount: item.best_count ?? null,
          expectedCount: item.expected_count ?? null,
        };
        const before = previousById.get(item.id);
        if (!before) await createItemFn({ data: { ...payload, id: item.id } });
        else if (JSON.stringify(before) !== JSON.stringify(item))
          await updateItemFn({ data: { ...payload, gradeItemId: item.id } });
      }
      for (const setting of nextSettings) {
        const before = previousSettings.find((s) => s.course_id === setting.course_id);
        if (!before || JSON.stringify(before) !== JSON.stringify(setting))
          await saveSettingsFn({
            data: {
              courseId: setting.course_id,
              creditHours: setting.credit_hours,
              gradeCutoffs: setting.grade_cutoffs,
            },
          });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the grades. Try again.");
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["grade-items"] });
      await queryClient.invalidateQueries({ queryKey: ["grade-settings"] });
    }
  }

  function updateGradeSettings(
    courseId: string,
    update: Partial<Omit<CourseGradeSettings, "course_id">>,
  ) {
    const existing = gradeSettings.find((setting) => setting.course_id === courseId);
    const next: CourseGradeSettings = {
      course_id: courseId,
      credit_hours: existing?.credit_hours ?? 3,
      grade_cutoffs:
        existing?.grade_cutoffs ??
        Object.fromEntries(
          defaultCutoffs.map((item) => [
            item.label,
            {
              minimum: Number(item.minimum),
              gpaStart: Number(item.gpaStart),
              gpaEnd: Number(item.gpaEnd),
            },
          ]),
        ),
      ...update,
    };
    persistLocalGrades(gradeItems, [
      ...gradeSettings.filter((setting) => setting.course_id !== courseId),
      next,
    ]);
  }

  useEffect(() => {
    if (!courses.some((course) => course.id === selectedCourseId))
      setSelectedCourseId(courses[0]?.id ?? "");
  }, [courses, selectedCourseId]);

  useEffect(() => {
    const currentSettings = gradeSettings.find((setting) => setting.course_id === selectedCourseId);
    setCutoffForm(readCutoffs(currentSettings?.grade_cutoffs));
    setCreditHours(String(currentSettings?.credit_hours ?? 3));
  }, [gradeSettings, selectedCourseId]);

  const selectedCourse = courses.find((item) => item.id === selectedCourseId);
  const courseGradeItems = gradeItems.filter((item) => item.course_id === selectedCourseId);
  const orderedItems = courseGradeItems
    .slice()
    .sort((a, b) => Number(b.is_final) - Number(a.is_final));
  const totalWeight = courseGradeItems.reduce((sum, item) => sum + item.weight, 0);

  const courseSummaries = courses.map((item) => {
    const items = gradeItems.filter((grade) => grade.course_id === item.id);
    const progress = items.map(itemProgress);
    const weight = progress.reduce((sum, grade) => sum + grade.markedWeight, 0);
    const earned = progress.reduce((sum, grade) => sum + grade.earnedWeight, 0);
    const average = weight > 0 ? (earned / weight) * 100 : null;
    const settings = gradeSettings.find((setting) => setting.course_id === item.id);
    const bands = readCutoffs(settings?.grade_cutoffs)
      .map((cutoff) => ({
        ...cutoff,
        minimum: Number(cutoff.minimum),
        gpaStart: Number(cutoff.gpaStart),
        gpaEnd: Number(cutoff.gpaEnd),
      }))
      .sort((a, b) => b.minimum - a.minimum);
    return {
      credits: settings?.credit_hours ?? 3,
      gpaPoints: average === null ? null : gpaForGrade(average, bands),
    };
  });
  const gpaCourses = courseSummaries.filter((summary) => summary.gpaPoints !== null);
  const gpaCredits = gpaCourses.reduce((sum, summary) => sum + summary.credits, 0);
  const gpaSoFar =
    gpaCredits > 0
      ? gpaCourses.reduce((sum, summary) => sum + summary.credits * (summary.gpaPoints ?? 0), 0) /
        gpaCredits
      : null;
  const totalCredits = courses.reduce(
    (sum, item) =>
      sum + (gradeSettings.find((setting) => setting.course_id === item.id)?.credit_hours ?? 3),
    0,
  );

  function neededOnRemaining(minimum: number, earned: number, remaining: number) {
    if (remaining <= 0) return null;
    return ((minimum - earned) / remaining) * 100;
  }

  function openNewItem() {
    setSchemeOpen(false);
    setEditingItem(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditItem(item: GradeItem) {
    setSchemeOpen(false);
    setEditingItem(item);
    setForm({
      title: item.title,
      score: item.score === null ? "" : String(item.score),
      maxScore: String(item.max_score),
      weight: String(item.weight),
      isFinal: item.is_final,
      bestCount: item.best_count ? String(item.best_count) : "",
      expectedCount: item.expected_count ? String(item.expected_count) : "",
      marks: (item.marks ?? []).map((mark) => ({
        id: mark.id,
        name: mark.name,
        score: mark.score === null ? "" : String(mark.score),
        maxScore: String(mark.max_score),
        countsFor: mark.counts_for ?? "here",
      })),
    });
    setFormOpen(true);
  }

  async function handleSaveItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId) return;
    const title = form.title.trim();
    const score = form.score === "" ? null : Number(form.score);
    const maxScore = Number(form.maxScore);
    const weight = Number(form.weight);
    const bestCount = form.bestCount === "" ? null : Number(form.bestCount);
    const expectedCount = form.expectedCount === "" ? null : Number(form.expectedCount);
    const marks: GradeMark[] = form.marks.map((mark) => ({
      id: mark.id,
      name: mark.name.trim() || "Mark",
      score: mark.score === "" ? null : Number(mark.score),
      max_score: Number(mark.maxScore),
      counts_for: mark.countsFor,
    }));
    const courseItems = gradeItems.filter((item) => item.course_id === selectedCourseId);
    try {
      if (!title || !Number.isFinite(weight) || weight <= 0 || weight > 100)
        throw new Error("Enter an assessment name and a weight from 0.1% to 100%.");
      if (score !== null && (!Number.isFinite(maxScore) || maxScore <= 0))
        throw new Error("Maximum score must be greater than 0.");
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > maxScore))
        throw new Error("Score must be between 0 and the maximum score.");
      if (
        form.marks.some((mark) => {
          const markScore = mark.score === "" ? null : Number(mark.score);
          const markMax = Number(mark.maxScore);
          return (
            !Number.isFinite(markMax) ||
            markMax <= 0 ||
            (markScore !== null &&
              (!Number.isFinite(markScore) || markScore < 0 || markScore > markMax))
          );
        })
      )
        throw new Error("Each mark must be between 0 and its maximum score.");
      if (bestCount !== null && (!Number.isInteger(bestCount) || bestCount < 1))
        throw new Error("Counts the best must be a whole number greater than zero.");
      if (
        expectedCount !== null &&
        (!Number.isInteger(expectedCount) ||
          expectedCount < 1 ||
          (bestCount !== null && expectedCount < bestCount))
      )
        throw new Error("Out of how many must be at least the best count.");
      if (
        courseItems.some(
          (item) => item.id !== editingItem?.id && item.title.toLowerCase() === title.toLowerCase(),
        )
      )
        throw new Error("This assessment already exists in the grading scheme.");
      if (form.isFinal && courseItems.some((item) => item.id !== editingItem?.id && item.is_final))
        throw new Error("This course already has a final exam component.");
      const otherWeight = courseItems
        .filter((item) => item.id !== editingItem?.id)
        .reduce((sum, item) => sum + item.weight, 0);
      if (otherWeight + weight > 100.0001)
        throw new Error("Course grade weights cannot add up to more than 100%.");

      const item: GradeItem = {
        id: editingItem?.id ?? crypto.randomUUID(),
        course_id: selectedCourseId,
        title,
        score,
        max_score: score === null ? maxScore || 100 : maxScore,
        weight,
        is_final: form.isFinal,
        marks: marks.filter((mark) => mark.counts_for === "here" || mark.counts_for === "exclude"),
        best_count: bestCount,
        expected_count: expectedCount,
      };
      const movedMarks = marks.filter(
        (mark) => mark.counts_for !== "here" && mark.counts_for !== "exclude",
      );
      const movedItems = new Map<string, GradeItem>();
      for (const mark of movedMarks) {
        const destination = courseItems.find((candidate) => candidate.id === mark.counts_for);
        if (!destination) throw new Error("Choose a valid assessment for each moved mark.");
        const current = movedItems.get(destination.id) ?? destination;
        const destinationMarks = current.marks ?? [];
        const oldTotal: GradeMark[] =
          current.score === null
            ? []
            : [
                {
                  id: crypto.randomUUID(),
                  name: current.title,
                  score: current.score,
                  max_score: current.max_score,
                },
              ];
        movedItems.set(destination.id, {
          ...current,
          score: null,
          marks: [
            ...destinationMarks,
            ...oldTotal,
            {
              id: mark.id,
              name: mark.name,
              score: mark.score,
              max_score: mark.max_score,
              counts_for: "here",
            },
          ],
        });
      }
      persistLocalGrades(
        [
          ...gradeItems.filter(
            (existing) => existing.id !== item.id && !movedItems.has(existing.id),
          ),
          item,
          ...movedItems.values(),
        ],
        gradeSettings,
      );
      setFormOpen(false);
      toast.success(editingItem ? "Grading component updated" : "Grading component added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the grading component");
    }
  }

  async function handleDeleteItem(item: GradeItem) {
    if (!window.confirm(`Remove ${item.title} from this course grading scheme?`)) return;
    try {
      persistLocalGrades(
        gradeItems.filter((grade) => grade.id !== item.id),
        gradeSettings,
      );
      toast.success("Grading component removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the component");
    }
  }

  async function handleSaveCutoffs(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId) return;
    const cutoffs: Record<string, { minimum: number; gpaStart: number; gpaEnd: number }> = {};
    for (const { label, minimum, gpaStart, gpaEnd } of cutoffForm) {
      const normalizedLabel = label.trim();
      const value = Number(minimum);
      const start = Number(gpaStart);
      const end = Number(gpaEnd);
      if (
        !normalizedLabel ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 100 ||
        !Number.isFinite(start) ||
        start < 0 ||
        start > 5 ||
        !Number.isFinite(end) ||
        end < 0 ||
        end > 5
      ) {
        toast.error("Enter a grade label, cutoff from 0 to 100, and GPA endpoints from 0 to 5.");
        return;
      }
      if (normalizedLabel in cutoffs) {
        toast.error("Grade labels must be unique.");
        return;
      }
      cutoffs[normalizedLabel] = { minimum: value, gpaStart: start, gpaEnd: end };
    }
    const parsedCreditHours = Number(creditHours);
    if (!Number.isFinite(parsedCreditHours) || parsedCreditHours <= 0 || parsedCreditHours > 30) {
      toast.error("Credit hours must be more than 0 and no more than 30.");
      return;
    }
    try {
      updateGradeSettings(selectedCourseId, {
        credit_hours: parsedCreditHours,
        grade_cutoffs: cutoffs,
      });
      toast.success("Grading cutoffs saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save grade cutoffs");
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
            Course grades
          </p>
          <h2 className="mt-1 font-display text-2xl font-medium text-ink">Grades</h2>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card p-4">
        <p className="text-sm font-semibold text-ink">Connected grades link</p>
        {feed ? (
          <>
            <p className="mt-1 text-xs text-ink-soft">
              Connected to <span className="font-medium text-ink">{feed.host}</span>. Checked every 3 hours.
              {feed.last_checked_at ? ` Last check: ${new Date(feed.last_checked_at).toLocaleString()}.` : ""}
            </p>
            {feed.last_status && (
              <p className={`mt-1 text-xs ${feed.last_status.startsWith("error") ? "text-destructive" : "text-ink-soft"}`}>
                Status: {feed.last_status}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="rounded-full"
                onClick={async () => {
                  try {
                    const r = await syncFeedFn();
                    if (r.status.startsWith("error")) toast.error(r.status);
                    else toast.success(`Checked now: ${r.updated} updated`);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not check now");
                  }
                  await refetchFeed();
                  await queryClient.invalidateQueries({ queryKey: ["grade-items"] });
                }}
              >
                Check now
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full"
                onClick={async () => {
                  if (!window.confirm("Disconnect this link? New grades will stop syncing.")) return;
                  await disconnectFeedFn();
                  await refetchFeed();
                  toast.success("Disconnected");
                }}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Paste your grades link once. It's stored encrypted, checked every 3 hours, and new grades appear here and in the popup.
            </p>
            <div className="mt-3 space-y-2">
              <input
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://…/api/public/v1/grades"
                aria-label="Grades link"
                className="w-full rounded-xl border border-line bg-background px-3 py-2 text-xs text-ink"
              />
              <input
                type="password"
                value={feedKey}
                onChange={(e) => setFeedKey(e.target.value)}
                placeholder="API key (from the app's API link page)"
                aria-label="API key"
                autoComplete="off"
                className="w-full rounded-xl border border-line bg-background px-3 py-2 text-xs text-ink"
              />
              <p className="text-[11px] text-ink-soft">
                Sent as <span className="font-mono">Authorization: Bearer &lt;key&gt;</span>. Stored encrypted.
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="rounded-full"
                disabled={!feedUrl.trim()}
                onClick={async () => {
                  try {
                    const r = await connectFeedFn({ data: { url: feedUrl.trim(), key: feedKey.trim() || undefined } });
                    setFeedUrl("");
                    setFeedKey("");
                    toast.success(`Connected to ${r.host}`);
                    await refetchFeed();
                    await syncFeedFn().catch(() => undefined);
                    await refetchFeed();
                    await queryClient.invalidateQueries({ queryKey: ["grade-items"] });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not connect");
                  }
                }}
              >
                Connect
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setGradeFileOpen(true)}>
          Import grades from a file
        </Button>
      </div>

      <ImportGrades
        open={gradeFileOpen}
        onOpenChange={setGradeFileOpen}
        courses={courses}
        items={gradeItems}
        onApply={(updates) => {
          const byId = new Map(updates.map((u) => [u.id, u]));
          persistLocalGrades(
            gradeItems.map((item) => {
              const u = byId.get(item.id);
              return u ? { ...item, score: u.score, max_score: u.max_score } : item;
            }),
            gradeSettings,
          );
        }}
      />

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center">
          <p className="mt-2 text-sm text-ink-soft">Add a course before setting up its grades.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => {
            const items = gradeItems
              .filter((grade) => grade.course_id === course.id)
              .sort((a, b) => Number(b.is_final) - Number(a.is_final));
            const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
            const itemProgressRows = items.map(itemProgress);
            const markedWeight = itemProgressRows.reduce((sum, item) => sum + item.markedWeight, 0);
            const earned = itemProgressRows.reduce((sum, item) => sum + item.earnedWeight, 0);
            const average = markedWeight > 0 ? (earned / markedWeight) * 100 : null;
            const remaining = Math.max(0, totalWeight - markedWeight);
            // Coursework is everything except the final exam, so the final never counts toward it.
            const courseworkItems = items.filter((item) => !item.is_final);
            const finalWeight = items.filter((item) => item.is_final).reduce((sum, item) => sum + item.weight, 0);
            // Coursework total is 100% minus the final's percentage (not the sum of the other items).
            const courseworkWeight = finalWeight > 0 ? Math.max(0, 100 - finalWeight) : courseworkItems.reduce((sum, item) => sum + item.weight, 0);
            const courseworkRows = courseworkItems.map(itemProgress);
            const courseworkEarned = courseworkRows.reduce((sum, row) => sum + row.earnedWeight, 0);
            const courseworkMarked = courseworkRows.reduce((sum, row) => sum + row.markedWeight, 0);
            const courseworkAverage = courseworkMarked > 0 ? (courseworkEarned / courseworkMarked) * 100 : null;
            const settings = gradeSettings.find((setting) => setting.course_id === course.id);
            const bands = readCutoffs(settings?.grade_cutoffs)
              .map((cutoff) => ({
                ...cutoff,
                minimum: Number(cutoff.minimum),
                gpaStart: Number(cutoff.gpaStart),
                gpaEnd: Number(cutoff.gpaEnd),
              }))
              .sort((a, b) => b.minimum - a.minimum);
            const letter =
              average === null
                ? null
                : (bands.find((band) => average >= band.minimum)?.label ?? "Below scale");
            const points = average === null ? null : gpaForGrade(average, bands);
            const final = items.some((item) => item.is_final);

            return (
              <article
                key={course.id}
                className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setSchemeOpen(true);
                      }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                        {course.code || "Course"} · {settings?.credit_hours ?? 3} CH
                      </p>
                      <h3 className="mt-0.5 font-display text-lg font-semibold text-ink">
                        {course.name}
                      </h3>
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="text-right">
                        <p className="text-xl font-bold text-ink">
                          {average === null ? "—" : percent(average)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-ink-soft"
                        onClick={() => {
                          setSelectedCourseId(course.id);
                          setSchemeOpen(true);
                        }}
                      >
                        Grading scheme
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-cream">
                    <div
                      className="h-full rounded-full bg-rust transition-all"
                      style={{ width: `${Math.min(100, markedWeight)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-soft">
                    {percent(markedWeight)} of the grade marked
                  </p>

                  <div className="mt-3 rounded-xl bg-cream p-3">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-semibold uppercase text-ink-soft">
                        Coursework
                      </span>
                      <span className="text-sm font-bold text-ink">
                        {percent(courseworkEarned)} / {percent(courseworkWeight)}
                      </span>
                      {courseworkMarked > 0 && (
                        <span className="text-sm font-semibold text-ink">
                          {percent(courseworkAverage ?? 0)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {average === null
                        ? "No grades marked yet"
                        : `Average ${percent(average)} on the ${percent(markedWeight)} marked so far`}
                    </p>
                  </div>

                  {final && remaining > 0 && (
                    <div className="mt-3">
                      <div className="flex flex-wrap gap-2">
                        {bands.slice(0, 3).map(({ label, minimum }) => {
                          const needed = neededOnRemaining(minimum, earned, remaining);
                          const value =
                            needed === null
                              ? "—"
                              : needed <= 0
                                ? "Already there"
                                : needed > 100
                                  ? "Over 100%"
                                  : `needs ${percent(needed)}`;
                          return (
                            <span
                              key={label}
                              className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-ink"
                            >
                              {label} {value}
                            </span>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-xs text-ink-soft">
                        average in the {percent(remaining)} still to come
                      </p>
                    </div>
                  )}

                  {(() => {
                    // What you need on the final itself. The rest of the unmarked work is assumed to
                    // come in at your current average, so the number changes as you mark more items.
                    const finalItem = items.find((item) => item.is_final && item.score === null);
                    if (!finalItem || average === null || remaining <= 0) return null;
                    const restWeight = Math.max(0, remaining - finalItem.weight);
                    const assumedRest = (average / 100) * restWeight;
                    return (
                      <div className="mt-3 rounded-xl bg-cream/60 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                          Needed on the final ({percent(finalItem.weight)})
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {bands.slice(0, 3).map(({ label, minimum }) => {
                            const need = ((minimum - earned - assumedRest) / finalItem.weight) * 100;
                            const value =
                              need <= 0 ? "Already there" : need > 100 ? "Not possible" : `needs ${percent(need)}`;
                            return (
                              <span key={label} className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-ink ring-1 ring-line">
                                {label} {value}
                              </span>
                            );
                          })}
                        </div>
                        <p className="mt-1.5 text-[11px] text-ink-soft">
                          Assumes the other {percent(restWeight)} still to come lands at your current {percent(average)} average.
                        </p>
                      </div>
                    );
                  })()}

                  <div className="mt-3 divide-y divide-line">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedCourseId(course.id);
                          openEditItem(item);
                        }}
                        className="flex w-full items-center justify-between gap-3 py-2 text-left"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">
                            {item.title}
                          </span>
                          <span className="block text-xs text-ink-soft">
                            {percent(item.weight)} of the grade
                            {item.best_count
                              ? ` · best ${item.best_count}${item.expected_count ? ` of ${item.expected_count}` : ""}`
                              : ""}
                            {item.marks?.length
                              ? ` · ${item.marks.filter((mark) => mark.score !== null && mark.counts_for !== "exclude").length} mark${item.marks.filter((mark) => mark.score !== null && mark.counts_for !== "exclude").length === 1 ? "" : "s"}`
                              : item.score !== null
                                ? ` · ${item.score}/${item.max_score}`
                                : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-sm font-semibold text-ink-soft">
                          {itemProgress(item).ratio === null
                            ? "Not marked"
                            : item.best_count
                              ? `${percent((itemProgress(item).ratio ?? 0) * 100)}${itemProgress(item).markedWeight < item.weight ? " so far" : ""}`
                              : item.score !== null
                                ? `${item.score}/${item.max_score}`
                                : percent((itemProgress(item).ratio ?? 0) * 100)}
                        </span>
                      </button>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full rounded-full border-line bg-background text-ink"
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      openNewItem();
                    }}
                  >
                    + Add assessment
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full rounded-full text-ink-soft"
                    onClick={() => {
                      setSelectedCourseId(course.id);
                      setImportCourseId(course.id);
                    }}
                  >
                    Import weights from text or photo
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={schemeOpen} onOpenChange={setSchemeOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border-line bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-ink">Grading scheme</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-soft">
            Enter the assessment components and weights from this course’s official scheme. Weights
            must total no more than 100%, with one final exam component. Percentage and GPA ranges
            match your example; edit them to match the course’s official scheme.
          </p>
          <div className="divide-y divide-line">
            {orderedItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                  <p className="text-xs text-ink-soft">
                    {percent(item.weight)} ·{" "}
                    {item.best_count
                      ? `best ${item.best_count}${item.expected_count ? ` of ${item.expected_count}` : ""}`
                      : item.score === null
                        ? "Not marked"
                        : `${item.score}/${item.max_score}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${item.title}`}
                    onClick={() => openEditItem(item)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${item.title}`}
                    onClick={() => void handleDeleteItem(item)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="font-medium text-ink">Total weight</span>
            <span
              className={
                totalWeight > 100 ? "font-semibold text-destructive" : "font-semibold text-ink"
              }
            >
              {percent(totalWeight)}
            </span>
          </div>

          <Button type="button" className="w-full rounded-full" onClick={openNewItem}>
            + Add assessment component
          </Button>
          {selectedCourse?.code?.toLowerCase().replace(/[\s-]/g, "") === "ciw501" &&
            courseGradeItems.length === 0 && (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full"
                onClick={() => {
                  const template = [
                    ["Final Exam", 40, true],
                    ["Mid-Term Exam", 20, false],
                    ["Assignments", 15, false],
                    ["Quiz and in-class assessment", 15, false],
                    ["Poster & Report", 10, false],
                  ] as const;
                  const items = template.map(([title, weight, isFinal]) => ({
                    id: crypto.randomUUID(),
                    course_id: selectedCourseId,
                    title,
                    score: null,
                    max_score: 100,
                    weight,
                    is_final: isFinal,
                  }));
                  try {
                    const existingSettings = gradeSettings.find(
                      (setting) => setting.course_id === selectedCourseId,
                    );
                    const settings: CourseGradeSettings = {
                      course_id: selectedCourseId,
                      credit_hours: 4,
                      grade_cutoffs:
                        existingSettings?.grade_cutoffs ??
                        Object.fromEntries(
                          defaultCutoffs.map((cutoff) => [
                            cutoff.label,
                            {
                              minimum: Number(cutoff.minimum),
                              gpaStart: Number(cutoff.gpaStart),
                              gpaEnd: Number(cutoff.gpaEnd),
                            },
                          ]),
                        ),
                    };
                    persistLocalGrades(
                      [...gradeItems, ...items],
                      [
                        ...gradeSettings.filter(
                          (setting) => setting.course_id !== selectedCourseId,
                        ),
                        settings,
                      ],
                    );
                    setSchemeOpen(false);
                    toast.success("CIW-501 grading scheme added");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not save the grading scheme",
                    );
                  }
                }}
              >
                Use CIW-501 sample scheme (4 credit hours)
              </Button>
            )}
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="rounded-2xl border-line bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-ink">
              {editingItem ? "Edit component" : "Add assessment component"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveItem} className="space-y-4">
            <label className="block text-sm text-ink">
              Assessment name
              <Input
                required
                maxLength={200}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Final exam, assignments…"
                className="mt-1 rounded-xl border-line bg-background"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-ink">
                Weight (%)
                <Input
                  required
                  type="number"
                  min={0.1}
                  max={100}
                  step="0.1"
                  value={form.weight}
                  onChange={(event) => setForm({ ...form, weight: event.target.value })}
                  className="mt-1 rounded-xl border-line bg-background"
                />
              </label>
              <label className="block text-sm text-ink">
                Out of
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={form.maxScore}
                  onChange={(event) => setForm({ ...form, maxScore: event.target.value })}
                  className="mt-1 rounded-xl border-line bg-background"
                />
              </label>
            </div>
            <p className="-mt-2 text-xs text-ink-soft">
              One total is optional. Leave it empty to calculate this item from the marks below.
            </p>
            <label className="block text-sm text-ink">
              One total (optional)
              <Input
                type="number"
                min={0}
                max={Number(form.maxScore) || undefined}
                step="0.01"
                value={form.score}
                onChange={(event) => setForm({ ...form, score: event.target.value })}
                placeholder="Leave empty to add individual marks"
                className="mt-1 rounded-xl border-line bg-background"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-ink">
                Counts the best
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={form.bestCount}
                  onChange={(event) => setForm({ ...form, bestCount: event.target.value })}
                  placeholder="e.g. 2"
                  className="mt-1 rounded-xl border-line bg-background"
                />
              </label>
              <label className="block text-sm text-ink">
                Out of how many
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={form.expectedCount}
                  onChange={(event) => setForm({ ...form, expectedCount: event.target.value })}
                  placeholder="e.g. 3"
                  className="mt-1 rounded-xl border-line bg-background"
                />
              </label>
            </div>
            <p className="-mt-2 text-xs text-ink-soft">
              For “best 2 out of 3”, enter 2 and 3. The course only counts the top two marks.
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Marks</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      marks: [
                        ...form.marks,
                        {
                          id: crypto.randomUUID(),
                          name: "",
                          score: "",
                          maxScore: "10",
                          countsFor: "here",
                        },
                      ],
                    })
                  }
                >
                  Add a mark
                </Button>
              </div>
              {form.marks.map((mark, index) => (
                <div key={mark.id} className="space-y-2 rounded-xl border border-line p-3">
                  <Input
                    aria-label="Mark name"
                    value={mark.name}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        marks: form.marks.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item,
                        ),
                      })
                    }
                    placeholder={`Mark ${index + 1}`}
                    className="rounded-lg border-line bg-background"
                  />
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <Input
                      aria-label="Mark score"
                      type="number"
                      min={0}
                      max={Number(mark.maxScore) || undefined}
                      step="0.01"
                      value={mark.score}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          marks: form.marks.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, score: event.target.value } : item,
                          ),
                        })
                      }
                      placeholder="Score"
                      className="rounded-lg border-line bg-background"
                    />
                    <span className="text-sm text-ink-soft">/</span>
                    <Input
                      aria-label="Mark out of"
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={mark.maxScore}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          marks: form.marks.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, maxScore: event.target.value } : item,
                          ),
                        })
                      }
                      placeholder="Out of"
                      className="rounded-lg border-line bg-background"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <select
                      aria-label="Counts for"
                      value={mark.countsFor}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          marks: form.marks.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, countsFor: event.target.value } : item,
                          ),
                        })
                      }
                      className="rounded-lg border border-line bg-background px-2 py-1.5 text-xs text-ink"
                    >
                      <option value="here">Counts here</option>
                      {gradeItems
                        .filter(
                          (item) =>
                            item.course_id === selectedCourseId && item.id !== editingItem?.id,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            Move to {item.title}
                          </option>
                        ))}
                      <option value="exclude">Don’t count it</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm({
                          ...form,
                          marks: form.marks.filter((_, itemIndex) => itemIndex !== index),
                        })
                      }
                    >
                      Remove mark
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.isFinal}
                onChange={(event) => setForm({ ...form, isFinal: event.target.checked })}
              />
              This is the final exam
            </label>
            <Button type="submit" className="w-full rounded-full">
              {editingItem ? "Save component" : "Add component"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {importCourseId && (
        <WeightsImport
          open
          onOpenChange={(open) => !open && setImportCourseId(null)}
          courseName={courses.find((c) => c.id === importCourseId)?.name ?? "Course"}
          existing={gradeItems.filter((item) => item.course_id === importCourseId)}
          onImport={(rows, creditHours) => {
            const error = importWeights(importCourseId, rows, creditHours);
            if (!error) setImportCourseId(null);
            return error;
          }}
        />
      )}
    </section>
  );
}
