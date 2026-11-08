import { QUIZ, type Question, type Quiz } from "./quiz";
import { HAN_ONLY, chars, score, type Mark } from "./scoring";
import { signToken, verifyToken, type TokenState } from "./token";

export const DEFAULT_MAX_GUESSES = 5;

export const maxGuessesFor = (q: Question) => q.maxGuesses ?? DEFAULT_MAX_GUESSES;

export interface PublicQuiz {
  id: string;
  title: string;
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

export function publicQuiz(quiz: Quiz = QUIZ): PublicQuiz {
  return {
    id: quiz.id,
    title: quiz.title,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      emoji: q.emoji,
      length: chars(q.answer).length,
      maxGuesses: maxGuessesFor(q),
    })),
  };
}

const fail = (status: number, error: string): Result => ({ status, body: { error } });

export function handleGuess(input: unknown, secret: string, quiz: Quiz = QUIZ): Result {
  const { questionId, guess, token } = (input ?? {}) as Record<string, unknown>;

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
  const max = maxGuessesFor(question);
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
