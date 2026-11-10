import { describe, expect, it } from "vitest";
import { buildShareText, isUnlistedId, quizPath } from "./share";
import type { Progress, PublicQuiz } from "./types";

const quiz = (id: string): PublicQuiz => ({
  id,
  revision: 1,
  previousIds: [],
  latest: "5",
  questions: [
    { id: 1, emoji: "🧪", length: 2, maxGuesses: 2 },
    { id: 2, emoji: "📝", length: 2, maxGuesses: 2 },
  ],
});
const progress = (quizId: string): Progress => ({
  quizId,
  revision: 1,
  current: 1,
  questions: {
    "1": { guesses: [{ text: "测试", marks: ["present", "absent"] }, { text: "加油", marks: ["correct", "correct"] }], done: true, solved: true },
    "2": { guesses: [{ text: "你好", marks: ["absent", "absent"] }], done: true, solved: false },
  },
});

describe("isUnlistedId", () => {
  it("tells random ids from numbers", () => {
    expect(isUnlistedId("k3m9x2qv7t")).toBe(true);
    expect(isUnlistedId("a1b2c3d4e5")).toBe(true);
    for (const id of ["1", "12", "0123456789", "1234567890", "K3M9X2QV7T", "k3m9x2qv7", "k3m9x2qv7tt", "", "k3m9x2qv7!"]) {
      expect(isUnlistedId(id), id).toBe(false);
    }
  });
});

describe("buildShareText", () => {
  it("numbers a released quiz", () => {
    const text = buildShareText(quiz("5"), progress("5"), "https://example.test");
    expect(text.split("\n")).toEqual([
      "Emoji Guessr #5  1/2",
      "1. 🟨⬜ 🟩🟩",
      "2. ⬜⬜ ❌",
      "https://example.test/q/5",
    ]);
  });

  it("labels an unlisted quiz instead of numbering it", () => {
    const text = buildShareText(quiz("k3m9x2qv7t"), progress("k3m9x2qv7t"), "https://example.test");
    expect(text.split("\n")[0]).toBe("Emoji Guessr (unlisted)  1/2");
    expect(text).toContain(`https://example.test${quizPath("k3m9x2qv7t")}`);
  });

  it("gives away no clues or guessed characters", () => {
    const text = buildShareText(quiz("5"), progress("5"), "https://example.test");
    for (const secret of ["🧪", "📝", "测", "试", "加", "油", "你", "好"]) expect(text).not.toContain(secret);
  });
});
