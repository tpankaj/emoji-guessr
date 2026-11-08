import { QUIZZES } from "./quizzes";
import type { Quiz } from "./quizzes/types";
import { HAN_ONLY, chars, score, type Mark } from "./scoring";
import { signToken, verifyToken, type TokenState } from "./token";

export interface PublicQuiz {
  id: string;
  questions: { id: number; emoji: string; length: number; maxGuesses: number }[];
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

/** Looks up a quiz by id, or the newest one for "latest". */
export function findQuiz(id: string, quizzes: Quiz[] = QUIZZES): Quiz | undefined {
  return id === "latest" ? quizzes.at(-1) : quizzes.find((q) => q.id === id);
}

/** What the browser is allowed to see: no answers, pinyin or meanings. */
export function publicQuiz(quiz: Quiz): PublicQuiz {
  return {
    id: quiz.id,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      emoji: q.emoji,
      length: chars(q.answer).length,
      maxGuesses: q.maxGuesses,
    })),
  };
}

/** Returns a list of problems with the quiz data (empty when it's all valid). */
export function validateQuizzes(quizzes: Quiz[]): string[] {
  const errors: string[] = [];
  const quizIds = new Set<string>();
  for (const quiz of quizzes) {
    if (!/^[1-9][0-9]*$/.test(quiz.id)) errors.push(`quiz "${quiz.id}": id must be a number like "1"`);
    if (quizIds.has(quiz.id)) errors.push(`quiz "${quiz.id}": duplicate id`);
    quizIds.add(quiz.id);
    if (quiz.questions.length === 0) errors.push(`quiz "${quiz.id}": has no puzzles`);

    const questionIds = new Set<number>();
    for (const q of quiz.questions) {
      const where = `quiz "${quiz.id}" puzzle ${q.id}`;
      if (questionIds.has(q.id)) errors.push(`${where}: duplicate puzzle id`);
      questionIds.add(q.id);
      if (!HAN_ONLY.test(q.answer)) errors.push(`${where}: answer must be Chinese characters only`);
      if (!Number.isInteger(q.maxGuesses) || q.maxGuesses < 1) errors.push(`${where}: maxGuesses must be ≥ 1`);
      if (!q.emoji.trim() || !q.pinyin.trim() || !q.meaning.trim()) {
        errors.push(`${where}: missing emoji, pinyin or meaning`);
      }
    }
  }
  return errors;
}

const fail = (status: number, error: string): Result => ({ status, body: { error } });

export function handleGuess(input: unknown, secret: string, quizzes: Quiz[] = QUIZZES): Result {
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
