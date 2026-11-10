import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { NUMBERED_ID, isAlias, validateAlias, validateQuiz, type Aliases } from "./game";
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

/** Everything loaded from the database: the valid quizzes and the old-id aliases that lead to them. */
export interface QuizSnapshot {
  /** Numbered quizzes oldest first, then quizzes with random ids. */
  quizzes: Quiz[];
  aliases: Aliases;
}

/**
 * Loads all quizzes and keeps them in memory. Published quizzes never change, so a short
 * cache only delays when a newly published quiz appears. Concurrent requests share one load,
 * and if a reload fails the last good set is used rather than failing the request.
 */
export class QuizStore {
  private cached?: { snapshot: QuizSnapshot; at: number };
  private loading?: Promise<QuizSnapshot>;

  constructor(
    private readonly fetch: QuizFetcher,
    private readonly opts: StoreOptions,
  ) {}

  async all(): Promise<Quiz[]> {
    return (await this.snapshot()).quizzes;
  }

  async snapshot(): Promise<QuizSnapshot> {
    const now = this.opts.now ?? Date.now;
    if (this.cached && this.opts.ttlMs > 0 && now() - this.cached.at < this.opts.ttlMs) {
      return this.cached.snapshot;
    }
    this.loading ??= this.load(now).finally(() => (this.loading = undefined));
    try {
      return await this.loading;
    } catch (err) {
      if (this.cached) return this.cached.snapshot;
      throw err;
    }
  }

  private async load(now: () => number): Promise<QuizSnapshot> {
    const raw = await this.fetch();
    const quizzes: Quiz[] = [];
    const movedTo = new Map<string, string>();
    for (const q of raw) {
      const errors = isAlias(q) ? validateAlias(q) : validateQuiz(q);
      if (errors.length) this.opts.onInvalid?.((q as { id?: unknown })?.id, errors);
      else if (isAlias(q)) movedTo.set((q as { id: string }).id, (q as { movedTo: string }).movedTo);
      else quizzes.push(q as Quiz);
    }
    // Numbered quizzes oldest first, so the last published, listed one is "latest";
    // quizzes with random ids go after them (they're never "latest" anyway).
    const rank = (q: Quiz) => (NUMBERED_ID.test(q.id) ? Number(q.id) : Infinity);
    quizzes.sort((a, b) => (rank(a) === rank(b) ? a.id.localeCompare(b.id) : rank(a) < rank(b) ? -1 : 1));
    // An alias only counts if its quiz exists, and never shadows a quiz with the same id.
    const aliases = new Map([...movedTo].filter(([from, to]) => quizzes.some((q) => q.id === to) && !quizzes.some((q) => q.id === from)));
    const snapshot = { quizzes, aliases };
    this.cached = { snapshot, at: now() };
    return snapshot;
  }
}
