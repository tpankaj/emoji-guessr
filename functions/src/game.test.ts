import { describe, expect, it } from "vitest";
import {
  checkUpdate,
  findQuiz,
  handleGuess,
  latestId,
  playableQuizzes,
  publicQuiz,
  quizIndex,
  validateQuiz,
  validateQuizzes,
  type GuessResponse,
} from "./game";
import type { Quiz } from "./types";
import { score, toSimplified } from "./scoring";
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

  it("treats traditional and simplified forms as the same character", () => {
    expect(score("摸魚", "摸鱼")).toEqual(["correct", "correct"]);
    expect(score("魚摸", "摸鱼")).toEqual(["present", "present"]);
    expect(score("測試題目", "测试题目")).toEqual(["correct", "correct", "correct", "correct"]);
    // mixed input, and answers stored in traditional
    expect(score("測试", "测試")).toEqual(["correct", "correct"]);
    // Taiwan / Hong Kong variants and two-to-one merges
    expect(score("為裡", "为里")).toEqual(["correct", "correct"]);
    expect(score("爲裏", "为里")).toEqual(["correct", "correct"]);
    expect(score("發髮", "发发")).toEqual(["correct", "correct"]);
    // a wrong character is still wrong in either script
    expect(score("摸蝦", "摸鱼")).toEqual(["correct", "absent"]);
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

const sampleQuiz: Quiz = {
  id: "1",
  published: true,
  questions: [
    { id: 1, emoji: "➕⛽️", answer: "加油", pinyin: "jiā yóu", meaning: "keep going", maxGuesses: 2 },
    { id: 2, emoji: "🧪📝", answer: "测试题目", pinyin: "cè shì tí mù", meaning: "test fixture", maxGuesses: 5 },
  ],
};

describe("publicQuiz", () => {
  it("never exposes answers, pinyin or meanings", () => {
    const json = JSON.stringify(publicQuiz(sampleQuiz, "1"));
    for (const q of sampleQuiz.questions) {
      for (const ch of q.answer) expect(json).not.toContain(ch);
      expect(json).not.toContain(q.pinyin);
      expect(json).not.toContain(q.meaning);
    }
    expect(publicQuiz(sampleQuiz, "1").questions[0]).toEqual({ id: 1, emoji: "➕⛽️", length: 2, maxGuesses: 2 });
  });

  it("includes the newest published quiz's id", () => {
    expect(publicQuiz(sampleQuiz, "4").latest).toBe("4");
    expect(publicQuiz(sampleQuiz, null).latest).toBeNull();
  });
});

describe("quizIndex", () => {
  const quiz = (id: string, published: boolean, count: number): Quiz => ({
    id,
    published,
    questions: sampleQuiz.questions.slice(0, count),
  });
  const quizzes = [quiz("1", true, 2), quiz("2", true, 1), quiz("3", false, 2)];

  it("lists quizzes newest first with puzzle counts, marking drafts", () => {
    expect(quizIndex(quizzes)).toEqual({
      latest: "2",
      quizzes: [
        { id: "3", count: 2, draft: true },
        { id: "2", count: 1 },
        { id: "1", count: 2 },
      ],
    });
  });

  it("leaves drafts out live", () => {
    expect(quizIndex(playableQuizzes(quizzes, false)).quizzes.map((q) => q.id)).toEqual(["2", "1"]);
    expect(latestId(playableQuizzes(quizzes, false))).toBe("2");
  });

  it("copes with no quizzes", () => {
    expect(quizIndex([])).toEqual({ latest: null, quizzes: [] });
  });

  it("never exposes clues, answers, pinyin or meanings", () => {
    const json = JSON.stringify(quizIndex(quizzes));
    for (const q of sampleQuiz.questions) {
      expect(json).not.toContain(q.emoji);
      for (const ch of q.answer) expect(json).not.toContain(ch);
      expect(json).not.toContain(q.pinyin);
      expect(json).not.toContain(q.meaning);
    }
  });
});

describe("validateQuizzes", () => {
  it("reports bad data", () => {
    const q = { id: 1, emoji: "🙂", answer: "你好", pinyin: "nǐ hǎo", meaning: "hi", maxGuesses: 3 };
    const errors = validateQuizzes([
      { id: "1", published: true, questions: [q, { ...q, answer: "hi" }] },
      { id: "1", published: false, questions: [{ ...q, id: 2, maxGuesses: 0 }, { ...q, id: 2 }] },
      { id: "v3", published: "yes" as unknown as boolean, questions: [] },
    ]);
    expect(errors.join("\n")).toMatch(/puzzle 1: duplicate puzzle id/);
    expect(errors.join("\n")).toMatch(/answer must be Chinese/);
    expect(errors.join("\n")).toMatch(/quiz "1": duplicate id/);
    expect(errors.join("\n")).toMatch(/maxGuesses must be/);
    expect(errors.join("\n")).toMatch(/quiz "v3": id must be a number/);
    expect(errors.join("\n")).toMatch(/quiz "v3": has no puzzles/);
    expect(errors.join("\n")).toMatch(/quiz "v3": published must be true or false/);
  });

  it("copes with malformed data from the database", () => {
    expect(validateQuiz(null)).toEqual(["quiz must be an object"]);
    expect(validateQuiz({ id: "2", published: true })).toEqual(['quiz "2": has no puzzles']);
    const errors = validateQuiz({ id: "2", published: true, questions: [null, { id: "x", answer: 5 }] }).join("\n");
    expect(errors).toMatch(/puzzle #1: id must be a whole number/);
    expect(errors).toMatch(/puzzle x: answer must be Chinese/);
    expect(errors).toMatch(/missing pinyin/);
    expect(validateQuiz(sampleQuiz)).toEqual([]);
  });
});

describe("handleGuess", () => {
  const quizzes: Quiz[] = [
    {
      id: "1",
      published: true,
      questions: [
        { id: 7, emoji: "🙂", answer: "加油", pinyin: "jiā yóu", meaning: "keep going test", maxGuesses: 5 },
        { id: 9, emoji: "🐟", answer: "摸鱼", pinyin: "mō yú", meaning: "slacking", maxGuesses: 2 },
      ],
    },
    {
      id: "2",
      published: true,
      questions: [{ id: 7, emoji: "🙂", answer: "你好", pinyin: "nǐ hǎo", meaning: "hello", maxGuesses: 3 }],
    },
    {
      id: "3",
      published: false,
      questions: [{ id: 1, emoji: "📝", answer: "草稿", pinyin: "cǎo gǎo", meaning: "draft", maxGuesses: 3 }],
    },
  ];
  const guessIn = (quizId: string, questionId: number, g: string, token?: string) =>
    handleGuess({ quizId, questionId, guess: g, token }, SECRET, quizzes);
  const guess = (g: string, token?: string) => guessIn("1", 7, g, token);
  const ok = (r: ReturnType<typeof handleGuess>) => {
    expect(r.status).toBe(200);
    return r.body as GuessResponse;
  };

  it("finds quizzes by id, or the newest published one for latest", () => {
    expect(findQuiz("1", quizzes)?.id).toBe("1");
    // quiz 3 is newer but a draft, so latest stays on 2
    expect(findQuiz("latest", quizzes)?.id).toBe("2");
    expect(findQuiz("4", quizzes)).toBeUndefined();
  });

  it("hides drafts on the live site but allows them locally", () => {
    const live = playableQuizzes(quizzes, false);
    const local = playableQuizzes(quizzes, true);
    expect(live.map((q) => q.id)).toEqual(["1", "2"]);
    expect(local.map((q) => q.id)).toEqual(["1", "2", "3"]);

    expect(findQuiz("3", live)).toBeUndefined();
    expect(handleGuess({ quizId: "3", questionId: 1, guess: "草稿" }, SECRET, live).status).toBe(404);

    expect(findQuiz("3", local)?.id).toBe("3");
    expect(findQuiz("latest", local)?.id).toBe("2");
    const r = handleGuess({ quizId: "3", questionId: 1, guess: "草稿" }, SECRET, local);
    expect((r.body as GuessResponse).solved).toBe(true);
  });

  it("validates input", () => {
    expect(guessIn("4", 7, "加油").status).toBe(404);
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

  it("accepts the answer typed in traditional characters", () => {
    const r = ok(guess("加油"));
    expect(r.solved).toBe(true);
    const t = ok(guessIn("1", 9, "摸魚"));
    expect(t).toMatchObject({ solved: true, done: true, marks: ["correct", "correct"] });
    expect(t.reveal?.answer).toBe("摸鱼");
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

describe("checkUpdate", () => {
  const draft = { ...sampleQuiz, published: false };
  const withQuestion = (i: number, change: Partial<Quiz["questions"][number]>): Quiz => ({
    ...sampleQuiz,
    questions: sampleQuiz.questions.map((q, j) => (j === i ? { ...q, ...change } : q)),
  });

  it("allows new quizzes, any change to a draft, and publishing a draft", () => {
    expect(checkUpdate(undefined, sampleQuiz)).toEqual([]);
    expect(checkUpdate(draft, { ...draft, questions: [sampleQuiz.questions[0]] })).toEqual([]);
    expect(checkUpdate(draft, sampleQuiz)).toEqual([]);
  });

  it("allows fixing a published quiz's pinyin or meaning", () => {
    expect(checkUpdate(sampleQuiz, withQuestion(0, { pinyin: "jiāyóu", meaning: "go go go" }))).toEqual([]);
  });

  it("refuses to unpublish or change a published quiz's puzzles", () => {
    expect(checkUpdate(sampleQuiz, draft).join()).toMatch(/can't be unpublished/);
    expect(checkUpdate(sampleQuiz, { ...sampleQuiz, questions: [sampleQuiz.questions[0]] }).join()).toMatch(
      /can't add or remove puzzles/,
    );
    expect(checkUpdate(sampleQuiz, withQuestion(0, { answer: "加班" })).join()).toMatch(/can't change its answer/);
    expect(checkUpdate(sampleQuiz, withQuestion(1, { maxGuesses: 6 })).join()).toMatch(/can't change its maxGuesses/);
    expect(checkUpdate(sampleQuiz, withQuestion(1, { emoji: "🐍" })).join()).toMatch(/can't change its emoji/);
  });
});

describe("toSimplified", () => {
  it("converts one character at a time, keeping the length", () => {
    expect(toSimplified("電腦遊戲")).toBe("电脑游戏");
    expect(toSimplified("加油")).toBe("加油");
    expect(Array.from(toSimplified("乾淨的麵條")).length).toBe(5);
  });
});
