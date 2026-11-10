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
   * Appears in the URL (/q/<id>). Either the next number ("1", "2", …) or, for a quiz that
   * must be hard to find, a random 10-character id from `npm run quiz -- new-id`.
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
  questions: Question[];
}
