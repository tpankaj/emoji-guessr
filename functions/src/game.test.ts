import { describe, expect, it } from "vitest";
import {
  affectsPlay,
  checkUpdate,
  findQuiz,
  generateUnlistedId,
  handleGuess,
  latestId,
  nextNumber,
  nextRevision,
  planPromotion,
  playableQuizzes,
  previousIdsOf,
  publicQuiz,
  quizIndex,
  validateAlias,
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
  listed: true,
  revision: 1,
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

  it("includes the revision and the quiz's old ids", () => {
    expect(publicQuiz({ ...sampleQuiz, revision: 4 }, "1", ["a1b2c3d4e5"])).toMatchObject({
      revision: 4,
      previousIds: ["a1b2c3d4e5"],
    });
    expect(publicQuiz(sampleQuiz, "1").previousIds).toEqual([]);
  });

  it("includes the newest published quiz's id", () => {
    expect(publicQuiz(sampleQuiz, "4").latest).toBe("4");
    expect(publicQuiz(sampleQuiz, null).latest).toBeNull();
  });
});

describe("quizIndex", () => {
  const quiz = (id: string, published: boolean, listed: boolean, count: number): Quiz => ({
    id,
    published,
    listed,
    revision: 1,
    questions: sampleQuiz.questions.slice(0, count),
  });
  // Store order: numbered oldest first, then random ids.
  const quizzes = [quiz("1", true, true, 2), quiz("2", true, true, 1), quiz("d4f5g6h7j8", false, false, 2), quiz("k3m9x2qv7t", true, false, 1)];

  it("lists only listed quizzes, newest first with puzzle counts", () => {
    expect(quizIndex(quizzes)).toEqual({
      latest: "2",
      quizzes: [
        { id: "2", count: 1 },
        { id: "1", count: 2 },
      ],
    });
  });

  it("never lists an unlisted quiz or a draft live", () => {
    const live = playableQuizzes(quizzes, false);
    expect(quizIndex(live).quizzes.map((q) => q.id)).toEqual(["2", "1"]);
    expect(latestId(live)).toBe("2");
  });

  it("shows drafts and unlisted quizzes after the numbered ones when asked (the emulator)", () => {
    expect(quizIndex(quizzes, true).quizzes).toEqual([
      { id: "2", count: 1 },
      { id: "1", count: 2 },
      { id: "d4f5g6h7j8", count: 2, draft: true },
      { id: "k3m9x2qv7t", count: 1, unlisted: true },
    ]);
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
      { id: "1", published: true, listed: true, revision: 1, questions: [q, { ...q, answer: "hi" }] },
      { id: "1", published: true, listed: true, revision: 1, questions: [{ ...q, id: 2, maxGuesses: 0 }, { ...q, id: 2 }] },
      { id: "v3", published: "yes" as unknown as boolean, questions: [] },
    ]);
    expect(errors.join("\n")).toMatch(/puzzle 1: duplicate puzzle id/);
    expect(errors.join("\n")).toMatch(/answer must be Chinese/);
    expect(errors.join("\n")).toMatch(/quiz "1": duplicate id/);
    expect(errors.join("\n")).toMatch(/maxGuesses must be/);
    expect(errors.join("\n")).toMatch(/quiz "v3": id must be a number/);
    expect(errors.join("\n")).toMatch(/quiz "v3": has no puzzles/);
    expect(errors.join("\n")).toMatch(/quiz "v3": published must be true or false/);
    expect(errors.join("\n")).toMatch(/quiz "v3": listed must be true or false/);
    expect(errors.join("\n")).toMatch(/quiz "v3": revision must be a whole number/);
  });

  it("accepts numbered quizzes only when released, and random ids only when not listed", () => {
    const hidden = { ...sampleQuiz, id: "k3m9x2qv7t", listed: false };
    expect(validateQuiz(sampleQuiz)).toEqual([]);
    expect(validateQuiz(hidden)).toEqual([]); // unlisted: live by link
    expect(validateQuiz({ ...hidden, published: false })).toEqual([]); // draft
    expect(validateQuiz({ ...hidden, listed: true }).join()).toMatch(/unlisted id can't be listed/);
    expect(validateQuiz({ ...sampleQuiz, listed: false }).join()).toMatch(/numbered quiz must be published and listed/);
    expect(validateQuiz({ ...sampleQuiz, published: false, listed: false }).join()).toMatch(/must be published and listed/);
  });

  it("rejects bad ids and a missing listed or revision", () => {
    const hidden = { ...sampleQuiz, id: "k3m9x2qv7t", listed: false };
    expect(validateQuiz({ ...hidden, id: "K3M9X2QV7T" }).join()).toMatch(/id must be/);
    expect(validateQuiz({ ...hidden, id: "k3m9x2qv7" }).join()).toMatch(/id must be/);
    expect(validateQuiz({ ...hidden, id: "0123456789" }).join()).toMatch(/id must be/);
    const { listed: _l, ...noListed } = sampleQuiz;
    expect(validateQuiz(noListed).join()).toMatch(/listed must be true or false/);
    const { revision: _r, ...noRevision } = sampleQuiz;
    expect(validateQuiz(noRevision).join()).toMatch(/revision must be a whole number/);
    expect(validateQuiz({ ...sampleQuiz, revision: 0 }).join()).toMatch(/revision must be/);
    expect(validateQuiz({ ...sampleQuiz, revision: 1.5 }).join()).toMatch(/revision must be/);
  });

  it("copes with malformed data from the database", () => {
    expect(validateQuiz(null)).toEqual(["quiz must be an object"]);
    expect(validateQuiz({ id: "2", published: true, listed: true, revision: 1 })).toEqual(['quiz "2": has no puzzles']);
    const errors = validateQuiz({ id: "2", published: true, listed: true, revision: 1, questions: [null, { id: "x", answer: 5 }] }).join("\n");
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
      listed: true,
      revision: 1,
      questions: [
        { id: 7, emoji: "🙂", answer: "加油", pinyin: "jiā yóu", meaning: "keep going test", maxGuesses: 5 },
        { id: 9, emoji: "🐟", answer: "摸鱼", pinyin: "mō yú", meaning: "slacking", maxGuesses: 2 },
      ],
    },
    {
      id: "2",
      published: true,
      listed: true,
      revision: 1,
      questions: [{ id: 7, emoji: "🙂", answer: "你好", pinyin: "nǐ hǎo", meaning: "hello", maxGuesses: 3 }],
    },
    {
      id: "d4f5g6h7j8",
      published: false,
      listed: false,
      revision: 1,
      questions: [{ id: 1, emoji: "📝", answer: "草稿", pinyin: "cǎo gǎo", meaning: "draft", maxGuesses: 3 }],
    },
  ];
  const guessIn = (quizId: string, questionId: number, g: string, token?: string) =>
    handleGuess({ quizId, questionId, guess: g, token }, SECRET, quizzes);
  const guessInQuizzes = (list: Quiz[], quizId: string) =>
    handleGuess({ quizId, questionId: 7, guess: "你好" }, SECRET, list);
  const guess = (g: string, token?: string) => guessIn("1", 7, g, token);
  const ok = (r: ReturnType<typeof handleGuess>) => {
    expect(r.status).toBe(200);
    return r.body as GuessResponse;
  };

  it("finds quizzes by id, or the newest published one for latest", () => {
    expect(findQuiz("1", quizzes)?.id).toBe("1");
    // the draft is never "latest"
    expect(findQuiz("latest", quizzes)?.id).toBe("2");
    expect(findQuiz("4", quizzes)).toBeUndefined();
  });

  it("keeps unlisted quizzes off latest but reachable by id", () => {
    const withHidden: Quiz[] = [
      ...quizzes,
      { ...quizzes[1], id: "k3m9x2qv7t", listed: false },
    ];
    expect(findQuiz("latest", withHidden)?.id).toBe("2");
    expect(findQuiz("k3m9x2qv7t", withHidden)?.id).toBe("k3m9x2qv7t");
    expect(guessInQuizzes(withHidden, "k3m9x2qv7t").status).toBe(200);
  });

  it("hides drafts on the live site but allows them locally", () => {
    const live = playableQuizzes(quizzes, false);
    const local = playableQuizzes(quizzes, true);
    expect(live.map((q) => q.id)).toEqual(["1", "2"]);
    expect(local.map((q) => q.id)).toEqual(["1", "2", "d4f5g6h7j8"]);

    expect(findQuiz("d4f5g6h7j8", live)).toBeUndefined();
    expect(handleGuess({ quizId: "d4f5g6h7j8", questionId: 1, guess: "草稿" }, SECRET, live).status).toBe(404);

    expect(findQuiz("d4f5g6h7j8", local)?.id).toBe("d4f5g6h7j8");
    expect(findQuiz("latest", local)?.id).toBe("2");
    const r = handleGuess({ quizId: "d4f5g6h7j8", questionId: 1, guess: "草稿" }, SECRET, local);
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
  const withQuestion = (i: number, change: Partial<Quiz["questions"][number]>, base: Quiz = sampleQuiz): Quiz => ({
    ...base,
    questions: base.questions.map((q, j) => (j === i ? { ...q, ...change } : q)),
  });
  // A quiz still being tested: random id, nothing frozen.
  const unlisted: Quiz = { ...sampleQuiz, id: "k3m9x2qv7t", listed: false };
  const draft: Quiz = { ...unlisted, published: false };

  it("allows new quizzes and any change to a quiz with a random id", () => {
    expect(checkUpdate(undefined, sampleQuiz)).toEqual([]);
    expect(checkUpdate(draft, { ...draft, questions: [sampleQuiz.questions[0]] })).toEqual([]);
    expect(checkUpdate(draft, { ...draft, published: true })).toEqual([]);
    // unlisted quizzes are live by link but still changeable, and can be pulled back
    expect(checkUpdate(unlisted, withQuestion(0, { answer: "加班" }, unlisted))).toEqual([]);
    expect(checkUpdate(unlisted, { ...unlisted, questions: [sampleQuiz.questions[0]] })).toEqual([]);
    expect(checkUpdate(unlisted, draft)).toEqual([]);
  });

  it("allows fixing a released quiz's pinyin or meaning", () => {
    expect(checkUpdate(sampleQuiz, withQuestion(0, { pinyin: "jiāyóu", meaning: "go go go" }))).toEqual([]);
  });

  it("refuses to unpublish or change a released quiz's puzzles", () => {
    expect(checkUpdate(sampleQuiz, { ...sampleQuiz, published: false }).join()).toMatch(/can't be unpublished/);
    expect(checkUpdate(sampleQuiz, { ...sampleQuiz, questions: [sampleQuiz.questions[0]] }).join()).toMatch(
      /can't add or remove puzzles/,
    );
    expect(checkUpdate(sampleQuiz, withQuestion(0, { answer: "加班" })).join()).toMatch(/can't change its answer/);
    expect(checkUpdate(sampleQuiz, withQuestion(1, { maxGuesses: 6 })).join()).toMatch(/can't change its maxGuesses/);
    expect(checkUpdate(sampleQuiz, withQuestion(1, { emoji: "🐍" })).join()).toMatch(/can't change its emoji/);
  });
});

describe("revisions", () => {
  const withQuestion = (change: Partial<Quiz["questions"][number]>, base: Quiz = sampleQuiz): Quiz => ({
    ...base,
    questions: base.questions.map((q, j) => (j === 0 ? { ...q, ...change } : q)),
  });
  const existing: Quiz = { ...sampleQuiz, id: "k3m9x2qv7t", listed: false, revision: 2 };

  it("knows which edits affect saved games", () => {
    expect(affectsPlay(existing, existing)).toBe(false);
    expect(affectsPlay(existing, withQuestion({ pinyin: "x", meaning: "y" }, existing))).toBe(false);
    for (const change of [{ answer: "加班" }, { emoji: "🐍" }, { maxGuesses: 9 }, { id: 99 }]) {
      expect(affectsPlay(existing, withQuestion(change, existing)), JSON.stringify(change)).toBe(true);
    }
    expect(affectsPlay(existing, { ...existing, questions: existing.questions.slice(1) })).toBe(true);
    expect(affectsPlay(existing, { ...existing, questions: [...existing.questions].reverse() })).toBe(true);
  });

  it("raises the revision by one for an edit that affects play", () => {
    expect(nextRevision(existing, withQuestion({ answer: "加班" }, existing))).toBe(3);
    expect(nextRevision(existing, withQuestion({ answer: "加班" }, existing))).toBe(3);
  });

  it("keeps it for a pinyin or meaning fix, and never lowers it", () => {
    expect(nextRevision(existing, withQuestion({ meaning: "fixed" }, existing))).toBe(2);
    // a stale local file with an older number can't push it back down
    expect(nextRevision(existing, { ...existing, revision: 1 })).toBe(2);
    expect(nextRevision(existing, { ...withQuestion({ answer: "加班" }, existing), revision: 1 })).toBe(3);
  });

  it("lets a higher number in the file raise it by hand", () => {
    expect(nextRevision(existing, { ...existing, revision: 5 })).toBe(5);
    expect(nextRevision(existing, { ...withQuestion({ answer: "加班" }, existing), revision: 5 })).toBe(5);
  });

  it("starts a new quiz at the file's number, or 1", () => {
    const { revision: _r, ...bare } = existing;
    expect(nextRevision(undefined, bare)).toBe(1);
    expect(nextRevision(undefined, { ...bare, revision: 4 })).toBe(4);
    expect(nextRevision(undefined, { ...bare, revision: 0 })).toBe(1);
  });
});

describe("aliases", () => {
  const released: Quiz = { ...sampleQuiz, id: "5" };
  const aliases = new Map([
    ["a1b2c3d4e5", "5"],
    ["z9y8x7w6v5", "5"],
    ["q2w3e4r5t6", "9"],
  ]);

  it("lets a released quiz be found by its old random id", () => {
    expect(findQuiz("5", [released], aliases)?.id).toBe("5");
    expect(findQuiz("a1b2c3d4e5", [released], aliases)?.id).toBe("5");
    expect(findQuiz("a1b2c3d4e5", [released])).toBeUndefined();
  });

  it("ignores an alias whose quiz isn't available, and never matches inherited object keys", () => {
    expect(findQuiz("q2w3e4r5t6", [released], aliases)).toBeUndefined();
    for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(findQuiz(key, [released], aliases), key).toBeUndefined();
    }
  });

  it("lists a quiz's old ids", () => {
    expect(previousIdsOf("5", aliases)).toEqual(["a1b2c3d4e5", "z9y8x7w6v5"]);
    expect(previousIdsOf("6", aliases)).toEqual([]);
  });

  it("never makes an alias the latest quiz", () => {
    expect(latestId([released])).toBe("5");
    expect(findQuiz("latest", [released], aliases)?.id).toBe("5");
  });

  it("accepts guesses and tokens under the old id, and answers with the real id", () => {
    const quizzes: Quiz[] = [released];
    const q = released.questions[0];
    const oldToken = signToken({ v: "a1b2c3d4e5", q: q.id, n: 1, done: false }, SECRET);
    const r = handleGuess({ quizId: "5", questionId: q.id, guess: "加油", token: oldToken }, SECRET, quizzes, aliases);
    expect(r.status).toBe(200);
    const body = r.body as GuessResponse;
    expect(body.guessesUsed).toBe(2);
    expect(verifyToken(body.token, SECRET)?.v).toBe("5");
    // the old id works as the quiz id too
    expect(handleGuess({ quizId: "a1b2c3d4e5", questionId: q.id, guess: "加油" }, SECRET, quizzes, aliases).status).toBe(200);
  });

  it("rejects a token for a different quiz, even with aliases", () => {
    const other = signToken({ v: "q2w3e4r5t6", q: 1, n: 1, done: false }, SECRET); // alias of 9, not 5
    const r = handleGuess({ quizId: "5", questionId: 1, guess: "加油", token: other }, SECRET, [released], aliases);
    expect(r.status).toBe(400);
    const without = handleGuess({ quizId: "5", questionId: 1, guess: "加油", token: other }, SECRET, [released]);
    expect(without.status).toBe(400);
    const wrongQuestion = signToken({ v: "a1b2c3d4e5", q: 2, n: 1, done: false }, SECRET);
    expect(handleGuess({ quizId: "5", questionId: 1, guess: "加油", token: wrongQuestion }, SECRET, [released], aliases).status).toBe(400);
  });

  it("validates alias documents", () => {
    expect(validateAlias({ id: "a1b2c3d4e5", movedTo: "5" })).toEqual([]);
    expect(validateAlias({ id: "5", movedTo: "6" }).join()).toMatch(/id must be a random/);
    expect(validateAlias({ id: "a1b2c3d4e5", movedTo: "x" }).join()).toMatch(/movedTo must be a quiz number/);
    expect(validateAlias({ id: "a1b2c3d4e5" }).join()).toMatch(/movedTo/);
  });
});

describe("numbers and ids", () => {
  it("gives the next number with no gaps", () => {
    expect(nextNumber([])).toBe("1");
    expect(nextNumber(["1", "2", "3"])).toBe("4");
    expect(nextNumber(["1", "2", "k3m9x2qv7t", "10"])).toBe("11");
    expect(nextNumber(["k3m9x2qv7t"])).toBe("1");
  });

  it("generates valid random ids that are never taken and never numbers", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = generateUnlistedId(taken, (max) => Math.floor(Math.random() * max));
      expect(validateQuiz({ ...sampleQuiz, id, listed: false })).toEqual([]);
      expect(taken.has(id)).toBe(false);
      expect(/^[1-9][0-9]*$/.test(id)).toBe(false);
      taken.add(id);
    }
  });

  it("skips ids that are taken or all digits", () => {
    // a source that yields all digits first (index 22..29 are 2..9), then letters, then a taken id
    const picks = [...Array(10).fill(25), ...Array(10).fill(0), ...Array(10).fill(0), ...Array(10).fill(1)];
    let i = 0;
    const id = generateUnlistedId(new Set(["aaaaaaaaaa"]), () => picks[i++]);
    expect(id).toBe("bbbbbbbbbb");
  });
});

describe("planPromotion", () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    published: true,
    listed: false,
    revision: 3,
    questions: sampleQuiz.questions,
    ...over,
  });
  const docs = (...extra: { id: string; data: Record<string, unknown> }[]) => [
    { id: "1", data: stored({ listed: true, revision: 1 }) },
    { id: "2", data: stored({ listed: true, revision: 1 }) },
    ...extra,
  ];

  it("moves a quiz to the next number, keeps its revision and leaves an alias", () => {
    const r = planPromotion(docs({ id: "k3m9x2qv7t", data: stored() }), "k3m9x2qv7t");
    expect(r).toMatchObject({ ok: true, to: "3", alias: { id: "k3m9x2qv7t", movedTo: "3" } });
    if (!r.ok) return;
    expect(r.quiz).toMatchObject({ id: "3", published: true, listed: true, revision: 3 });
    expect(validateQuiz(r.quiz)).toEqual([]);
  });

  it("can release a draft straight to a number", () => {
    const r = planPromotion(docs({ id: "k3m9x2qv7t", data: stored({ published: false }) }), "k3m9x2qv7t");
    expect(r).toMatchObject({ ok: true, to: "3" });
  });

  it("starts at 1 when nothing is released yet", () => {
    expect(planPromotion([{ id: "k3m9x2qv7t", data: stored() }], "k3m9x2qv7t")).toMatchObject({ ok: true, to: "1" });
  });

  it("refuses numbered quizzes, missing quizzes and ones already released", () => {
    expect(planPromotion(docs(), "2")).toMatchObject({ ok: false });
    expect(planPromotion(docs(), "k3m9x2qv7t")).toMatchObject({ ok: false, error: expect.stringMatching(/no quiz/) });
    const done = docs({ id: "k3m9x2qv7t", data: { movedTo: "2" } });
    expect(planPromotion(done, "k3m9x2qv7t")).toMatchObject({ ok: false, error: expect.stringMatching(/already released as quiz 2/) });
  });

  it("refuses when the released numbers have a gap or include an unpublished one", () => {
    const gap = [{ id: "1", data: stored({ listed: true }) }, { id: "3", data: stored({ listed: true }) }, { id: "k3m9x2qv7t", data: stored() }];
    expect(planPromotion(gap, "k3m9x2qv7t")).toMatchObject({ ok: false, error: expect.stringMatching(/gap/) });
    const draftNumber = docs({ id: "3", data: stored({ published: false }) }, { id: "k3m9x2qv7t", data: stored() });
    expect(planPromotion(draftNumber, "k3m9x2qv7t")).toMatchObject({ ok: false, error: expect.stringMatching(/quiz 3 has a number but isn't published/) });
  });

  it("refuses an invalid quiz", () => {
    const r = planPromotion(docs({ id: "k3m9x2qv7t", data: stored({ questions: [] }) }), "k3m9x2qv7t");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/has no puzzles/) });
  });
});

describe("toSimplified", () => {
  it("converts one character at a time, keeping the length", () => {
    expect(toSimplified("電腦遊戲")).toBe("电脑游戏");
    expect(toSimplified("加油")).toBe("加油");
    expect(Array.from(toSimplified("乾淨的麵條")).length).toBe(5);
  });
});
