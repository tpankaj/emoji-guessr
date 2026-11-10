// Quiz data lives ONLY on the server (Firestore + the function). Never import this from web/.

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
  /**
   * Appears in the URL (/q/<id>). A number ("1", "2", …) once released, or a random
   * 10-character id (`npm run quiz -- new-id`) until then.
   */
  id: string;
  /**
   * false = draft: invisible on the live site, but playable at /q/<id> in the local
   * emulator for testing. Once true and deployed, never set it back (shared links break).
   */
  published: boolean;
  /**
   * true = "/" may play this quiz (the newest published, listed one wins). false = hidden
   * from the main site but still playable at /q/<id> once published. Can be toggled freely.
   * A quiz with a random id can never be listed.
   */
  listed: boolean;
  /**
   * Starts at 1. `npm run quiz` raises it when an edit would make players' saved progress
   * wrong (an answer, emoji, guess limit or the puzzle list changed), and browsers then start
   * the quiz over. Pinyin and meaning fixes don't change it. Carried over when a quiz is released.
   */
  revision: number;
  questions: Question[];
}

/**
 * Left behind at a quiz's old random id when it is released under a number, so links shared
 * during testing keep working. Stored as a document `{ movedTo }` next to the quizzes.
 */
export interface QuizAlias {
  /** The old random id (the document id). */
  id: string;
  /** The number the quiz was released as. */
  movedTo: string;
}
