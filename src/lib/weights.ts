// Reads a grading scheme, either pasted or read from a photo. No AI is used for pasted text.
// Accepts both layouts:
//   Quizzes - 20%              (one item per line)
//   Databases (6 credit hours): Quizzes 10% best 2 out of 3, Project 30%, Midterm 25%, Final 30%
// Lines without a weight (headers, notes) are skipped.

export type WeightRow = {
  title: string;
  weight: number;
  isFinal: boolean;
  bestCount?: number | null;
  expectedCount?: number | null;
};

const FINAL = /\bfinal\b|نهائ/i;
const EN_DIGITS = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/** Parses one item such as "Quizzes 10% best 2 out of 3". Returns null when it isn't a weighted item. */
function parseItem(segment: string): WeightRow | null {
  let s = segment.trim();
  let bestCount: number | null = null;
  let expectedCount: number | null = null;
  const best = /\bbest\s+(\d+)\s+out\s+of\s+(\d+)\b/i.exec(s);
  if (best) {
    bestCount = Number(best[1]);
    expectedCount = Number(best[2]);
    s = (s.slice(0, best.index) + s.slice(best.index + best[0].length)).trim();
  }
  // title, separator, weight, optional %
  const m = /^(.*?)(\s*[:\-–—|]\s*|\s+)(\d+(?:\.\d+)?)\s*(%)?$/.exec(s);
  if (!m) return null;
  // A bare number like "Quiz 1" must not become a weight: require a % sign or an explicit separator.
  const explicit = !!m[4] || /[:\-–—|]/.test(m[2] ?? "");
  const title = m[1]!.replace(/[\s:\-–—|]+$/, "").trim();
  const weight = Number(m[3]);
  if (!explicit || !title || /^total\b/i.test(title) || weight <= 0 || weight > 100) return null;
  if (bestCount !== null && (bestCount < 1 || expectedCount === null || bestCount > expectedCount)) bestCount = null;
  return {
    title: title.slice(0, 200),
    weight,
    isFinal: FINAL.test(title),
    bestCount,
    expectedCount: bestCount === null ? null : expectedCount,
  };
}

export function parseWeightsText(text: string): { rows: WeightRow[]; skipped: string[]; creditHours: number | null } {
  const rows: WeightRow[] = [];
  const skipped: string[] = [];
  let creditHours: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    let line = EN_DIGITS(raw).replace(/\s+/g, " ").trim();
    if (!line) continue;

    // "Course name (6 credit hours): items..." is a header: take the credit hours, then the items after the colon.
    const colon = line.indexOf(":");
    const prefix = colon > 0 ? line.slice(0, colon) : "";
    const headerish = colon > 0 && /credit|\(/i.test(prefix) && !/%/.test(prefix);

    const credit = /(\d+(?:\.\d+)?)\s*(?:credit hours?|credits?|CH)\b/i.exec(prefix || line);
    if (credit) creditHours = Number(credit[1]);
    if (headerish) line = line.slice(colon + 1).trim();
    line = line.replace(/\(\s*\d+(?:\.\d+)?\s*(?:credit hours?|credits?|CH)\s*\)/i, "").trim();
    const shownRaw = raw.trim();

    const segments = line.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
    let added = 0;
    for (const seg of segments) {
      const row = parseItem(seg);
      if (row) {
        rows.push(row);
        added++;
      }
    }
    if (added === 0 && line) skipped.push(shownRaw);
  }
  return { rows, skipped, creditHours };
}

/** Checks a list against the rules the Grades section enforces. Returns an error message, or null. */
export function checkWeights(rows: WeightRow[], existing: { weight: number; is_final: boolean }[]): string | null {
  const total = existing.reduce((s, i) => s + i.weight, 0) + rows.reduce((s, r) => s + r.weight, 0);
  if (total > 100.0001) return `Weights would add up to ${Math.round(total * 10) / 10}%. The limit is 100%.`;
  if (rows.filter((r) => r.isFinal).length > 1 || (rows.some((r) => r.isFinal) && existing.some((i) => i.is_final)))
    return "A course can only have one final exam component.";
  return null;
}

// ---- Several courses in one paste -------------------------------------------------------

export type SchemeBlock = {
  header: string; // the course line, e.g. "CIS 503 | Design of Reinforced Concrete Structures I"
  creditHours: number | null;
  rows: WeightRow[];
  skipped: string[];
};

const IMAGE_LABEL = /^(png|jpe?g|gif|webp|image|photo|screenshot)$/i;

/** One weighted line: strips bullets, keeps "best N out of M", and ignores bracketed notes. */
function parseSchemeLine(raw: string): WeightRow | null {
  let line = EN_DIGITS(raw).replace(/^\s*[*•\-–]+\s*/, "").replace(/\s+/g, " ").trim();
  if (!line) return null;
  let bestCount: number | null = null;
  let expectedCount: number | null = null;
  const best = /\bbest\s+(\d+)\s+out\s+of\s+(\d+)\b/i.exec(line);
  if (best) {
    bestCount = Number(best[1]);
    expectedCount = Number(best[2]);
  }
  // Notes in brackets are commentary: remove them before reading the title and weight.
  line = line.replace(/\([^()]*\)/g, " ").replace(/\s+/g, " ").trim();
  const row = parseItem(line);
  if (!row) return null;
  if (bestCount !== null) return { ...row, bestCount, expectedCount };
  return row;
}

/**
 * Splits a pasted scheme that covers several courses into one block per course.
 * A course line ends with a colon and mentions credit hours; the weights under it belong to it.
 */
export function parseSchemeBlocks(text: string): SchemeBlock[] {
  const blocks: SchemeBlock[] = [];
  const open = (header: string, creditHours: number | null): SchemeBlock => {
    const block: SchemeBlock = { header, creditHours, rows: [], skipped: [] };
    blocks.push(block);
    return block;
  };
  let current: SchemeBlock | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const plain = trimmed.replace(/^[*•\-–\s]+/, "").trim();
    if (IMAGE_LABEL.test(plain)) continue; // "PNG", "JPG": leftovers from copying images

    const looksLikeHeader = /credit/i.test(plain) && !/%/.test(plain);
    if (looksLikeHeader) {
      const credits = /(\d+(?:\.\d+)?)\s*(?:credit hours?|credits?|CH)\b/i.exec(EN_DIGITS(plain));
      const header = EN_DIGITS(plain)
        .replace(/\(\s*\d+(?:\.\d+)?\s*(?:credit hours?|credits?|CH)\s*\)/i, "")
        .replace(/[:\s]+$/, "")
        .trim();
      current = open(header, credits ? Number(credits[1]) : null);
      continue;
    }
    if (!current) current = open("", null);
    const row = parseSchemeLine(trimmed);
    if (row) current.rows.push(row);
    else current.skipped.push(trimmed);
  }
  return blocks.filter((b) => b.rows.length > 0 || b.header);
}
