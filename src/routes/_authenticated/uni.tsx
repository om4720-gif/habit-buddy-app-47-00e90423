import { createFileRoute } from "@tanstack/react-router";
import { differenceInCalendarDays, format } from "date-fns";
import {
  ArrowLeft,
  Bell,
  Check,
  FolderClosed,
  GraduationCap,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  createCourse,
  createLecture,
  deleteCourse,
  deleteLecture,
  getCourses,
  getLectures,
  updateCourse,
  updateLecture,
} from "@/lib/uni.functions";
import {
  createDeadline,
  deleteDeadline,
  getDeadlines,
  updateDeadline,
} from "@/lib/deadlines.functions";
import { useDeadlineReminders } from "@/lib/useDeadlineReminders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoiceButton } from "@/components/VoiceButton";
import { CoursePhotos } from "@/components/CoursePhotos";
import { ExamSection } from "@/components/ExamSection";
import { GradesSection } from "@/components/GradesSection";
import { isExam } from "@/lib/exams";

export const Route = createFileRoute("/_authenticated/uni")({
  component: UniPage,
});

function UniPage() {
  const queryClient = useQueryClient();
  const fetchCourses = useServerFn(getCourses);
  const fetchLectures = useServerFn(getLectures);
  const createCourseFn = useServerFn(createCourse);
  const updateCourseFn = useServerFn(updateCourse);
  const createLectureFn = useServerFn(createLecture);
  const updateLectureFn = useServerFn(updateLecture);
  const deleteCourseFn = useServerFn(deleteCourse);
  const deleteLectureFn = useServerFn(deleteLecture);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: () => fetchCourses(),
  });

  const { data: lectures = [] } = useQuery({
    queryKey: ["lectures"],
    queryFn: () => fetchLectures({ data: {} }),
  });

  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [editCourseDialogOpen, setEditCourseDialogOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editCourseName, setEditCourseName] = useState("");
  const [lectureDialogOpen, setLectureDialogOpen] = useState(false);
  const [lectureCourseId, setLectureCourseId] = useState<string>("");
  const [courseForm, setCourseForm] = useState({ name: "", code: "", lectures: "", tutorials: "" });
  const [lectureForm, setLectureForm] = useState({
    title: "",
    kind: "lecture" as "lecture" | "tutorial",
    date: format(new Date(), "yyyy-MM-dd"),
  });

  const fetchDeadlines = useServerFn(getDeadlines);
  const createDeadlineFn = useServerFn(createDeadline);
  const updateDeadlineFn = useServerFn(updateDeadline);
  const deleteDeadlineFn = useServerFn(deleteDeadline);

  const { data: deadlines = [] } = useQuery({
    queryKey: ["deadlines"],
    queryFn: () => fetchDeadlines(),
  });

  const [deadlineDialogOpen, setDeadlineDialogOpen] = useState(false);
  const [deadlineForm, setDeadlineForm] = useState({
    courseId: "",
    title: "",
    kind: "assignment" as "assignment" | "quiz",
    dueDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [editDeadlineForm, setEditDeadlineForm] = useState({
    title: "",
    kind: "assignment" as "assignment" | "quiz",
    dueDate: format(new Date(), "yyyy-MM-dd"),
  });
  const [editingLectureId, setEditingLectureId] = useState<string | null>(null);
  const [editLectureTitle, setEditLectureTitle] = useState("");

  const reminderItems = deadlines.map((d) => ({
    id: d.id,
    title: d.title,
    kind: d.kind,
    due_date: d.due_date,
    completed: d.completed,
    courseName: d.courses?.name ?? null,
  }));
  const { permission, requestPermission, dueSoon } = useDeadlineReminders(reminderItems);

  async function handleAddDeadline(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createDeadlineFn({
        data: {
          courseId: deadlineForm.courseId,
          title: deadlineForm.title,
          kind: deadlineForm.kind,
          dueDate: deadlineForm.dueDate,
        },
      });
      setDeadlineForm({
        courseId: "",
        title: "",
        kind: "assignment",
        dueDate: format(new Date(), "yyyy-MM-dd"),
      });
      setDeadlineDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      toast.success("Deadline added");
    } catch {
      toast.error("Could not add deadline");
    }
  }

  async function toggleDeadline(deadlineId: string, completed: boolean) {
    try {
      await updateDeadlineFn({ data: { deadlineId, completed: !completed } });
      if (!completed) toast.success("Nice! Points added ✨");
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      queryClient.invalidateQueries({ queryKey: ["points"] });
    } catch {
      toast.error("Could not update deadline");
    }
  }

  async function removeDeadline(deadlineId: string) {
    try {
      await deleteDeadlineFn({ data: { deadlineId } });
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      toast.success("Deadline removed");
    } catch {
      toast.error("Could not remove deadline");
    }
  }

  function openEditDeadline(d: (typeof deadlines)[number]) {
    setEditingDeadlineId(d.id);
    setEditDeadlineForm({
      title: d.title,
      kind: d.kind === "quiz" ? "quiz" : "assignment",
      dueDate: d.due_date,
    });
  }

  async function handleEditDeadline(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDeadlineId) return;
    try {
      await updateDeadlineFn({
        data: {
          deadlineId: editingDeadlineId,
          title: editDeadlineForm.title,
          kind: editDeadlineForm.kind,
          dueDate: editDeadlineForm.dueDate,
        },
      });
      setEditingDeadlineId(null);
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      toast.success("Deadline updated");
    } catch {
      toast.error("Could not update deadline");
    }
  }

  const upcomingDeadlines = deadlines
    .filter((d) => !d.completed)
    .slice()
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const lecturesByCourse = new Map<string, typeof lectures>();
  for (const lecture of lectures) {
    const list = lecturesByCourse.get(lecture.course_id) ?? [];
    list.push(lecture);
    lecturesByCourse.set(lecture.course_id, list);
  }

  async function handleAddCourse(e: React.FormEvent) {
    e.preventDefault();
    try {
      const lectureCount = Math.min(60, Math.max(0, parseInt(courseForm.lectures, 10) || 0));
      const tutorialCount = Math.min(60, Math.max(0, parseInt(courseForm.tutorials, 10) || 0));
      await createCourseFn({
        data: {
          name: courseForm.name,
          code: courseForm.code || undefined,
          lectureCount,
          tutorialCount,
        },
      });
      setCourseForm({ name: "", code: "", lectures: "", tutorials: "" });
      setCourseDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      toast.success(
        lectureCount || tutorialCount
          ? `Course added with ${lectureCount} lectures and ${tutorialCount} tutorials`
          : "Course added",
      );
    } catch (err) {
      toast.error("Could not add course");
    }
  }

  function openLectureDialog(courseId: string, kind: "lecture" | "tutorial" = "lecture") {
    setLectureCourseId(courseId);
    setLectureForm({
      title: "",
      kind,
      date: format(new Date(), "yyyy-MM-dd"),
    });
    setLectureDialogOpen(true);
  }

  async function handleAddLecture(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createLectureFn({
        data: {
          courseId: lectureCourseId,
          title: lectureForm.title,
          kind: lectureForm.kind,
          lectureDate: lectureForm.date,
        },
      });
      setLectureForm({
        title: "",
        kind: lectureForm.kind,
        date: format(new Date(), "yyyy-MM-dd"),
      });
      setLectureDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      toast.success("Lecture added");
    } catch (err) {
      toast.error("Could not add lecture");
    }
  }

  async function toggleLecture(lectureId: string, completed: boolean) {
    try {
      await updateLectureFn({ data: { lectureId, completed: !completed } });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      queryClient.invalidateQueries({ queryKey: ["points"] });
    } catch (err) {
      toast.error("Could not update lecture");
    }
  }

  function openEditLecture(lecture: (typeof lectures)[number]) {
    setEditingLectureId(lecture.id);
    setEditLectureTitle(lecture.title);
  }

  async function handleEditLecture(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLectureId) return;
    try {
      await updateLectureFn({
        data: { lectureId: editingLectureId, title: editLectureTitle.trim() },
      });
      setEditingLectureId(null);
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      toast.success("Lecture renamed");
    } catch {
      toast.error("Could not rename lecture");
    }
  }

  async function removeCourse(courseId: string) {
    try {
      await deleteCourseFn({ data: { courseId } });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      queryClient.invalidateQueries({ queryKey: ["deadlines"] });
      setSelectedCourseId(null);
      toast.success("Course removed");
    } catch (err) {
      toast.error("Could not remove course");
    }
  }

  function openEditCourse(course: (typeof courses)[number]) {
    setEditingCourseId(course.id);
    setEditCourseName(course.name);
    setEditCourseDialogOpen(true);
  }

  async function handleEditCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCourseId) return;
    try {
      await updateCourseFn({ data: { courseId: editingCourseId, name: editCourseName.trim() } });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      setEditCourseDialogOpen(false);
      setEditingCourseId(null);
      toast.success("Course renamed");
    } catch {
      toast.error("Could not rename course");
    }
  }

  async function removeLecture(lectureId: string) {
    try {
      await deleteLectureFn({ data: { lectureId } });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      toast.success("Lecture removed");
    } catch (err) {
      toast.error("Could not remove lecture");
    }
  }

  const NUMBER_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
  };

  function normalize(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function handleVoiceCommand(text: string) {
    const spoken = normalize(text);
    if (!spoken) {
      toast.error("I did not catch that. Try again.");
      return;
    }

    const match = courses
      .map((course) => {
        const name = normalize(course.name);
        const code = course.code ? normalize(course.code) : "";
        const hit = (name && spoken.includes(name)) || (code && spoken.includes(code));
        return { course, score: hit ? Math.max(name.length, code.length) : 0 };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    if (!match) {
      toast.error(`No course matched "${text}". Say the course name too.`);
      return;
    }

    const kind: "lecture" | "tutorial" = /\btutorials?\b/.test(spoken) ? "tutorial" : "lecture";

    const digit = spoken.match(/\b(\d{1,3})\b/);
    let number: number | null = digit ? Number(digit[1]) : null;
    if (number === null) {
      for (const [word, value] of Object.entries(NUMBER_WORDS)) {
        if (new RegExp(`\\b${word}\\b`).test(spoken)) {
          number = value;
          break;
        }
      }
    }

    const label = kind === "tutorial" ? "Tutorial" : "Lecture";
    const title = number ? `${label} ${number}` : text.trim().replace(/\.$/, "") || label;

    try {
      await createLectureFn({
        data: {
          courseId: match.course.id,
          title,
          kind,
          lectureDate: format(new Date(), "yyyy-MM-dd"),
        },
      });
      queryClient.invalidateQueries({ queryKey: ["lectures"] });
      toast.success(`${title} added to ${match.course.name}`);
    } catch {
      toast.error("Could not add that. Try again.");
    }
  }

  const lectureItems = lectures.filter((l) => l.kind !== "tutorial");
  const tutorialItems = lectures.filter((l) => l.kind === "tutorial");
  const rate = (items: typeof lectures) =>
    items.length ? Math.round((items.filter((l) => l.completed).length / items.length) * 100) : 0;
  const lectureRate = rate(lectureItems);
  const tutorialRate = rate(tutorialItems);

  // ---- organizing the page: tabs and course folders ----
  const readLS = (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const writeLS = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage can be unavailable */
    }
  };
  const [tab, setTab] = useState<"courses" | "deadlines" | "grades">(() => {
    const stored = readLS("uni:tab");
    return stored === "deadlines" || stored === "grades" ? stored : "courses";
  });
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [shownStudied, setShownStudied] = useState<Set<string>>(new Set());
  const [photosOpen, setPhotosOpen] = useState<Set<string>>(new Set());
  const toggleIn = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);

  useEffect(() => writeLS("uni:tab", tab), [tab]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-8 animate-rise">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-rust">
          {selectedCourse ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedCourseId(null)}
              className="-ml-2 size-9 text-ink hover:bg-cream"
              aria-label="Back to courses"
            >
              <ArrowLeft className="size-5" />
            </Button>
          ) : (
            <GraduationCap className="size-5" />
          )}
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">University</span>
        </div>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink sm:text-4xl">
          {selectedCourse?.name ?? "Course folders"}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {selectedCourse
            ? (selectedCourse.code ?? "Course workspace")
            : "Your lectures, deadlines, and notes in one place."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <VoiceButton
            onText={handleVoiceCommand}
            label="Add by voice"
            idleTitle="Say the course, lecture or tutorial, and its number"
          />
          <p className="text-xs text-ink-soft">
            Say something like “Physics lecture 3” or “Math tutorial 2”.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const { getClaudeFeedToken } = await import("@/lib/claude.functions");
              const { token } = await getClaudeFeedToken();
              const url = `https://habit-buddy-app-47.lovable.app/api/public/claude?key=${token}`;
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Claude link copied — paste it into Claude");
              } catch {
                toast.message(url);
              }
            }}
          >
            Copy Claude link
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (
                !window.confirm("Reset the Claude link? The old link will stop working right away.")
              )
                return;
              try {
                const { resetClaudeFeedToken } = await import("@/lib/claude.functions");
                const { token } = await resetClaudeFeedToken();
                const url = `https://habit-buddy-app-47.lovable.app/api/public/claude?key=${token}`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("New link copied. The old one no longer works.");
                } catch {
                  toast.message(url);
                }
              } catch {
                toast.error("Could not reset the link");
              }
            }}
          >
            Reset link
          </Button>
        </div>
      </header>

      <section className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-line bg-card p-3 shadow-sm sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-soft">
            Courses
          </p>
          <p className="mt-0.5 font-display text-xl text-ink sm:text-2xl">{courses.length}</p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-3 shadow-sm sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-soft">
            Lectures
          </p>
          <p className="mt-0.5 font-display text-xl text-ink sm:text-2xl">{lectureRate}%</p>
          <p className="text-xs text-ink-soft">
            {lectureItems.filter((l) => l.completed).length}/{lectureItems.length}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-3 shadow-sm sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-soft">
            Tutorials
          </p>
          <p className="mt-0.5 font-display text-xl text-ink sm:text-2xl">{tutorialRate}%</p>
          <p className="text-xs text-ink-soft">
            {tutorialItems.filter((l) => l.completed).length}/{tutorialItems.length}
          </p>
        </div>
      </section>

      <ExamSection />

      <div
        className="mb-5 inline-flex rounded-full bg-cream p-1 ring-1 ring-black/5"
        role="tablist"
      >
        {(
          [
            ["courses", "Courses"],
            ["deadlines", dueSoon.length > 0 ? `Deadlines · ${dueSoon.length} soon` : "Deadlines"],
            ["grades", "Grades"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              tab === id
                ? "bg-card text-ink shadow-sm ring-1 ring-black/5"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "grades" && <GradesSection courses={courses} />}

      {tab === "deadlines" && (
        <>
          {permission !== "granted" && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card px-5 py-3 text-xs text-ink-soft">
              <span>
                {permission === "open-in-new-tab"
                  ? "Open the app in its own browser tab to allow pop-up reminders."
                  : permission === "denied"
                    ? "Pop-ups are blocked for this site. Allow notifications in your browser settings to get reminders."
                    : permission === "unsupported"
                      ? "This browser cannot show pop-up reminders."
                      : "Get a pop-up the day before assignments and two days before quizzes."}
              </span>
              {permission === "default" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={requestPermission}
                  className="rounded-full border-line bg-card text-ink hover:bg-cream"
                >
                  <Bell className="mr-1 size-4" /> Turn on reminders
                </Button>
              )}
            </div>
          )}

          {[
            {
              kind: "assignment" as const,
              heading: "Assignments",
              sub: "Reminder the day before it's due.",
              button: "Assignment",
              soonLabel: "due tomorrow",
            },
            {
              kind: "quiz" as const,
              heading: "Quizzes",
              sub: "Reminder two days before the quiz.",
              button: "Quiz",
              soonLabel: "in 2 days",
            },
          ].map((section) => {
            const items = upcomingDeadlines.filter(
              (d) =>
                !isExam(d) && (section.kind === "quiz" ? d.kind === "quiz" : d.kind !== "quiz"),
            );
            const soonCount = dueSoon.filter(
              (d) =>
                !isExam(d) && (section.kind === "quiz" ? d.kind === "quiz" : d.kind !== "quiz"),
            ).length;
            return (
              <section
                key={section.kind}
                className="mb-8 rounded-2xl border border-line bg-card shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
                  <div>
                    <h2 className="font-display text-lg font-medium text-ink">{section.heading}</h2>
                    <p className="text-xs text-ink-soft">{section.sub}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeadlineForm({
                        courseId: courses[0]?.id ?? "",
                        title: "",
                        kind: section.kind,
                        dueDate: format(new Date(), "yyyy-MM-dd"),
                      });
                      setDeadlineDialogOpen(true);
                    }}
                    disabled={courses.length === 0}
                    className="rounded-full border-line bg-card text-ink hover:bg-cream"
                  >
                    <Plus className="mr-1 size-4" /> {section.button}
                  </Button>
                </div>

                {permission === "granted" && soonCount > 0 && (
                  <p className="border-b border-line px-5 py-3 text-xs text-rust">
                    {soonCount} {section.soonLabel}.
                  </p>
                )}

                <div className="divide-y divide-line">
                  {items.length === 0 ? (
                    <p className="px-5 py-6 text-center text-sm text-ink-soft">
                      {courses.length === 0
                        ? "Add a course first."
                        : section.kind === "quiz"
                          ? "No upcoming quizzes."
                          : "No assignments due."}
                    </p>
                  ) : (
                    items.map((d) => {
                      const daysLeft = differenceInCalendarDays(
                        new Date(`${d.due_date}T00:00:00`),
                        new Date(new Date().toDateString()),
                      );
                      return (
                        <div
                          key={d.id}
                          className="flex items-center justify-between px-5 py-4 transition hover:bg-cream/30"
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => toggleDeadline(d.id, d.completed)}
                              className="mt-0.5 size-6 rounded-full border-2 border-line text-ink-soft transition hover:border-rust/40"
                              aria-label="Mark as done"
                            >
                              {d.completed && <Check className="size-4" />}
                            </button>
                            <div>
                              <p className="font-medium text-ink">{d.title}</p>
                              <p className="mt-0.5 text-xs text-ink-soft">
                                {d.courses?.name ? `${d.courses.name} · ` : ""}
                                {format(new Date(`${d.due_date}T00:00:00`), "MMM d, yyyy")}
                                {" · "}
                                {daysLeft < 0
                                  ? "overdue"
                                  : daysLeft === 0
                                    ? "today"
                                    : daysLeft === 1
                                      ? "tomorrow"
                                      : `in ${daysLeft} days`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDeadline(d)}
                              className="text-ink-muted hover:text-rust"
                              aria-label="Edit deadline"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeDeadline(d.id)}
                              className="text-ink-muted hover:text-rust"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </>
      )}

      <Dialog open={deadlineDialogOpen} onOpenChange={setDeadlineDialogOpen}>
        <DialogContent className="rounded-2xl border-line bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-ink">Add deadline</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddDeadline} className="mt-2 space-y-4">
            <div>
              <Label htmlFor="deadlineCourse" className="text-ink-soft">
                Course
              </Label>
              <select
                id="deadlineCourse"
                value={deadlineForm.courseId}
                onChange={(e) => setDeadlineForm({ ...deadlineForm, courseId: e.target.value })}
                required
                className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-ink outline-none"
              >
                <option value="">Select a course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="deadlineKind" className="text-ink-soft">
                Type
              </Label>
              <select
                id="deadlineKind"
                value={deadlineForm.kind}
                onChange={(e) =>
                  setDeadlineForm({
                    ...deadlineForm,
                    kind: e.target.value as "assignment" | "quiz",
                  })
                }
                className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-ink outline-none"
              >
                <option value="assignment">Assignment</option>
                <option value="quiz">Quiz</option>
              </select>
            </div>
            <div>
              <Label htmlFor="deadlineTitle" className="text-ink-soft">
                Title
              </Label>
              <Input
                id="deadlineTitle"
                value={deadlineForm.title}
                onChange={(e) => setDeadlineForm({ ...deadlineForm, title: e.target.value })}
                required
                className="mt-1 rounded-xl border-line bg-background text-ink"
              />
            </div>
            <div>
              <Label htmlFor="deadlineDue" className="text-ink-soft">
                Due date
              </Label>
              <Input
                id="deadlineDue"
                type="date"
                value={deadlineForm.dueDate}
                onChange={(e) => setDeadlineForm({ ...deadlineForm, dueDate: e.target.value })}
                required
                className="mt-1 rounded-xl border-line bg-background text-ink"
              />
            </div>
            <Button
              type="submit"
              className="w-full rounded-full bg-rust text-cream hover:bg-rust/90"
            >
              Save deadline
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingDeadlineId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingDeadlineId(null);
        }}
      >
        <DialogContent className="rounded-2xl border-line bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-ink">Edit deadline</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditDeadline} className="mt-2 space-y-4">
            <div>
              <Label htmlFor="editDeadlineKind" className="text-ink-soft">
                Type
              </Label>
              <select
                id="editDeadlineKind"
                value={editDeadlineForm.kind}
                onChange={(e) =>
                  setEditDeadlineForm({
                    ...editDeadlineForm,
                    kind: e.target.value as "assignment" | "quiz",
                  })
                }
                className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-ink outline-none"
              >
                <option value="assignment">Assignment</option>
                <option value="quiz">Quiz</option>
              </select>
            </div>
            <div>
              <Label htmlFor="editDeadlineTitle" className="text-ink-soft">
                Title
              </Label>
              <Input
                id="editDeadlineTitle"
                value={editDeadlineForm.title}
                onChange={(e) =>
                  setEditDeadlineForm({ ...editDeadlineForm, title: e.target.value })
                }
                required
                className="mt-1 rounded-xl border-line bg-background text-ink"
              />
            </div>
            <div>
              <Label htmlFor="editDeadlineDue" className="text-ink-soft">
                Due date
              </Label>
              <Input
                id="editDeadlineDue"
                type="date"
                value={editDeadlineForm.dueDate}
                onChange={(e) =>
                  setEditDeadlineForm({ ...editDeadlineForm, dueDate: e.target.value })
                }
                required
                className="mt-1 rounded-xl border-line bg-background text-ink"
              />
            </div>
            <Button
              type="submit"
              className="w-full rounded-full bg-rust text-cream hover:bg-rust/90"
            >
              Save changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {tab === "courses" && (
        <>
          <section className="mb-6 flex items-center justify-between">
            <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-line bg-card text-ink hover:bg-cream"
                >
                  <Plus className="mr-1 size-4" /> Course
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl border-line bg-card">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl text-ink">Add course</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddCourse} className="mt-2 space-y-4">
                  <div>
                    <Label htmlFor="courseName" className="text-ink-soft">
                      Course name
                    </Label>
                    <Input
                      id="courseName"
                      value={courseForm.name}
                      onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })}
                      required
                      className="mt-1 rounded-xl border-line bg-background text-ink"
                    />
                  </div>
                  <div>
                    <Label htmlFor="courseCode" className="text-ink-soft">
                      Code (optional)
                    </Label>
                    <Input
                      id="courseCode"
                      value={courseForm.code}
                      onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                      className="mt-1 rounded-xl border-line bg-background text-ink"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="courseLectures" className="text-ink-soft">
                        Lectures
                      </Label>
                      <Input
                        id="courseLectures"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={60}
                        placeholder="0"
                        value={courseForm.lectures}
                        onChange={(e) => setCourseForm({ ...courseForm, lectures: e.target.value })}
                        className="mt-1 rounded-xl border-line bg-background text-ink"
                      />
                    </div>
                    <div>
                      <Label htmlFor="courseTutorials" className="text-ink-soft">
                        Tutorials
                      </Label>
                      <Input
                        id="courseTutorials"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={60}
                        placeholder="0"
                        value={courseForm.tutorials}
                        onChange={(e) =>
                          setCourseForm({ ...courseForm, tutorials: e.target.value })
                        }
                        className="mt-1 rounded-xl border-line bg-background text-ink"
                      />
                    </div>
                  </div>
                  <p className="-mt-2 text-xs text-ink-soft">
                    Optional. Creates Lecture 1…n and Tutorial 1…n for you.
                  </p>
                  <Button
                    type="submit"
                    className="w-full rounded-full bg-rust text-cream hover:bg-rust/90"
                  >
                    Save course
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={editCourseDialogOpen} onOpenChange={setEditCourseDialogOpen}>
              <DialogContent className="rounded-2xl border-line bg-card">
                <DialogHeader>
                  <DialogTitle className="font-display text-xl text-ink">Rename course</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleEditCourse} className="mt-2 space-y-4">
                  <div>
                    <Label htmlFor="editCourseName" className="text-ink-soft">
                      Course name
                    </Label>
                    <Input
                      id="editCourseName"
                      value={editCourseName}
                      onChange={(e) => setEditCourseName(e.target.value)}
                      required
                      maxLength={200}
                      className="mt-1 rounded-xl border-line bg-background text-ink"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full rounded-full bg-rust text-cream hover:bg-rust/90"
                  >
                    Save name
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        </>
      )}

      {tab === "courses" &&
        (courses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-10 text-center">
            <FolderClosed className="mx-auto size-8 text-ink-soft" />
            <p className="text-sm text-ink-soft">No courses yet.</p>
            <Button
              variant="ghost"
              onClick={() => setCourseDialogOpen(true)}
              className="mt-2 text-rust hover:text-rust/80"
            >
              Add your first course
            </Button>
          </div>
        ) : (
          <div className={selectedCourse ? "" : "grid gap-4 sm:grid-cols-2"}>
            {courses.map((course, courseIndex) => {
              const courseItems = lecturesByCourse.get(course.id) ?? [];
              const studiedCount = courseItems.filter((item) => item.completed).length;
              const progress = courseItems.length
                ? Math.round((studiedCount / courseItems.length) * 100)
                : 0;
              const dueCount = upcomingDeadlines.filter(
                (deadline) => deadline.course_id === course.id,
              ).length;
              const byDate = (items: typeof courseItems) =>
                items
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(a.lecture_date ?? 0).getTime() -
                        new Date(b.lecture_date ?? 0).getTime() ||
                      a.title.localeCompare(b.title, undefined, { numeric: true }),
                  );
              const groups: {
                kind: "lecture" | "tutorial";
                label: string;
                items: typeof courseItems;
              }[] = [
                {
                  kind: "lecture",
                  label: "Lectures",
                  items: byDate(courseItems.filter((l) => l.kind !== "tutorial")),
                },
                {
                  kind: "tutorial",
                  label: "Tutorials",
                  items: byDate(courseItems.filter((l) => l.kind === "tutorial")),
                },
              ];

              if (!selectedCourse) {
                const circumference = 113.1;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setSelectedCourseId(course.id)}
                    className="group relative overflow-hidden rounded-xl border border-line bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rust/40 hover:shadow-md"
                    data-course-color={courseIndex % 6}
                  >
                    <span
                      className="absolute inset-x-0 top-0 h-1.5"
                      style={{
                        backgroundColor:
                          "var(--course-accent, " + (course.color ?? "#CE552F") + ")",
                      }}
                    />
                    <span className="flex items-start justify-between gap-4 pt-1">
                      <span className="min-w-0">
                        <FolderClosed
                          className="mb-4 size-6"
                          style={{
                            color: "var(--course-accent, " + (course.color ?? "#CE552F") + ")",
                          }}
                        />
                        <span className="block truncate font-display text-xl font-medium text-ink">
                          {course.name}
                        </span>
                        <span className="mt-1 block truncate text-xs text-ink-soft">
                          {course.code || `${courseItems.length} sessions`}
                        </span>
                      </span>
                      <span className="relative mt-1 flex size-12 shrink-0 items-center justify-center">
                        <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90">
                          <circle
                            cx="22"
                            cy="22"
                            r="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            className="text-line"
                          />
                          <circle
                            cx="22"
                            cy="22"
                            r="18"
                            fill="none"
                            stroke={`var(--course-accent, ${course.color ?? "#CE552F"})`}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={circumference * (1 - progress / 100)}
                          />
                        </svg>
                        <span className="text-[10px] font-semibold text-ink">{progress}%</span>
                      </span>
                    </span>
                    <span className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-3">
                      <span className="text-xs text-ink-soft">
                        {studiedCount} of {courseItems.length} studied
                      </span>
                      <span className="rounded-full bg-cream px-2.5 py-1 text-[11px] font-semibold text-ink">
                        {dueCount} due
                      </span>
                    </span>
                  </button>
                );
              }
              if (selectedCourse.id !== course.id) return null;

              return (
                <section
                  key={course.id}
                  className="rounded-2xl border border-line bg-card shadow-sm"
                  data-course-color={courseIndex % 6}
                >
                  <div className="flex items-center justify-between border-b border-line px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block size-3 rounded-full"
                        style={{
                          backgroundColor: `var(--course-accent, ${course.color ?? "#CE552F"})`,
                        }}
                      />
                      <div>
                        <h2 className="font-display text-lg font-medium text-ink">{course.name}</h2>
                        {course.code && <p className="text-xs text-ink-soft">{course.code}</p>}
                        {(() => {
                          const next = upcomingDeadlines.find((d) => d.course_id === course.id);
                          return next ? (
                            <p className="mt-0.5 text-xs text-rust">
                              Next due: {next.title} ·{" "}
                              {format(new Date(`${next.due_date}T00:00:00`), "MMM d")}
                            </p>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-ink-muted hover:text-ink"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl border-line bg-card">
                        <DropdownMenuItem onClick={() => openEditCourse(course)}>
                          <Pencil className="mr-2 size-4" /> Rename course
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (window.confirm(`Delete ${course.name}? Its course data will be removed.`)) {
                              void removeCourse(course.id);
                            }
                          }}
                          className="text-rust focus:bg-cream focus:text-rust"
                        >
                          <Trash2 className="mr-2 size-4" /> Delete course
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {groups.map((group) => {
                    const studied = group.items.filter((l) => l.completed).length;
                    const percent = group.items.length
                      ? Math.round((studied / group.items.length) * 100)
                      : 0;
                    const groupKey = `${course.id}:${group.kind}`;
                    const showAll = shownStudied.has(groupKey);
                    const shownItems = showAll
                      ? group.items
                      : group.items.filter((l) => !l.completed);
                    return (
                      <div key={group.kind} className="border-b border-line last:border-b-0">
                        <div className="flex items-center justify-between bg-cream/30 px-5 py-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-soft">
                              {group.label}
                            </p>
                            <p className="text-xs text-ink-soft">
                              {percent}% studied · {studied}/{group.items.length}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openLectureDialog(course.id, group.kind)}
                            className="rounded-full text-ink hover:bg-cream"
                          >
                            <Plus className="mr-1 size-4" />
                            {group.kind === "tutorial" ? "Tutorial" : "Lecture"}
                          </Button>
                        </div>

                        <div className="divide-y divide-line">
                          {group.items.length === 0 ? (
                            <p className="px-5 py-5 text-center text-sm text-ink-soft">
                              {group.kind === "tutorial" ? "No tutorials yet." : "No lectures yet."}
                            </p>
                          ) : (
                            shownItems.map((lecture) => (
                              <div
                                key={lecture.id}
                                className="flex items-center justify-between px-5 py-4 transition hover:bg-cream/30"
                              >
                                <div className="flex items-start gap-3">
                                  <button
                                    onClick={() => toggleLecture(lecture.id, !!lecture.completed)}
                                    className={`mt-0.5 size-6 rounded-full border-2 transition ${
                                      lecture.completed
                                        ? "border-rust bg-rust text-cream"
                                        : "border-line bg-transparent text-ink-soft hover:border-rust/40"
                                    }`}
                                    aria-label={
                                      lecture.completed ? "Mark not studied" : "Mark studied"
                                    }
                                  >
                                    {lecture.completed && <Check className="size-4" />}
                                  </button>
                                  <div>
                                    <p
                                      className={`font-medium ${
                                        lecture.completed
                                          ? "text-ink-soft line-through"
                                          : "text-ink"
                                      }`}
                                    >
                                      {lecture.title}
                                    </p>
                                    {lecture.lecture_date && (
                                      <p className="mt-0.5 text-xs text-ink-soft">
                                        {format(new Date(lecture.lecture_date), "MMM d, yyyy")}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditLecture(lecture)}
                                    className="text-ink-muted hover:text-rust"
                                    aria-label="Rename lecture"
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeLecture(lecture.id)}
                                    className="text-ink-muted hover:text-rust"
                                    aria-label="Remove lecture"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        {studied > 0 && (
                          <button
                            onClick={() => setShownStudied(toggleIn(shownStudied, groupKey))}
                            className="flex w-full items-center justify-center gap-1.5 border-t border-line px-5 py-2.5 text-xs font-medium text-ink-soft transition hover:bg-cream/40 hover:text-ink"
                          >
                            <ChevronDown
                              className={`size-3.5 transition ${showAll ? "rotate-180" : ""}`}
                            />
                            {showAll
                              ? "Hide studied"
                              : studied === group.items.length
                                ? `All ${studied} studied 🎉 · show them`
                                : `Show ${studied} studied`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <div className="border-t border-line">
                    <button
                      onClick={() => setPhotosOpen(toggleIn(photosOpen, course.id))}
                      aria-expanded={photosOpen.has(course.id)}
                      className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-ink-soft transition hover:bg-cream/40 hover:text-ink"
                    >
                      Photos &amp; notes
                      <ChevronDown
                        className={`size-4 transition ${photosOpen.has(course.id) ? "rotate-180" : ""}`}
                      />
                    </button>
                    {photosOpen.has(course.id) && <CoursePhotos courseId={course.id} />}
                  </div>
                </section>
              );
            })}
          </div>
        ))}

      <Dialog
        open={editingLectureId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingLectureId(null);
        }}
      >
        <DialogContent className="rounded-2xl border-line bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-ink">Rename lecture</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditLecture} className="mt-2 space-y-4">
            <div>
              <Label htmlFor="editLectureTitle" className="text-ink-soft">
                Title
              </Label>
              <Input
                id="editLectureTitle"
                value={editLectureTitle}
                onChange={(e) => setEditLectureTitle(e.target.value)}
                required
                maxLength={300}
                className="mt-1 rounded-xl border-line bg-background text-ink"
              />
            </div>
            <Button
              type="submit"
              disabled={!editLectureTitle.trim()}
              className="w-full rounded-full bg-rust text-cream hover:bg-rust/90"
            >
              Save name
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={lectureDialogOpen} onOpenChange={setLectureDialogOpen}>
        <DialogContent className="rounded-2xl border-line bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-ink">
              {lectureForm.kind === "tutorial" ? "Add tutorial" : "Add lecture"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddLecture} className="mt-2 space-y-4">
            <div>
              <Label htmlFor="lectureCourse" className="text-ink-soft">
                Course
              </Label>
              <select
                id="lectureCourse"
                value={lectureCourseId}
                onChange={(e) => setLectureCourseId(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-ink outline-none"
              >
                <option value="">Select a course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="lectureKind" className="text-ink-soft">
                Type
              </Label>
              <select
                id="lectureKind"
                value={lectureForm.kind}
                onChange={(e) =>
                  setLectureForm({
                    ...lectureForm,
                    kind: e.target.value as "lecture" | "tutorial",
                  })
                }
                className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-ink outline-none"
              >
                <option value="lecture">Lecture</option>
                <option value="tutorial">Tutorial</option>
              </select>
            </div>
            <div>
              <Label htmlFor="lectureTitle" className="text-ink-soft">
                Title
              </Label>
              <Input
                id="lectureTitle"
                value={lectureForm.title}
                onChange={(e) => setLectureForm({ ...lectureForm, title: e.target.value })}
                required
                className="mt-1 rounded-xl border-line bg-background text-ink"
              />
            </div>
            <div>
              <Label htmlFor="lectureDate" className="text-ink-soft">
                Date
              </Label>
              <Input
                id="lectureDate"
                type="date"
                value={lectureForm.date}
                onChange={(e) => setLectureForm({ ...lectureForm, date: e.target.value })}
                required
                className="mt-1 rounded-xl border-line bg-background text-ink"
              />
            </div>
            <Button
              type="submit"
              className="w-full rounded-full bg-rust text-cream hover:bg-rust/90"
            >
              Save lecture
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
