import type { Progress, QuestionState } from "./types";

// Progress is saved per quiz, so playing one never wipes another.
const PROGRESS_PREFIX = "emoji-guessr:progress:";
const HELP_KEY = "emoji-guessr:help-seen";

export const emptyQuestion = (): QuestionState => ({ guesses: [], done: false, solved: false });

export function loadProgress(quizId: string): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_PREFIX + quizId) ?? "null");
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
    localStorage.setItem(PROGRESS_PREFIX + p.quizId, JSON.stringify(p));
  } catch {
    // ignore: game still works, it just won't resume after refresh
  }
}

export function clearProgress() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PROGRESS_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
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

export type ArchiveStatus =
  | { kind: "new" }
  | { kind: "playing"; played: number }
  | { kind: "done"; solved: number };

/** How far this player got in a quiz, from saved progress, for the archive list. */
export function archiveStatus(quizId: string, count: number): ArchiveStatus {
  const states = Object.values(loadProgress(quizId).questions);
  const played = states.filter((s) => s.done).length;
  if (played >= count) return { kind: "done", solved: states.filter((s) => s.solved).length };
  if (played > 0 || states.some((s) => s.guesses.length > 0)) return { kind: "playing", played };
  return { kind: "new" };
}
