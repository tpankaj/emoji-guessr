import { beforeEach, describe, expect, it } from "vitest";
import {
  archiveStatus,
  clearProgress,
  firstUnfinishedId,
  loadProgress,
  resetProgress,
  saveProgress,
} from "./storage";
import type { Progress, QuizIndex } from "./types";

// A minimal localStorage, since the tests run outside a browser. Like the real one, saved
// items are enumerable properties (clearProgress lists them with Object.keys).
class FakeStorage {
  getItem(k: string): string | null {
    return Object.hasOwn(this, k) ? ((this as Record<string, unknown>)[k] as string) : null;
  }
  setItem(k: string, v: string) {
    (this as Record<string, unknown>)[k] = v;
  }
  removeItem(k: string) {
    delete (this as Record<string, unknown>)[k];
  }
}
let store: FakeStorage;
beforeEach(() => {
  store = new FakeStorage();
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
});

const KEY = (id: string) => `emoji-guessr:progress:${id}`;
const played = (quizId: string, revision?: number): Progress => ({
  quizId,
  ...(revision === undefined ? {} : { revision }),
  current: 1,
  questions: {
    "1": { guesses: [{ text: "测试", marks: ["correct", "correct"] }], done: true, solved: true, token: "t1" },
    "2": { guesses: [{ text: "加油", marks: ["absent", "present"] }], done: false, solved: false, token: "t2" },
  },
});
const stash = (p: Progress) => store.setItem(KEY(p.quizId), JSON.stringify(p));

describe("loadProgress", () => {
  it("starts fresh when nothing is saved", () => {
    expect(loadProgress("5", 1)).toEqual({ quizId: "5", revision: 1, current: 0, questions: {} });
  });

  it("returns saved progress for the same revision, exactly as saved", () => {
    stash(played("5", 2));
    expect(loadProgress("5", 2)).toEqual(played("5", 2));
  });

  it("drops progress saved for another revision, and the next save replaces it", () => {
    stash(played("5", 1));
    const p = loadProgress("5", 2);
    expect(p).toEqual({ quizId: "5", revision: 2, current: 0, questions: {} });
    saveProgress(p);
    expect(JSON.parse(store.getItem(KEY("5"))!).revision).toBe(2);
  });

  it("counts progress saved before revisions existed as revision 1", () => {
    stash(played("5")); // no revision field, like every player's progress today
    expect(loadProgress("5", 1).current).toBe(1);
    expect(loadProgress("5", 1).revision).toBe(1);
    expect(loadProgress("5", 2).current).toBe(0); // the quiz was revised since
  });

  it("ignores corrupt or mismatched saves", () => {
    store.setItem(KEY("5"), "{not json");
    expect(loadProgress("5", 1).current).toBe(0);
    store.setItem(KEY("5"), JSON.stringify({ ...played("6", 1) })); // saved under the wrong key
    expect(loadProgress("5", 1).current).toBe(0);
    store.setItem(KEY("5"), JSON.stringify({ quizId: "5", current: "x", questions: {} }));
    expect(loadProgress("5", 1).current).toBe(0);
  });

  it("falls back to fresh progress when storage throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {},
      },
      configurable: true,
    });
    expect(loadProgress("5", 1, ["a1b2c3d4e5"]).current).toBe(0);
    expect(() => saveProgress(played("5", 1))).not.toThrow();
  });
});

describe("progress following a released quiz", () => {
  const OLD = "a1b2c3d4e5";

  it("moves progress from the old id to the number, then forgets the old copy", () => {
    stash(played(OLD, 2));
    const moved = loadProgress("5", 2, [OLD]);
    expect(moved).toEqual({ ...played("5", 2) });
    expect(JSON.parse(store.getItem(KEY("5"))!)).toEqual(played("5", 2));
    expect(store.getItem(KEY(OLD))).toBeNull();
    // a second visit reads the moved copy
    expect(loadProgress("5", 2, [OLD])).toEqual(played("5", 2));
  });

  it("keeps the tokens, so a half-played puzzle can carry on", () => {
    stash(played(OLD, 1));
    expect(loadProgress("5", 1, [OLD]).questions["2"].token).toBe("t2");
  });

  it("moves a completed quiz as completed", () => {
    const done = played(OLD, 1);
    done.questions["2"] = { guesses: [], done: true, solved: false };
    stash(done);
    const p = loadProgress("5", 1, [OLD]);
    expect(Object.values(p.questions).every((q) => q.done)).toBe(true);
  });

  it("moves progress saved before revisions existed", () => {
    stash(played(OLD));
    expect(loadProgress("5", 1, [OLD]).current).toBe(1);
  });

  it("leaves progress already saved under the number alone, and ignores the old copy", () => {
    stash(played("5", 1));
    const old = played(OLD, 1);
    old.current = 0;
    stash(old);
    expect(loadProgress("5", 1, [OLD]).current).toBe(1);
    expect(store.getItem(KEY(OLD))).not.toBeNull();
  });

  it("does not move old progress from another revision", () => {
    stash(played(OLD, 1));
    expect(loadProgress("5", 2, [OLD]).current).toBe(0);
    expect(store.getItem(KEY(OLD))).not.toBeNull();
  });

  it("tries each old id and ignores ones with nothing saved", () => {
    stash(played("z9y8x7w6v5", 1));
    expect(loadProgress("5", 1, [OLD, "z9y8x7w6v5"]).current).toBe(1);
  });

  it("does nothing special for a quiz with no old ids", () => {
    stash(played(OLD, 1));
    expect(loadProgress("5", 1, []).current).toBe(0);
  });
});

describe("archiveStatus and clearProgress", () => {
  it("reports status from saved progress whatever its revision", () => {
    expect(archiveStatus("5", 2)).toEqual({ kind: "new" });
    stash(played("5", 3));
    expect(archiveStatus("5", 2)).toEqual({ kind: "playing", played: 1 });
  });

  it("clears every quiz's progress but nothing else", () => {
    stash(played("5", 1));
    stash(played("a1b2c3d4e5", 1));
    store.setItem("emoji-guessr:help-seen", "1");
    clearProgress();
    expect(store.getItem(KEY("5"))).toBeNull();
    expect(store.getItem(KEY("a1b2c3d4e5"))).toBeNull();
    expect(store.getItem("emoji-guessr:help-seen")).toBe("1");
  });
});

describe("resetProgress", () => {
  const OLD = "a1b2c3d4e5";

  it("removes only the given quiz, plus its old ids", () => {
    stash(played("5", 1));
    stash(played(OLD, 1));
    stash(played("6", 1));
    store.setItem("emoji-guessr:help-seen", "1");
    resetProgress("5", [OLD]);
    expect(store.getItem(KEY("5"))).toBeNull();
    expect(store.getItem(KEY(OLD))).toBeNull();
    expect(store.getItem(KEY("6"))).not.toBeNull();
    expect(store.getItem("emoji-guessr:help-seen")).toBe("1");
  });

  it("leaves the quiz not started and loading fresh", () => {
    stash(played("5", 1));
    resetProgress("5");
    expect(archiveStatus("5", 2)).toEqual({ kind: "new" });
    expect(loadProgress("5", 1).current).toBe(0);
  });
});

describe("firstUnfinishedId", () => {
  const finished = (id: string): Progress => {
    const p = played(id, 1);
    p.questions["2"] = { guesses: [], done: true, solved: false };
    return p;
  };
  const index = (...ids: string[]): QuizIndex => ({
    latest: ids[0] ?? null,
    quizzes: ids.map((id) => ({ id, count: 2 })),
  });

  it("opens the oldest quiz when nothing is played", () => {
    expect(firstUnfinishedId(index("3", "2", "1"))).toBe("1");
  });

  it("skips finished quizzes, even when a newer one is unfinished", () => {
    stash(finished("1"));
    stash(finished("3"));
    expect(firstUnfinishedId(index("3", "2", "1"))).toBe("2");
  });

  it("stays on a quiz that is in progress", () => {
    stash(finished("1"));
    stash(played("2", 1));
    expect(firstUnfinishedId(index("3", "2", "1"))).toBe("2");
  });

  it("falls back to the newest quiz when all are finished", () => {
    stash(finished("1"));
    stash(finished("2"));
    expect(firstUnfinishedId(index("2", "1"))).toBe("2");
  });

  it("ignores drafts and unlisted quizzes, and returns null when empty", () => {
    const idx: QuizIndex = {
      latest: "1",
      quizzes: [
        { id: "a1b2c3d4e5", count: 2, unlisted: true },
        { id: "z9y8x7w6v5", count: 2, draft: true },
        { id: "1", count: 2 },
      ],
    };
    expect(firstUnfinishedId(idx)).toBe("1");
    expect(firstUnfinishedId(index())).toBeNull();
  });
});
