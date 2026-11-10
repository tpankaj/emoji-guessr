import { describe, expect, it } from "vitest";
import { MAX_GUESS_LENGTH, MAX_ID_LENGTH, MAX_TOKEN_LENGTH, clip, guessShapeError } from "./request";

const valid = { quizId: "1", questionId: 1, guess: "测试" };

describe("guessShapeError", () => {
  it("accepts a well-formed guess, with or without a token", () => {
    expect(guessShapeError(valid)).toBeNull();
    expect(guessShapeError({ ...valid, token: "abc.def" })).toBeNull();
    expect(guessShapeError({ ...valid, token: null })).toBeNull();
    expect(guessShapeError({ ...valid, token: undefined })).toBeNull();
  });

  it("rejects bodies that are not objects", () => {
    for (const body of [undefined, null, "text", 5, true, [], [valid]]) {
      expect(guessShapeError(body)).toBe("Invalid request");
    }
  });

  it("rejects a missing, non-string, empty or oversized quizId", () => {
    expect(guessShapeError({ ...valid, quizId: undefined })).toBe("Unknown quiz");
    expect(guessShapeError({ ...valid, quizId: 1 })).toBe("Unknown quiz");
    expect(guessShapeError({ ...valid, quizId: "" })).toBe("Unknown quiz");
    expect(guessShapeError({ ...valid, quizId: "1".repeat(MAX_ID_LENGTH + 1) })).toBe("Unknown quiz");
    expect(guessShapeError({ ...valid, quizId: "1".repeat(MAX_ID_LENGTH) })).toBeNull();
  });

  it("requires questionId to be an integer", () => {
    for (const questionId of [undefined, "1", 1.5, NaN, Infinity, null, {}]) {
      expect(guessShapeError({ ...valid, questionId })).toBe("Unknown question");
    }
    expect(guessShapeError({ ...valid, questionId: 0 })).toBeNull();
  });

  it("requires guess to be a string within the length cap", () => {
    expect(guessShapeError({ quizId: "1", questionId: 1 })).toBe("Missing guess");
    expect(guessShapeError({ ...valid, guess: 5 })).toBe("Missing guess");
    expect(guessShapeError({ ...valid, guess: "测".repeat(MAX_GUESS_LENGTH + 1) })).toBe("Guess is too long");
    expect(guessShapeError({ ...valid, guess: "测".repeat(MAX_GUESS_LENGTH) })).toBeNull();
  });

  it("rejects a non-string or oversized token", () => {
    expect(guessShapeError({ ...valid, token: 5 })).toBe("Invalid progress token");
    expect(guessShapeError({ ...valid, token: {} })).toBe("Invalid progress token");
    expect(guessShapeError({ ...valid, token: "a".repeat(MAX_TOKEN_LENGTH + 1) })).toBe("Invalid progress token");
    expect(guessShapeError({ ...valid, token: "a".repeat(MAX_TOKEN_LENGTH) })).toBeNull();
  });

  it("reports the first problem when several are present", () => {
    expect(guessShapeError({ quizId: 1, questionId: "x", guess: 5, token: 5 })).toBe("Unknown quiz");
  });
});

describe("clip", () => {
  it("truncates strings to the limit, 40 by default", () => {
    expect(clip("a".repeat(100))).toBe("a".repeat(40));
    expect(clip("abcdef", 3)).toBe("abc");
    expect(clip("ab", 3)).toBe("ab");
  });

  it("passes numbers, booleans, null and undefined through", () => {
    expect(clip(7)).toBe(7);
    expect(clip(false)).toBe(false);
    expect(clip(null)).toBeNull();
    expect(clip(undefined)).toBeUndefined();
  });

  it("reduces objects and arrays to their type name so logged fields stay bounded", () => {
    expect(clip({ big: "x".repeat(1000) })).toBe("object");
    expect(clip(["x".repeat(1000)])).toBe("object");
  });
});
