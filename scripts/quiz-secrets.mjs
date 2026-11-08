// Shared by the leak checks: loads your local quiz files and lists what must stay secret.
//
// Quizzes live in Firestore; these are the working copies in quizzes/*.json (git-ignored).
// `npm run quiz -- download all` refreshes them.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const QUIZ_DIR = "quizzes";

/**
 * Text that contains an answer but is fine to have (e.g. encouragement shown after a puzzle
 * ends). It's removed before searching, so the answer appearing anywhere else still counts.
 * Longest first, so a phrase isn't partly removed by a shorter one it contains.
 */
export const ALLOWED_PHRASES = ["下次加油！", "加油！"].sort((a, b) => b.length - a.length);

export const stripAllowed = (text) => ALLOWED_PHRASES.reduce((t, p) => t.split(p).join(""), text);

/** All local quiz files, parsed. Empty if there are none. */
export function loadQuizzes(dir = QUIZ_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

const values = (quizzes, fields) =>
  quizzes.flatMap((q) => (q.questions ?? []).flatMap((x) => fields.map((f) => x[f])))
    .filter((v) => typeof v === "string" && v.trim());

/**
 * Every answer, pinyin and meaning, from all quizzes. The website must never contain any of
 * these, because players shouldn't see an answer before solving the puzzle.
 */
export function websiteSecrets(quizzes) {
  return { phrases: [...new Set(values(quizzes, ["answer", "pinyin", "meaning"]))], answers: values(quizzes, ["answer"]) };
}

/**
 * What must stay out of the git repo: the answer, pinyin, meaning and emoji clue of every
 * draft puzzle. Anything that also appears in a published quiz is already public (anyone can
 * play it), so it's left out.
 */
export function repoSecrets(quizzes) {
  const fields = ["answer", "pinyin", "meaning", "emoji"];
  const published = new Set(values(quizzes.filter((q) => q.published), fields));
  const drafts = values(quizzes.filter((q) => !q.published), fields);
  // Single emoji (e.g. "🐍") are too common to block on; whole clues are what give puzzles away.
  return [...new Set(drafts)].filter((v) => !published.has(v) && Array.from(v).length > 1);
}
