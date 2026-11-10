import { beforeEach, describe, expect, it, vi } from "vitest";

// index.ts builds the store and secret on import, so those are replaced with fakes.
// `all` stands in for the Firestore load: tests assert whether a request reaches it.
const { all, info, warn, error } = vi.hoisted(() => ({ all: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock("firebase-functions/v2/https", () => ({ onRequest: (_opts: unknown, handler: unknown) => handler }));
vi.mock("firebase-functions/params", () => ({ defineSecret: () => ({ value: () => "test-secret" }) }));
vi.mock("firebase-functions/logger", () => ({ info, warn, error }));
vi.mock("./store", () => ({
  QuizStore: class {
    all = all;
  },
  firestoreFetcher: () => async () => [],
}));

import { api } from "./index";

type Handler = (req: unknown, res: unknown) => Promise<void>;
const handler = api as unknown as Handler;

const quizzes = [
  {
    id: "1",
    published: true,
    questions: [{ id: 1, emoji: "🧪", answer: "测试", pinyin: "cè shì", meaning: "test", maxGuesses: 2 }],
  },
];

async function call(method: string, path: string, body?: unknown) {
  const out: { status: number; body: any; headers: Record<string, string> } = { status: 200, body: undefined, headers: {} };
  const res = {
    set: (k: string, v: string) => ((out.headers[k] = v), res),
    status: (s: number) => ((out.status = s), res),
    json: (b: unknown) => ((out.body = b), res),
  };
  await handler({ method, path, body }, res);
  return out;
}

const guess = (over: Record<string, unknown> = {}) => ({ quizId: "1", questionId: 1, guess: "测试", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  all.mockResolvedValue(quizzes);
});

describe("requests rejected before quizzes load", () => {
  it("answers unknown routes and methods with 404", async () => {
    for (const [method, path] of [
      ["GET", "/nope"],
      ["GET", "/"],
      ["DELETE", "/guess"],
      ["GET", "/guess"],
      ["POST", "/quizzes"],
      ["POST", "/quiz/1"],
      ["GET", "/quiz/1/extra"],
      ["GET", "/quiz/"],
    ]) {
      const r = await call(method, path);
      expect(r.status, `${method} ${path}`).toBe(404);
      expect(r.body).toEqual({ error: "Not found" });
    }
    expect(all).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("not_found", expect.objectContaining({ event: "not_found" }));
  });

  it("answers an over-long, empty or badly encoded quiz id with 404", async () => {
    for (const path of ["/quiz/" + "1".repeat(65), "/quiz/%E0%A4%A", "/quiz/%"]) {
      const r = await call("GET", path);
      expect(r.status, path).toBe(404);
      expect(r.body).toEqual({ error: "Quiz not found" });
    }
    expect(all).not.toHaveBeenCalled();
  });

  it("answers a malformed guess with 400 and logs it", async () => {
    const bad: [unknown, string][] = [
      [undefined, "Invalid request"],
      [[1], "Invalid request"],
      [guess({ quizId: 1 }), "Unknown quiz"],
      [guess({ quizId: "" }), "Unknown quiz"],
      [guess({ questionId: "1" }), "Unknown question"],
      [{ quizId: "1", questionId: 1 }, "Missing guess"],
      [guess({ guess: "测".repeat(65) }), "Guess is too long"],
      [guess({ token: 5 }), "Invalid progress token"],
      [guess({ token: "a".repeat(513) }), "Invalid progress token"],
    ];
    for (const [body, message] of bad) {
      const r = await call("POST", "/guess", body);
      expect(r.status, message).toBe(400);
      expect(r.body).toEqual({ error: message });
    }
    expect(all).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(bad.length);
  });

  it("keeps rejected-guess log fields bounded and free of tokens and guesses", async () => {
    await call("POST", "/guess", { quizId: { huge: "x".repeat(5000) }, questionId: ["y".repeat(5000)], guess: "z", token: "SECRET" });
    const [, fields] = warn.mock.calls[0];
    expect(fields.quizId).toBe("object");
    expect(fields.questionId).toBe("object");
    expect(JSON.stringify(fields)).not.toContain("SECRET");
    expect(JSON.stringify(fields)).not.toContain("zzz");
    expect(Object.keys(fields)).not.toContain("token");
    expect(Object.keys(fields)).not.toContain("guess");
  });

  it("clips a long logged path and method", async () => {
    await call("GET", "/" + "p".repeat(500));
    const [, fields] = info.mock.calls[0];
    expect(fields.path.length).toBe(100);
  });
});

describe("requests that do load quizzes", () => {
  it("strips the /api prefix and serves the list and quiz loads", async () => {
    expect((await call("GET", "/api/quizzes")).status).toBe(200);
    const r = await call("GET", "/api/quiz/1");
    expect(r.status).toBe(200);
    expect(r.body.id).toBe("1");
    expect(r.body.questions[0]).not.toHaveProperty("answer");
    expect((await call("GET", "/quiz/latest")).body.id).toBe("1");
    expect(all).toHaveBeenCalledTimes(3);
  });

  it("answers an unknown but well-formed quiz id with 404", async () => {
    const r = await call("GET", "/quiz/99");
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Quiz not found" });
  });

  it("sets Cache-Control: no-store on every response", async () => {
    for (const [m, p] of [["GET", "/nope"], ["GET", "/quizzes"], ["POST", "/guess"]]) {
      expect((await call(m, p, m === "POST" ? guess() : undefined)).headers["Cache-Control"]).toBe("no-store");
    }
  });

  it("plays a guess end to end, chaining the token", async () => {
    const first = await call("POST", "/guess", guess({ guess: "你好" }));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ solved: false, done: false, guessesUsed: 1 });
    expect(first.body).not.toHaveProperty("reveal");

    const second = await call("POST", "/guess", guess({ token: first.body.token }));
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ solved: true, done: true, guessesUsed: 2 });
    expect(second.body.reveal.answer).toBe("测试");

    const third = await call("POST", "/guess", guess({ token: second.body.token }));
    expect(third.status).toBe(409);
  });

  it("logs a successful guess without the token and with a clipped guess", async () => {
    await call("POST", "/guess", guess());
    const [, fields] = info.mock.calls.find(([name]) => name === "guess")!;
    expect(fields).toMatchObject({ event: "guess", quizId: "1", questionId: 1, solved: true });
    expect(Object.keys(fields)).not.toContain("token");
  });

  it("still rejects well-formed guesses that fail game rules", async () => {
    expect((await call("POST", "/guess", guess({ quizId: "99" }))).status).toBe(404);
    expect((await call("POST", "/guess", guess({ questionId: 99 }))).status).toBe(404);
    expect((await call("POST", "/guess", guess({ quizId: "latest" }))).status).toBe(404);
    expect((await call("POST", "/guess", guess({ guess: "abcd" }))).status).toBe(400);
    expect((await call("POST", "/guess", guess({ guess: "测" }))).status).toBe(400);
    expect((await call("POST", "/guess", guess({ token: "not.a.token" }))).status).toBe(400);
  });

  it("returns 500 when loading quizzes fails", async () => {
    all.mockRejectedValue(new Error("firestore down"));
    const r = await call("GET", "/quizzes");
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: "Something went wrong" });
    expect(error).toHaveBeenCalled();
    // Malformed requests still get their precise answers while Firestore is down.
    expect((await call("GET", "/nope")).status).toBe(404);
    expect((await call("POST", "/guess", [1])).status).toBe(400);
  });
});
