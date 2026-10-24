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
