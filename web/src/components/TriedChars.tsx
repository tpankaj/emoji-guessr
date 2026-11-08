import type { Guess, Mark } from "../types";

const RANK: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };

/** Every character tried so far, colored by its best mark (there's no on-screen keyboard to color). */
export function TriedChars({ guesses }: { guesses: Guess[] }) {
  const best = new Map<string, Mark>();
  for (const g of guesses) {
    Array.from(g.text).forEach((ch, i) => {
      const m = g.marks[i];
      const prev = best.get(ch);
      if (!prev || RANK[m] > RANK[prev]) best.set(ch, m);
    });
  }
  if (best.size === 0) return null;
  return (
    <div class="tried" aria-label="Characters tried">
      {[...best].map(([ch, m]) => (
        <span key={ch} class={`chip ${m}`}>
          {ch}
        </span>
      ))}
    </div>
  );
}
