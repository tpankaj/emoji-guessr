import type { Quiz } from "./types";
import { HAN_ONLY, chars, score, type Mark } from "./scoring";
import { signToken, verifyToken, type TokenState } from "./token";

export interface PublicQuiz {
  id: string;
  /** The newest published quiz's id, so an older quiz can point players to it. */
  latest: string | null;
  questions: { id: number; emoji: string; length: number; maxGuesses: number }[];
}

/** The archive list: ids and puzzle counts only, never clues or answers. */
export interface QuizIndex {
  latest: string | null;
  /** Newest first. `draft` appears only in the emulator, where drafts are playable. */
  quizzes: { id: string; count: number; draft?: true }[];
}

export interface Reveal {
  answer: string;
  pinyin: string;
  meaning: string;
}

export interface GuessResponse {
  marks: Mark[];
  solved: boolean;
  done: boolean;
  guessesUsed: number;
  token: string;
  reveal?: Reveal;
}

export interface Result {
  status: number;
  body: GuessResponse | { error: string };
}

/**
 * The quizzes players can reach: published ones only, plus drafts when `includeDrafts`
 * (the local emulator), so drafts can be tested at /q/<id> before publishing.
 */
export function playableQuizzes(quizzes: Quiz[], includeDrafts: boolean): Quiz[] {
  return includeDrafts ? quizzes : quizzes.filter((q) => q.published);
}

/** Numbered quizzes: "1", "2", … They form the main sequence that "/" plays. */
export const NUMBERED_ID = /^[1-9][0-9]*$/;
/** Hidden quizzes: 10 random lowercase letters and digits, at least one letter (so never a number). */
export const UNLISTED_ID = /^(?=.*[a-z])[a-z0-9]{10}$/;

/**
 * Looks up a quiz by id, or for "latest" the newest quiz that is published *and* listed
 * (never a draft, never a hidden one). Any published quiz is reachable by its own id.
 */
export function findQuiz(id: string, quizzes: Quiz[]): Quiz | undefined {
  if (id === "latest") return quizzes.filter((q) => q.published && q.listed).at(-1);
  return quizzes.find((q) => q.id === id);
}

/** The id of the newest published quiz (never a draft), or null if there is none. */
export const latestId = (quizzes: Quiz[]): string | null => findQuiz("latest", quizzes)?.id ?? null;

/** Every quiz a player can reach, newest first, for the archive page. */
export function quizIndex(quizzes: Quiz[]): QuizIndex {
  return {
    latest: latestId(quizzes),
    quizzes: [...quizzes]
      .reverse()
      .map((q) => ({ id: q.id, count: q.questions.length, ...(q.published ? {} : { draft: true as const }) })),
  };
}

/** What the browser is allowed to see: no answers, pinyin or meanings. */
export function publicQuiz(quiz: Quiz, latest: string | null): PublicQuiz {
  return {
    id: quiz.id,
    latest,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      emoji: q.emoji,
      length: chars(q.answer).length,
      maxGuesses: q.maxGuesses,
    })),
  };
}

/**
 * Problems with one quiz (empty when valid). Defensive about shape, because quizzes come
 * from the database or a hand-written JSON file and could contain anything.
 */
export function validateQuiz(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return ["quiz must be an object"];
  const quiz = raw as Record<string, unknown>;
  const id = String(quiz.id);
  const errors: string[] = [];
  const idOk = typeof quiz.id === "string" && (NUMBERED_ID.test(quiz.id) || UNLISTED_ID.test(quiz.id));
  if (!idOk) errors.push(`quiz "${id}": id must be a number like "1" or a 10-character unlisted id`);
  if (typeof quiz.published !== "boolean") errors.push(`quiz "${id}": published must be true or false`);
  if (typeof quiz.listed !== "boolean") errors.push(`quiz "${id}": listed must be true or false`);
  else if (quiz.listed && typeof quiz.id === "string" && UNLISTED_ID.test(quiz.id) && !NUMBERED_ID.test(quiz.id)) {
    errors.push(`quiz "${id}": a quiz with an unlisted id can't be listed`);
  }
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    errors.push(`quiz "${id}": has no puzzles`);
    return errors;
  }

  const questionIds = new Set<number>();
  quiz.questions.forEach((raw: unknown, i: number) => {
    const q = (raw ?? {}) as Record<string, unknown>;
    const where = `quiz "${id}" puzzle ${q.id ?? `#${i + 1}`}`;
    if (!Number.isInteger(q.id)) errors.push(`${where}: id must be a whole number`);
    else if (questionIds.has(q.id as number)) errors.push(`${where}: duplicate puzzle id`);
    else questionIds.add(q.id as number);
    if (typeof q.answer !== "string" || !HAN_ONLY.test(q.answer)) {
      errors.push(`${where}: answer must be Chinese characters only`);
    }
    if (!Number.isInteger(q.maxGuesses) || (q.maxGuesses as number) < 1) {
      errors.push(`${where}: maxGuesses must be ≥ 1`);
    }
    for (const field of ["emoji", "pinyin", "meaning"]) {
      if (typeof q[field] !== "string" || !(q[field] as string).trim()) errors.push(`${where}: missing ${field}`);
    }
  });
  return errors;
}

/** Problems across several quizzes: each quiz's own, plus duplicate ids. */
export function validateQuizzes(quizzes: unknown[]): string[] {
  const errors = quizzes.flatMap(validateQuiz);
  const seen = new Set<string>();
  for (const q of quizzes as Partial<Quiz>[]) {
    if (seen.has(String(q?.id))) errors.push(`quiz "${q?.id}": duplicate id`);
    seen.add(String(q?.id));
  }
  return errors;
}

/**
 * Why replacing `existing` with `next` isn't allowed (empty when it is). Drafts can change
 * freely. Once published, a quiz can't be unpublished, and its puzzles (count, order, ids,
 * emoji, answers, guess limits) are frozen: shared links and saved progress depend on them.
 * Fixing a pinyin or meaning is fine.
 */
export function checkUpdate(existing: Quiz | undefined, next: Quiz): string[] {
  if (!existing?.published) return [];
  const errors: string[] = [];
  if (!next.published) errors.push(`quiz "${next.id}" is published and can't be unpublished`);
  if (existing.questions.length !== next.questions.length) {
    errors.push(`quiz "${next.id}" is published: can't add or remove puzzles`);
    return errors;
  }
  existing.questions.forEach((old, i) => {
    const q = next.questions[i];
    for (const field of ["id", "emoji", "answer", "maxGuesses"] as const) {
      if (old[field] !== q[field]) {
        errors.push(`quiz "${next.id}" puzzle ${old.id} is published: can't change its ${field}`);
      }
    }
  });
  return errors;
}

const fail = (status: number, error: string): Result => ({ status, body: { error } });

export function handleGuess(input: unknown, secret: string, quizzes: Quiz[]): Result {
  const { quizId, questionId, guess, token } = (input ?? {}) as Record<string, unknown>;

  // "latest" is only for loading; guesses must name the exact quiz being played.
  const quiz = typeof quizId === "string" && quizId !== "latest" ? findQuiz(quizId, quizzes) : undefined;
  if (!quiz) return fail(404, "Unknown quiz");

  const question = quiz.questions.find((q) => q.id === questionId);
  if (!question) return fail(404, "Unknown question");

  if (typeof guess !== "string") return fail(400, "Missing guess");
  const g = guess.trim();
  const length = chars(question.answer).length;
  if (!HAN_ONLY.test(g)) return fail(400, "Guess must be Chinese characters only");
  if (chars(g).length !== length) return fail(400, `Guess must be ${length} characters`);

  let state: TokenState = { v: quiz.id, q: question.id, n: 0, done: false };
  if (token !== undefined && token !== null) {
    const parsed = typeof token === "string" ? verifyToken(token, secret) : null;
    if (!parsed || parsed.v !== quiz.id || parsed.q !== question.id) {
      return fail(400, "Invalid progress token");
    }
    state = parsed;
  }
  const max = question.maxGuesses;
  if (state.done || state.n >= max) return fail(409, "No guesses left for this question");

  const marks = score(g, question.answer);
  const solved = marks.every((m) => m === "correct");
  const n = state.n + 1;
  const done = solved || n >= max;

  const body: GuessResponse = {
    marks,
    solved,
    done,
    guessesUsed: n,
    token: signToken({ v: quiz.id, q: question.id, n, done }, secret),
  };
  if (done) {
    body.reveal = { answer: question.answer, pinyin: question.pinyin, meaning: question.meaning };
  }
  return { status: 200, body };
}
