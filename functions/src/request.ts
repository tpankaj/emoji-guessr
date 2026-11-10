/**
 * Structured log lines: each lands in Cloud Logging with `jsonPayload.event` set,
 * so they can be filtered and counted (see README → "Logs and stats").
 * Never log tokens or anything identifying a player.
 */
export const clip = (v: unknown, max = 40) => {
  if (typeof v === "string") return v.slice(0, max);
  return typeof v === "number" || typeof v === "boolean" || v == null ? v : typeof v;
};

// Input caps. Real values are far smaller: ids are short numbers, guesses are a few
// characters, tokens are ~100 characters.
export const MAX_ID_LENGTH = 64;
export const MAX_GUESS_LENGTH = 64;
export const MAX_TOKEN_LENGTH = 512;

/** Shape check for POST /guess, run before quizzes load. Returns an error message, or null if fine. */
export function guessShapeError(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "Invalid request";
  const { quizId, questionId, guess, token } = body as Record<string, unknown>;
  if (typeof quizId !== "string" || quizId.length === 0 || quizId.length > MAX_ID_LENGTH) return "Unknown quiz";
  if (!Number.isInteger(questionId)) return "Unknown question";
  if (typeof guess !== "string") return "Missing guess";
  if (guess.length > MAX_GUESS_LENGTH) return "Guess is too long";
  if (token !== undefined && token !== null && (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH)) {
    return "Invalid progress token";
  }
  return null;
}
