// Quiz data lives ONLY on the server. Never import anything under quizzes/ from web/.

export interface Question {
  /** Unique within its quiz. */
  id: number;
  emoji: string;
  /** Chinese characters only. */
  answer: string;
  pinyin: string;
  meaning: string;
  /** Guesses allowed for this puzzle. Required: pick it per puzzle (e.g. more for longer phrases). */
  maxGuesses: number;
}

export interface Quiz {
  /** Appears in the URL (/q/<id>) and share text. Use the next number: "1", "2", … */
  id: string;
  questions: Question[];
}
