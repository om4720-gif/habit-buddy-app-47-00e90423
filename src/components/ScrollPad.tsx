import { useRef } from "react";

/** Small up/down buttons that scroll the dialog or page they're in, so long forms are never out of reach. */
export function ScrollPad() {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const scrollable = (): HTMLElement | null => {
    let el: HTMLElement | null = anchor.current?.parentElement ?? null;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 4) return el;
      el = el.parentElement;
    }
    return document.scrollingElement as HTMLElement | null;
  };
  const go = (direction: 1 | -1) => {
    const el = scrollable();
    el?.scrollBy({ top: direction * Math.round((el.clientHeight || 400) * 0.7), behavior: "smooth" });
  };
  return (
    <span ref={anchor} className="pointer-events-none fixed bottom-6 right-4 z-[80] flex flex-col gap-2">
      <button
        type="button"
        aria-label="Scroll up"
        onClick={() => go(-1)}
        className="pointer-events-auto grid size-10 place-items-center rounded-full bg-card text-ink shadow-md ring-1 ring-black/10 hover:bg-sand"
      >
        ↑
      </button>
      <button
        type="button"
        aria-label="Scroll down"
        onClick={() => go(1)}
        className="pointer-events-auto grid size-10 place-items-center rounded-full bg-card text-ink shadow-md ring-1 ring-black/10 hover:bg-sand"
      >
        ↓
      </button>
    </span>
  );
}
