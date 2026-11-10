// Mirrors the shapes returned by functions/src/game.ts. The web app never sees answers
// until the server reveals them at the end of a question.

export type Mark = "correct" | "present" | "absent";

export interface PublicQuestion {
  id: number;
  emoji: string;
  length: number;
  maxGuesses: number;
}

export interface PublicQuiz {
  id: string;
  /** The newest published quiz's id. */
  latest: string | null;
  questions: PublicQuestion[];
}

/** GET /api/quizzes: every quiz a player can reach, newest first. */
export interface QuizIndex {
  latest: string | null;
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

export interface Guess {
  text: string;
  marks: Mark[];
}

export interface QuestionState {
  guesses: Guess[];
  token?: string;
  done: boolean;
  solved: boolean;
  reveal?: Reveal;
}

export interface Progress {
  quizId: string;
  current: number;
  questions: Record<string, QuestionState>;
}
