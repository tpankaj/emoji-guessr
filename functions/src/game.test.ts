import { describe, expect, it } from "vitest";
import { findQuiz, handleGuess, publicQuiz, validateQuizzes, type GuessResponse } from "./game";
import { QUIZZES } from "./quizzes";
import type { Quiz } from "./quizzes/types";
import { score } from "./scoring";
import { signToken, verifyToken } from "./token";

const SECRET = "test-secret";

describe("score", () => {
  it("marks exact, present and absent characters", () => {
    expect(score("油加", "加油")).toEqual(["present", "present"]);
    expect(score("加班", "加油")).toEqual(["correct", "absent"]);
    expect(score("加油", "加油")).toEqual(["correct", "correct"]);
  });

  it("never marks a character more times than it appears in the answer", () => {
    // answer has one 人; guess has two
    expect(score("人人", "大人")).toEqual(["absent", "correct"]);
    expect(score("人人好", "好大人")).toEqual(["present", "absent", "present"]);
    expect(score("人人人", "人山海")).toEqual(["correct", "absent", "absent"]);
    expect(score("山人人", "人海人")).toEqual(["absent", "present", "correct"]);
  });

  it("handles repeated characters in the answer", () => {
    expect(score("谢谢", "谢谢")).toEqual(["correct", "correct"]);
    expect(score("谢你", "你谢")).toEqual(["present", "present"]);
  });
});

describe("token", () => {
  it("round-trips and rejects tampering", () => {
    const t = signToken({ v: "1", q: 1, n: 2, done: false }, SECRET);
    expect(verifyToken(t, SECRET)).toEqual({ v: "1", q: 1, n: 2, done: false });
    expect(verifyToken(t, "other-secret")).toBeNull();

    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ v: "1", q: 1, n: 0, done: false })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken("garbage", SECRET)).toBeNull();
    expect(verifyToken("a.b.c", SECRET)).toBeNull();
  });
});

describe("published quizzes", () => {
  it("are all valid", () => {
    expect(validateQuizzes(QUIZZES)).toEqual([]);
  });

  it("never expose answers, pinyin or meanings publicly", () => {
    for (const quiz of QUIZZES) {
      const json = JSON.stringify(publicQuiz(quiz));
      for (const q of quiz.questions) {
        for (const ch of q.answer) expect(json).not.toContain(ch);
        expect(json).not.toContain(q.pinyin);
        expect(json).not.toContain(q.meaning);
      }
    }
    expect(publicQuiz(QUIZZES[0]).questions[0]).toEqual({ id: 1, emoji: "➕⛽️", length: 2, maxGuesses: 2 });
  });
});

describe("validateQuizzes", () => {
  it("reports bad data", () => {
    const q = { id: 1, emoji: "🙂", answer: "你好", pinyin: "nǐ hǎo", meaning: "hi", maxGuesses: 3 };
    const errors = validateQuizzes([
      { id: "1", questions: [q, { ...q, answer: "hi" }] },
      { id: "1", questions: [{ ...q, id: 2, maxGuesses: 0 }, { ...q, id: 2 }] },
      { id: "v3", questions: [] },
    ]);
    expect(errors.join("\n")).toMatch(/puzzle 1: duplicate puzzle id/);
    expect(errors.join("\n")).toMatch(/answer must be Chinese/);
    expect(errors.join("\n")).toMatch(/quiz "1": duplicate id/);
    expect(errors.join("\n")).toMatch(/maxGuesses must be/);
    expect(errors.join("\n")).toMatch(/quiz "v3": id must be a number/);
    expect(errors.join("\n")).toMatch(/quiz "v3": has no puzzles/);
  });
});

describe("handleGuess", () => {
  const quizzes: Quiz[] = [
    {
      id: "1",
      questions: [
        { id: 7, emoji: "🙂", answer: "加油", pinyin: "jiā yóu", meaning: "keep going test", maxGuesses: 5 },
        { id: 9, emoji: "🐟", answer: "摸鱼", pinyin: "mō yú", meaning: "slacking", maxGuesses: 2 },
      ],
    },
    {
      id: "2",
      questions: [{ id: 7, emoji: "🙂", answer: "你好", pinyin: "nǐ hǎo", meaning: "hello", maxGuesses: 3 }],
    },
  ];
  const guessIn = (quizId: string, questionId: number, g: string, token?: string) =>
    handleGuess({ quizId, questionId, guess: g, token }, SECRET, quizzes);
  const guess = (g: string, token?: string) => guessIn("1", 7, g, token);
  const ok = (r: ReturnType<typeof handleGuess>) => {
    expect(r.status).toBe(200);
    return r.body as GuessResponse;
  };

  it("finds quizzes by id, or the newest for latest", () => {
    expect(findQuiz("1", quizzes)?.id).toBe("1");
    expect(findQuiz("latest", quizzes)?.id).toBe("2");
    expect(findQuiz("3", quizzes)).toBeUndefined();
  });

  it("validates input", () => {
    expect(guessIn("3", 7, "加油").status).toBe(404);
    expect(guessIn("latest", 7, "你好").status).toBe(404);
    expect(handleGuess({ questionId: 7, guess: "加油" }, SECRET, quizzes).status).toBe(404);
    expect(guessIn("1", 99, "加油").status).toBe(404);
    expect(guess("jiayou").status).toBe(400);
    expect(guess("加").status).toBe(400);
    expect(guess("加油站").status).toBe(400);
    expect(guess("加1").status).toBe(400);
    expect(guess("加油", "bad.token").status).toBe(400);
  });

  it("scores against the right quiz", () => {
    expect(ok(guessIn("1", 7, "加油")).solved).toBe(true);
    expect(ok(guessIn("2", 7, "加油")).solved).toBe(false);
    expect(ok(guessIn("2", 7, "你好")).reveal?.answer).toBe("你好");
  });

  it("reveals only when solved", () => {
    const first = ok(guess("加班"));
    expect(first).toMatchObject({ solved: false, done: false, guessesUsed: 1 });
    expect(first.reveal).toBeUndefined();

    const second = ok(guess(" 加油 ", first.token));
    expect(second).toMatchObject({ solved: true, done: true, guessesUsed: 2 });
    expect(second.reveal?.answer).toBe("加油");

    expect(guess("加油", second.token).status).toBe(409);
  });

  it("gives no answer, pinyin or meaning until the last wrong guess", () => {
    let token: string | undefined;
    let last!: GuessResponse;
    for (let i = 1; i <= 5; i++) {
      last = ok(guess("你好", token));
      token = last.token;
      if (i < 5) {
        const json = JSON.stringify(last);
        for (const secret of ["加油", "jiā yóu", "keep going test"]) expect(json).not.toContain(secret);
      }
    }
    expect(last).toMatchObject({ solved: false, done: true, guessesUsed: 5 });
    expect(last.reveal?.answer).toBe("加油");
    expect(guess("加油", token).status).toBe(409);
  });

  it("uses each puzzle's own guess limit", () => {
    const first = ok(guessIn("1", 9, "你好"));
    expect(first).toMatchObject({ done: false, guessesUsed: 1 });
    expect(first.reveal).toBeUndefined();
    const second = ok(guessIn("1", 9, "你好", first.token));
    expect(second).toMatchObject({ solved: false, done: true, guessesUsed: 2 });
    expect(second.reveal?.answer).toBe("摸鱼");
    expect(guessIn("1", 9, "摸鱼", second.token).status).toBe(409);
  });

  it("rejects a token from another question or another quiz", () => {
    const otherQuestion = signToken({ v: "1", q: 9, n: 0, done: false }, SECRET);
    expect(guess("加油", otherQuestion).status).toBe(400);
    // Same question id (7) in quiz 2: its token must not work in quiz 1
    const fromQuiz2 = ok(guessIn("2", 7, "大学")).token;
    expect(guess("加油", fromQuiz2).status).toBe(400);
  });
});
