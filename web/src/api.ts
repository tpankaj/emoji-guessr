import type { GuessResponse, PublicQuiz, QuizIndex } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    throw new ApiError("Network error — check your connection", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

/** Loads a quiz by id, or the newest one with "latest". */
export const getQuiz = (id: string) => request<PublicQuiz>(`/quiz/${encodeURIComponent(id)}`);

/** Lists every quiz (ids and puzzle counts) for the archive page. */
export const getQuizIndex = () => request<QuizIndex>("/quizzes");

export const postGuess = (quizId: string, questionId: number, guess: string, token?: string) =>
  request<GuessResponse>("/guess", {
    method: "POST",
    body: JSON.stringify({ quizId, questionId, guess, token }),
  });
