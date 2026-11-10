import type { Progress, QuestionState, QuizIndex } from "./types";

// Progress is saved per quiz, so playing one never wipes another.
const PROGRESS_PREFIX = "emoji-guessr:progress:";
const HELP_KEY = "emoji-guessr:help-seen";

export const emptyQuestion = (): QuestionState => ({ guesses: [], done: false, solved: false });

/** What is saved under this quiz id, if it is usable. */
function readSaved(quizId: string): Progress | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_PREFIX + quizId) ?? "null");
    if (saved?.quizId === quizId && typeof saved.current === "number" && saved.questions) return saved;
  } catch {
    // storage unavailable or corrupt: treat as nothing saved
  }
  return null;
}

/** Progress saved before revisions existed has no revision, which means revision 1. */
const revisionOf = (p: Progress) => p.revision ?? 1;

/**
 * Saved progress for a quiz. Progress from another revision is ignored (an edit made it
 * wrong). If nothing is saved under `quizId`, progress saved under one of the quiz's
 * `previousIds` (it was released under a number) moves over, so testers keep their place.
 */
export function loadProgress(quizId: string, revision = 1, previousIds: string[] = []): Progress {
  const fresh: Progress = { quizId, revision, current: 0, questions: {} };
  const own = readSaved(quizId);
  if (own) return revisionOf(own) === revision ? { ...own, revision } : fresh;

  for (const oldId of previousIds) {
    const old = readSaved(oldId);
    if (!old || revisionOf(old) !== revision) continue;
    const moved: Progress = { ...old, quizId, revision };
    saveProgress(moved);
    try {
      localStorage.removeItem(PROGRESS_PREFIX + oldId);
    } catch {
      // ignore: the copy under the new id is what counts
    }
    return moved;
  }
  return fresh;
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
  const states = Object.values(readSaved(quizId)?.questions ?? {});
  const played = states.filter((s) => s.done).length;
  if (played >= count) return { kind: "done", solved: states.filter((s) => s.solved).length };
  if (played > 0 || states.some((s) => s.guesses.length > 0)) return { kind: "playing", played };
  return { kind: "new" };
}

/**
 * Where "/" should start: the oldest released quiz this player hasn't finished, or the
 * latest one when they've finished them all. Drafts and unlisted quizzes (emulator only)
 * never count. Null when there is nothing to play.
 */
export function firstUnfinishedId(index: QuizIndex): string | null {
  const released = index.quizzes.filter((q) => !q.draft && !q.unlisted);
  // The index is newest first, so walk it from the oldest end.
  for (let i = released.length - 1; i >= 0; i--) {
    if (archiveStatus(released[i].id, released[i].count).kind !== "done") return released[i].id;
  }
  return released[0]?.id ?? null;
}
