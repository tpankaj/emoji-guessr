export type Mark = "correct" | "present" | "absent";

/** Matches a non-empty string made only of Chinese (Han) characters. */
export const HAN_ONLY = /^\p{Script=Han}+$/u;

export function chars(s: string): string[] {
  return Array.from(s);
}

/**
 * Wordle-style scoring. Exact matches are marked first; remaining answer
 * characters are then consumed left-to-right for "present" marks, so a
 * character is never marked more times than it appears in the answer.
 */
export function score(guess: string, answer: string): Mark[] {
  const g = chars(guess);
  const a = chars(answer);
  const marks: Mark[] = g.map(() => "absent");
  const remaining = new Map<string, number>();

  a.forEach((ch, i) => {
    if (g[i] === ch) marks[i] = "correct";
    else remaining.set(ch, (remaining.get(ch) ?? 0) + 1);
  });

  g.forEach((ch, i) => {
    if (marks[i] === "correct") return;
    const left = remaining.get(ch) ?? 0;
    if (left > 0) {
      marks[i] = "present";
      remaining.set(ch, left - 1);
    }
  });

  return marks;
}
