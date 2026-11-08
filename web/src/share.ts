import type { Mark, Progress, PublicQuiz } from "./types";

const SQUARE: Record<Mark, string> = { correct: "🟩", present: "🟨", absent: "⬜" };

export function solvedCount(quiz: PublicQuiz, progress: Progress): number {
  return quiz.questions.filter((q) => progress.questions[q.id]?.solved).length;
}

/**
 * One line per question: the emoji clue, then each guess as a block of squares.
 * Never includes the guessed characters, so it's spoiler-free.
 */
export function buildShareText(quiz: PublicQuiz, progress: Progress, url: string): string {
  const lines = quiz.questions.map((q) => {
    const state = progress.questions[q.id];
    const rows = (state?.guesses ?? []).map((g) => g.marks.map((m) => SQUARE[m]).join(""));
    return `${q.emoji}  ${rows.join(" ")}${state?.solved ? "" : " ❌"}`;
  });
  return [`${quiz.title}  ${solvedCount(quiz, progress)}/${quiz.questions.length}`, ...lines, url].join(
    "\n",
  );
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

export async function shareText(text: string): Promise<ShareOutcome> {
  // Phones get the native share sheet; desktops get the clipboard.
  const isTouch = window.matchMedia?.("(pointer: coarse)").matches;
  if (isTouch && navigator.share) {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    // Older browsers / non-secure contexts
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok ? "copied" : "failed";
  }
}
