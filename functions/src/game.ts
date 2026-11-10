import type { Quiz, QuizAlias } from "./types";
import { HAN_ONLY, chars, score, type Mark } from "./scoring";
import { signToken, verifyToken, type TokenState } from "./token";
import { toZhuyin } from "./zhuyin";

export interface PublicQuiz {
  id: string;
  /** Bumped when a change would make players' saved progress wrong; the site then starts them fresh. */
  revision: number;
  /** Ids this quiz used to have before release (see QuizAlias), so saved progress can follow it. */
  previousIds: string[];
  /** The newest published quiz's id, so an older quiz can point players to it. */
  latest: string | null;
  questions: { id: number; emoji: string; length: number; maxGuesses: number }[];
}

/** The archive list: ids and puzzle counts only, never clues or answers. */
export interface QuizIndex {
  latest: string | null;
  /**
   * Newest first. Live this is the listed quizzes only. In the emulator it also holds drafts
   * and unlisted quizzes, marked `draft` and `unlisted`.
   */
  quizzes: { id: string; count: number; draft?: true; unlisted?: true }[];
}

export interface Reveal {
  answer: string;
  pinyin: string;
  /** Made from the answer's characters, not stored with the quiz. */
  zhuyin: string;
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
 * Old random ids of quizzes that were released under a number, mapped to that number. A
 * promoted quiz leaves one behind so its shared link keeps working. Keys are random ids
 * from the request path, hence a Map (no prototype keys to trip over).
 */
export type Aliases = ReadonlyMap<string, string>;

/**
 * Looks up a quiz by id, or for "latest" the newest quiz that is published *and* listed
 * (never a draft, never a hidden one). Any published quiz is reachable by its own id, and a
 * promoted quiz by its old random id too (see Aliases).
 */
export function findQuiz(id: string, quizzes: Quiz[], aliases: Aliases = new Map()): Quiz | undefined {
  if (id === "latest") return quizzes.filter((q) => q.published && q.listed).at(-1);
  const direct = quizzes.find((q) => q.id === id);
  if (direct) return direct;
  const target = aliases.get(id);
  return target === undefined ? undefined : quizzes.find((q) => q.id === target);
}

/** The id of the newest published, listed quiz, or null if there is none. */
export const latestId = (quizzes: Quiz[]): string | null => findQuiz("latest", quizzes)?.id ?? null;

/** The old random ids that now lead to this quiz. */
export const previousIdsOf = (quizId: string, aliases: Aliases): string[] =>
  [...aliases].filter(([, to]) => to === quizId).map(([from]) => from).sort();

/**
 * The archive list, newest first. Live, only listed quizzes appear, so hidden ones stay
 * findable only by link. With `includeHidden` (the emulator) drafts and unlisted quizzes
 * appear too, after the numbered ones.
 */
export function quizIndex(quizzes: Quiz[], includeHidden = false): QuizIndex {
  const numbered = quizzes.filter((q) => NUMBERED_ID.test(q.id) && q.listed).reverse();
  const hidden = includeHidden ? quizzes.filter((q) => !(NUMBERED_ID.test(q.id) && q.listed)) : [];
  return {
    latest: latestId(quizzes),
    quizzes: [...numbered, ...hidden].map((q) => ({
      id: q.id,
      count: q.questions.length,
      ...(q.published ? {} : { draft: true as const }),
      ...(q.published && !q.listed ? { unlisted: true as const } : {}),
    })),
  };
}

/** What the browser is allowed to see: no answers, pinyin or meanings. */
export function publicQuiz(quiz: Quiz, latest: string | null, previousIds: string[] = []): PublicQuiz {
  return {
    id: quiz.id,
    revision: quiz.revision,
    previousIds,
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
  if (!Number.isInteger(quiz.revision) || (quiz.revision as number) < 1) {
    errors.push(`quiz "${id}": revision must be a whole number ≥ 1`);
  }
  // A number is given out only at release, so a numbered quiz is always live and on the main
  // site, and a quiz with a random id never is.
  if (typeof quiz.id === "string" && NUMBERED_ID.test(quiz.id)) {
    if (quiz.published === false || quiz.listed === false) {
      errors.push(`quiz "${id}": a numbered quiz must be published and listed (use a random id until it's released)`);
    }
  } else if (quiz.listed === true) {
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
 * Why replacing `existing` with `next` isn't allowed (empty when it is). A quiz with a random
 * id (draft or unlisted) can change freely; only the revision (see nextRevision) tells
 * players' browsers to start over. A numbered quiz is released: it can't be unpublished, and
 * its puzzles (count, order, ids, emoji, answers, guess limits) are frozen, because shared
 * links and saved progress depend on them. Fixing a pinyin or meaning is fine.
 */
export function checkUpdate(existing: Quiz | undefined, next: Quiz): string[] {
  if (!existing?.published || !NUMBERED_ID.test(existing.id)) return [];
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

export function handleGuess(input: unknown, secret: string, quizzes: Quiz[], aliases: Aliases = new Map()): Result {
  const { quizId, questionId, guess, token } = (input ?? {}) as Record<string, unknown>;

  // "latest" is only for loading; guesses must name the exact quiz being played.
  const quiz = typeof quizId === "string" && quizId !== "latest" ? findQuiz(quizId, quizzes, aliases) : undefined;
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
    // A token from before the quiz was released names its old random id; that still counts.
    const forThisQuiz = parsed && (parsed.v === quiz.id || aliases.get(parsed.v) === quiz.id);
    if (!parsed || !forThisQuiz || parsed.q !== question.id) {
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
    body.reveal = {
      answer: question.answer,
      pinyin: question.pinyin,
      zhuyin: toZhuyin(question.answer),
      meaning: question.meaning,
    };
  }
  return { status: 200, body };
}

/** True if a raw database document is an alias rather than a quiz. */
export const isAlias = (raw: unknown): boolean =>
  typeof raw === "object" && raw !== null && "movedTo" in raw;

/** Problems with an alias document (empty when valid). */
export function validateAlias(raw: unknown): string[] {
  const a = (raw ?? {}) as Partial<QuizAlias>;
  const errors: string[] = [];
  if (typeof a.id !== "string" || !UNLISTED_ID.test(a.id) || NUMBERED_ID.test(a.id)) {
    errors.push(`alias "${a.id}": id must be a random unlisted id`);
  }
  if (typeof a.movedTo !== "string" || !NUMBERED_ID.test(a.movedTo)) {
    errors.push(`alias "${a.id}": movedTo must be a quiz number`);
  }
  return errors;
}

const PLAY_FIELDS = ["id", "emoji", "answer", "maxGuesses"] as const;

/**
 * True if changing `a` to `b` could make a saved game wrong: a puzzle was added, removed,
 * reordered, or had its id, emoji, answer or guess limit changed. Pinyin and meaning don't count.
 */
export function affectsPlay(a: Quiz, b: Quiz): boolean {
  if (a.questions.length !== b.questions.length) return true;
  return a.questions.some((old, i) => PLAY_FIELDS.some((f) => old[f] !== b.questions[i][f]));
}

/**
 * The revision to store when `next` replaces `existing`. It goes up by one when the change
 * affects play, never goes down, and can be raised by hand (a higher number in the file wins).
 * A new quiz starts at the file's number, or 1.
 */
export function nextRevision(existing: Quiz | undefined, next: Omit<Quiz, "revision"> & { revision?: number }): number {
  const wanted = Number.isInteger(next.revision) ? (next.revision as number) : 1;
  if (!existing) return Math.max(1, wanted);
  const base = existing.revision + (affectsPlay(existing, next as Quiz) ? 1 : 0);
  return Math.max(base, wanted);
}

/** The number the next release gets: one past the highest numbered quiz, so numbers never have gaps. */
export function nextNumber(ids: string[]): string {
  const numbers = ids.filter((id) => NUMBERED_ID.test(id)).map(Number);
  return String(numbers.length ? Math.max(...numbers) + 1 : 1);
}

/** A random unlisted id that isn't in `taken`. Lowercase letters and digits without lookalikes (no 0/o, 1/l/i). */
export function generateUnlistedId(taken: ReadonlySet<string>, randomInt: (max: number) => number): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  for (;;) {
    const id = Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
    // The letter requirement keeps an id from ever looking like a number.
    if (UNLISTED_ID.test(id) && !taken.has(id)) return id;
  }
}

export type Promotion =
  | { ok: true; to: string; quiz: Quiz; alias: QuizAlias }
  | { ok: false; error: string };

/**
 * Releases a quiz that has a random id: it moves to the next number and leaves an alias at
 * the old id. `docs` is every document in the collection, as raw data with its id.
 * The numbers in use must run 1..N without gaps and all be published, so the new number
 * leaves no gap.
 */
export function planPromotion(docs: { id: string; data: Record<string, unknown> }[], fromId: string): Promotion {
  if (!UNLISTED_ID.test(fromId) || NUMBERED_ID.test(fromId)) {
    return { ok: false, error: `"${fromId}" doesn't have a random id; only a quiz with a random id can be released` };
  }
  const source = docs.find((d) => d.id === fromId);
  if (!source) return { ok: false, error: `no quiz "${fromId}"` };
  if (isAlias(source.data)) {
    return { ok: false, error: `"${fromId}" was already released as quiz ${String(source.data.movedTo)}` };
  }
  const numbered = docs.filter((d) => NUMBERED_ID.test(d.id));
  const unpublished = numbered.find((d) => d.data.published !== true);
  if (unpublished) {
    return { ok: false, error: `quiz ${unpublished.id} has a number but isn't published; fix that before releasing another` };
  }
  const numbers = numbered.map((d) => Number(d.id)).sort((a, b) => a - b);
  if (numbers.some((n, i) => n !== i + 1)) {
    return { ok: false, error: `the numbered quizzes (${numbers.join(", ")}) have a gap; releasing would not fix it` };
  }
  const to = nextNumber(numbered.map((d) => d.id));
  if (docs.some((d) => d.id === to)) return { ok: false, error: `quiz ${to} already exists` };

  // Check the quiz as it will be stored.
  const quiz = { ...source.data, id: to, published: true, listed: true } as unknown as Quiz;
  const problems = validateQuiz(quiz);
  if (problems.length) return { ok: false, error: `quiz "${fromId}" isn't valid:\n  ${problems.join("\n  ")}` };

  return {
    ok: true,
    to,
    quiz,
    alias: { id: fromId, movedTo: to },
  };
}
