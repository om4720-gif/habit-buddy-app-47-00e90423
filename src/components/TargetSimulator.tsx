import { useState } from "react";

import { type SimItem, planTarget } from "@/lib/target-sim";
import { scaleColor } from "@/lib/grade-colors";

/** "What do I need?": pick a target letter and see the score needed on the remaining work, by plan. */
export function TargetSimulator({
  items,
  bands,
  currentAverage,
}: {
  items: SimItem[];
  bands: { label: string; minimum: number }[];
  currentAverage: number | null;
}) {
  const [label, setLabel] = useState<string>(bands[1]?.label ?? bands[0]?.label ?? "");
  const target = bands.find((b) => b.label === label);
  if (!target) return null;
  const plans = planTarget(items as SimItem[], target.minimum, currentAverage);
  if (plans.length === 0) {
    return <p className="mt-3 text-xs text-ink-soft">Nothing left to score, so there's no target to plan.</p>;
  }
  return (
    <div className="mt-3 rounded-2xl bg-cream/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Target</p>
        <select
          aria-label="Target grade"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-lg border border-line bg-background px-2 py-1 text-xs text-ink"
        >
          {bands.map((b) => (
            <option key={b.label} value={b.label}>
              {b.label} ({b.minimum}%+)
            </option>
          ))}
        </select>
      </div>
      <ul className="mt-2 space-y-2">
        {plans.map((p) => (
          <li key={p.name} className="rounded-xl bg-card px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-ink">{p.name}</span>
              <span className="font-mono text-sm font-bold" style={{ color: p.requiredPct === null ? "var(--ink-soft)" : scaleColor(p.requiredPct) }}>
                {p.requiredPct === null ? "not reachable" : `${p.requiredPct}%`}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-ink-soft">{p.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
