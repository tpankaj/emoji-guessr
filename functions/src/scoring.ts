import * as OpenCC from "opencc-js/t2cn";

export type Mark = "correct" | "present" | "absent";

/** Matches a non-empty string made only of Chinese (Han) characters. */
export const HAN_ONLY = /^\p{Script=Han}+$/u;

export function chars(s: string): string[] {
  return Array.from(s);
}

// Traditional → simplified, covering Taiwan and Hong Kong variants (OpenCC data).
const fromTaiwan = OpenCC.Converter({ from: "tw", to: "cn" });
const fromHongKong = OpenCC.Converter({ from: "hk", to: "cn" });

/** The simplified form of one character; characters without one are returned unchanged. */
function simplifyChar(ch: string): string {
  const out = fromTaiwan(fromHongKong(ch));
  return chars(out).length === 1 ? out : ch;
}

/**
 * Converts text to simplified characters one character at a time, so the length never
 * changes and each position still lines up with the original. Guesses and answers are both
 * normalized this way before scoring, so traditional and simplified spellings count the same.
 */
export function toSimplified(text: string): string {
  return chars(text).map(simplifyChar).join("");
}

/**
 * Per-character scoring. Exact matches are marked first; remaining answer
 * characters are then consumed left-to-right for "present" marks, so a
 * character is never marked more times than it appears in the answer.
 * Traditional and simplified forms of a character count as the same character.
 */
export function score(guess: string, answer: string): Mark[] {
  const g = chars(toSimplified(guess));
  const a = chars(toSimplified(answer));
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
