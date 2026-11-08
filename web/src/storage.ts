import type { Progress, QuestionState } from "./types";

const PROGRESS_KEY = "emoji-guesser:progress";
const HELP_KEY = "emoji-guesser:help-seen";

export const emptyQuestion = (): QuestionState => ({ guesses: [], done: false, solved: false });

export function loadProgress(quizId: string): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null");
    if (saved?.quizId === quizId && typeof saved.current === "number" && saved.questions) {
      return saved;
    }
  } catch {
    // storage unavailable or corrupt: start fresh
  }
  return { quizId, current: 0, questions: {} };
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // ignore: game still works, it just won't resume after refresh
  }
}

export function clearProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // ignore
  }
}

export function helpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_KEY) === "1";
  } catch {
    return false;
  }
}

export function markHelpSeen() {
  try {
    localStorage.setItem(HELP_KEY, "1");
  } catch {
    // ignore
  }
}
