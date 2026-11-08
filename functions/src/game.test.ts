import { describe, expect, it } from "vitest";
import { MAX_GUESSES, handleGuess, publicQuiz, type GuessResponse } from "./game";
import { QUIZ, type Quiz } from "./quiz";
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
    const t = signToken({ v: "v1", q: 1, n: 2, done: false }, SECRET);
    expect(verifyToken(t, SECRET)).toEqual({ v: "v1", q: 1, n: 2, done: false });
    expect(verifyToken(t, "other-secret")).toBeNull();

    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ v: "v1", q: 1, n: 0, done: false })).toString(
      "base64url",
    );
    expect(verifyToken(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken("garbage", SECRET)).toBeNull();
    expect(verifyToken("a.b.c", SECRET)).toBeNull();
  });
});

describe("publicQuiz", () => {
  it("never exposes answers, pinyin or meanings", () => {
    const json = JSON.stringify(publicQuiz());
    for (const q of QUIZ.questions) {
      for (const ch of q.answer) expect(json).not.toContain(ch);
      expect(json).not.toContain(q.pinyin);
      expect(json).not.toContain(q.meaning);
    }
    expect(publicQuiz().questions[0]).toEqual({ id: 1, emoji: "➕⛽️", length: 2 });
  });
});

describe("handleGuess", () => {
  const quiz: Quiz = {
    id: "t",
    title: "Test",
    questions: [{ id: 7, emoji: "🙂", answer: "加油", pinyin: "jiā yóu", meaning: "keep going test" }],
  };
  const guess = (g: string, token?: string) =>
    handleGuess({ questionId: 7, guess: g, token }, SECRET, quiz);
  const ok = (r: ReturnType<typeof handleGuess>) => {
    expect(r.status).toBe(200);
    return r.body as GuessResponse;
  };

  it("validates input", () => {
    expect(handleGuess({ questionId: 99, guess: "加油" }, SECRET, quiz).status).toBe(404);
    expect(guess("jiayou").status).toBe(400);
    expect(guess("加").status).toBe(400);
    expect(guess("加油站").status).toBe(400);
    expect(guess("加1").status).toBe(400);
    expect(guess("加油", "bad.token").status).toBe(400);
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
    for (let i = 1; i <= MAX_GUESSES; i++) {
      last = ok(guess("你好", token));
      token = last.token;
      if (i < MAX_GUESSES) {
        const json = JSON.stringify(last);
        for (const secret of ["加油", "jiā yóu", "keep going test"]) expect(json).not.toContain(secret);
      }
    }
    expect(last).toMatchObject({ solved: false, done: true, guessesUsed: MAX_GUESSES });
    expect(last.reveal?.answer).toBe("加油");
    expect(guess("加油", token).status).toBe(409);
  });

  it("rejects a token from another question or quiz version", () => {
    const other = signToken({ v: "t", q: 8, n: 0, done: false }, SECRET);
    expect(guess("加油", other).status).toBe(400);
    const oldVersion = signToken({ v: "old", q: 7, n: 0, done: false }, SECRET);
    expect(guess("加油", oldVersion).status).toBe(400);
  });
});
