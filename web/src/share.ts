import type { Mark, Progress, PublicQuiz } from "./types";

export const GAME_TITLE = "Emoji Guessr";

const SQUARE: Record<Mark, string> = { correct: "🟩", present: "🟨", absent: "⬜" };

export function solvedCount(quiz: PublicQuiz, progress: Progress): number {
  return quiz.questions.filter((q) => progress.questions[q.id]?.solved).length;
}

/** Unlisted quizzes use a random id instead of a number (never all digits). */
export const isUnlistedId = (quizId: string) => /^(?=[a-z0-9]*[a-z])[a-z0-9]{10}$/.test(quizId);

/** The permanent link to a quiz, used in the share text and the address bar. */
export const quizPath = (quizId: string) => `/q/${quizId}`;

/**
 * One line per puzzle: its number, then each guess as a block of squares.
 * Includes neither the emoji clues nor the guessed characters, so it gives nothing away.
 */
export function buildShareText(quiz: PublicQuiz, progress: Progress, origin: string): string {
  const lines = quiz.questions.map((q, i) => {
    const state = progress.questions[q.id];
    const rows = (state?.guesses ?? []).map((g) => g.marks.map((m) => SQUARE[m]).join(""));
    return `${i + 1}. ${rows.join(" ")}${state?.solved ? "" : " ❌"}`;
  });
  const name = isUnlistedId(quiz.id) ? `${GAME_TITLE} (unlisted)` : `${GAME_TITLE} #${quiz.id}`;
  const heading = `${name}  ${solvedCount(quiz, progress)}/${quiz.questions.length}`;
  return [heading, ...lines, origin + quizPath(quiz.id)].join("\n");
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
