// Colour for each letter grade, so a grade reads at a glance (green for strong, red for weak).
const COLORS: Record<string, string> = {
  "A+": "#15803d",
  A: "#16a34a",
  "A-": "#65a30d",
  "B+": "#0d9488",
  B: "#2563eb",
  "B-": "#0284c7",
  "C+": "#ca8a04",
  C: "#ea580c",
  "C-": "#f97316",
  "D+": "#dc2626",
  D: "#b91c1c",
  F: "#7f1d1d",
};

export const gradeColor = (letter: string | null | undefined) => (letter && COLORS[letter]) || "var(--rust)";

// One colour per course, like the course bars in your screenshots. Picked from the course id, so it never changes.
const COURSE_PALETTE = ["#E0833F", "#4A6FA5", "#2F7D6B", "#8E5BA8", "#C2547B", "#D9A21B", "#5E8C3A", "#3B8EA5", "#7A5C45"];
export const courseColor = (id: string) => {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_PALETTE[hash % COURSE_PALETTE.length]!;
};

/** Red for weak grades, yellow for middling, green for strong: a continuous scale from 0 to 100. */
export const scaleColor = (percent: number | null | undefined) => {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return "var(--ink-soft)";
  const p = Math.max(0, Math.min(100, percent));
  const hue = p <= 60 ? (p / 60) * 60 : 60 + ((p - 60) / 40) * 60; // 0 = red, 60 = yellow, 120 = green
  return `hsl(${hue.toFixed(0)} 72% 40%)`;
};
