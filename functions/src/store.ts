import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { NUMBERED_ID, validateQuiz } from "./game";
import type { Quiz } from "./types";

/** The Firestore collection holding one document per quiz; the document id is the quiz id. */
export const QUIZ_COLLECTION = "quizzes";

/** Returns every quiz document as raw data (not yet validated). */
export type QuizFetcher = () => Promise<unknown[]>;

/** Reads all quizzes from Firestore with the function's own (admin) access. */
export function firestoreFetcher(): QuizFetcher {
  return async () => {
    if (!getApps().length) initializeApp();
    const snap = await getFirestore().collection(QUIZ_COLLECTION).get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  };
}

interface StoreOptions {
  /** How long a loaded set of quizzes is reused before reloading. 0 = reload every time. */
  ttlMs: number;
  /** Called for each quiz that fails validation; it's left out instead of breaking the game. */
  onInvalid?: (id: unknown, errors: string[]) => void;
  now?: () => number;
}

/**
 * Loads all quizzes and keeps them in memory. Published quizzes never change, so a short
 * cache only delays when a newly published quiz appears. Concurrent requests share one load,
 * and if a reload fails the last good set is used rather than failing the request.
 */
export class QuizStore {
  private cached?: { quizzes: Quiz[]; at: number };
  private loading?: Promise<Quiz[]>;

  constructor(
    private readonly fetch: QuizFetcher,
    private readonly opts: StoreOptions,
  ) {}

  async all(): Promise<Quiz[]> {
    const now = this.opts.now ?? Date.now;
    if (this.cached && this.opts.ttlMs > 0 && now() - this.cached.at < this.opts.ttlMs) {
      return this.cached.quizzes;
    }
    this.loading ??= this.load(now).finally(() => (this.loading = undefined));
    try {
      return await this.loading;
    } catch (err) {
      if (this.cached) return this.cached.quizzes;
      throw err;
    }
  }

  private async load(now: () => number): Promise<Quiz[]> {
    const raw = await this.fetch();
    const quizzes: Quiz[] = [];
    for (const q of raw) {
      const errors = validateQuiz(q);
      if (errors.length) this.opts.onInvalid?.((q as { id?: unknown })?.id, errors);
      else quizzes.push(q as Quiz);
    }
    // Numbered quizzes oldest first, so the last published, listed one is "latest";
    // quizzes with random ids go after them (they're never "latest" anyway).
    const rank = (q: Quiz) => (NUMBERED_ID.test(q.id) ? Number(q.id) : Infinity);
    quizzes.sort((a, b) => (rank(a) === rank(b) ? a.id.localeCompare(b.id) : rank(a) < rank(b) ? -1 : 1));
    this.cached = { quizzes, at: now() };
    return quizzes;
  }
}
