import { describe, expect, it, vi } from "vitest";
import { QuizStore } from "./store";

const quiz = (id: string, published = true) => ({
  id,
  published,
  listed: !/[a-z]/.test(id) && published,
  revision: 1,
  questions: [{ id: 1, emoji: "🙂", answer: "你好", pinyin: "nǐ hǎo", meaning: "hi", maxGuesses: 3 }],
});

describe("QuizStore", () => {
  it("sorts quizzes by number and leaves out invalid ones", async () => {
    const onInvalid = vi.fn();
    const store = new QuizStore(async () => [quiz("10"), quiz("2"), { id: "3", published: true, listed: true, revision: 1 }], {
      ttlMs: 0,
      onInvalid,
    });
    expect((await store.all()).map((q) => q.id)).toEqual(["2", "10"]);
    expect(onInvalid).toHaveBeenCalledWith("3", ['quiz "3": has no puzzles']);
  });

  it("puts quizzes with random ids after the numbered ones", async () => {
    const store = new QuizStore(async () => [quiz("k3m9x2qv7t"), quiz("10"), quiz("2"), quiz("a1b2c3d4e5")], { ttlMs: 0 });
    expect((await store.all()).map((q) => q.id)).toEqual(["2", "10", "a1b2c3d4e5", "k3m9x2qv7t"]);
  });

  it("reuses loaded quizzes until the cache expires", async () => {
    let t = 0;
    const fetch = vi.fn(async () => [quiz("1")]);
    const store = new QuizStore(fetch, { ttlMs: 1000, now: () => t });
    await store.all();
    t = 999;
    await store.all();
    expect(fetch).toHaveBeenCalledTimes(1);
    t = 1000;
    await store.all();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one load between concurrent requests", async () => {
    const fetch = vi.fn(async () => [quiz("1")]);
    const store = new QuizStore(fetch, { ttlMs: 0 });
    await Promise.all([store.all(), store.all(), store.all()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the last good quizzes if a reload fails", async () => {
    let fail = false;
    const store = new QuizStore(
      async () => {
        if (fail) throw new Error("firestore down");
        return [quiz("1")];
      },
      { ttlMs: 0 },
    );
    await store.all();
    fail = true;
    expect((await store.all()).map((q) => q.id)).toEqual(["1"]);
    await expect(new QuizStore(async () => Promise.reject(new Error("down")), { ttlMs: 0 }).all()).rejects.toThrow();
  });

  describe("aliases", () => {
    const alias = (id: string, movedTo: string) => ({ id, movedTo });

    it("loads aliases next to quizzes without treating them as quizzes", async () => {
      const store = new QuizStore(async () => [quiz("1"), quiz("2"), alias("a1b2c3d4e5", "2")], { ttlMs: 0 });
      const snap = await store.snapshot();
      expect(snap.quizzes.map((q) => q.id)).toEqual(["1", "2"]);
      expect([...snap.aliases]).toEqual([["a1b2c3d4e5", "2"]]);
      expect((await store.all()).map((q) => q.id)).toEqual(["1", "2"]);
    });

    it("drops an alias that points at a missing quiz, or sits on a real quiz's id", async () => {
      const store = new QuizStore(
        async () => [quiz("1"), quiz("k3m9x2qv7t"), alias("a1b2c3d4e5", "7"), alias("k3m9x2qv7t", "1")],
        { ttlMs: 0 },
      );
      expect((await store.snapshot()).aliases.size).toBe(0);
    });

    it("reports an invalid alias and keeps loading", async () => {
      const onInvalid = vi.fn();
      const store = new QuizStore(async () => [quiz("1"), alias("1", "2"), { id: "a1b2c3d4e5", movedTo: "oops" }], { ttlMs: 0, onInvalid });
      expect((await store.snapshot()).quizzes.map((q) => q.id)).toEqual(["1"]);
      expect(onInvalid).toHaveBeenCalledTimes(2);
    });

    it("keeps the last good aliases if a reload fails", async () => {
      let down = false;
      const store = new QuizStore(
        async () => {
          if (down) throw new Error("down");
          return [quiz("2"), alias("a1b2c3d4e5", "2")];
        },
        { ttlMs: 0 },
      );
      await store.snapshot();
      down = true;
      expect([...(await store.snapshot()).aliases]).toEqual([["a1b2c3d4e5", "2"]]);
    });
  });
});
