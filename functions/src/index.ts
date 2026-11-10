import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {
  findQuiz,
  handleGuess,
  latestId,
  playableQuizzes,
  publicQuiz,
  quizIndex,
  type GuessResponse,
} from "./game";
import { QuizStore, firestoreFetcher } from "./store";

// Set in production with: firebase functions:secrets:set TOKEN_SECRET
// Locally the emulator reads it from functions/.secret.local
const TOKEN_SECRET = defineSecret("TOKEN_SECRET");

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

// Quizzes live in Firestore. Live: reloaded at most every 5 minutes (so a newly published
// quiz can take up to 5 minutes to appear). Emulator: reloaded on every request, so uploads
// show up immediately. A quiz that fails validation is logged and left out.
const store = new QuizStore(firestoreFetcher(), {
  ttlMs: IS_EMULATOR ? 0 : 5 * 60_000,
  onInvalid: (id, errors) => logger.error("invalid_quiz", { event: "invalid_quiz", quizId: id, errors }),
});

/**
 * Structured log lines: each lands in Cloud Logging with `jsonPayload.event` set,
 * so they can be filtered and counted (see README → "Logs and stats").
 * Never log tokens or anything identifying a player.
 */
const clip = (v: unknown, max = 40) => (typeof v === "string" ? v.slice(0, max) : v);

export const api = onRequest(
  { secrets: [TOKEN_SECRET], region: "us-central1", maxInstances: 5, memory: "256MiB" },
  async (req, res) => {
    // Hosting forwards /api/... with the prefix intact; tolerate both forms.
    const path = req.path.replace(/^\/api(?=\/|$)/, "") || "/";
    // Never cached: a stale puzzle list paired with a freshly deployed server
    // would show the wrong lengths or guess limits.
    res.set("Cache-Control", "no-store");

    try {
      // Drafts (published: false) are playable only in the local emulator, never live.
      const quizzes = playableQuizzes(await store.all(), IS_EMULATOR);

      // GET /quiz/<id> or /quiz/latest
      const quizMatch = /^\/quiz\/([^/]+)$/.exec(path);
      if (req.method === "GET" && quizMatch) {
        const requested = decodeURIComponent(quizMatch[1]);
        const quiz = findQuiz(requested, quizzes);
        logger.info("quiz_load", { event: "quiz_load", requested: clip(requested), quizId: quiz?.id ?? null });
        if (!quiz) {
          res.status(404).json({ error: "Quiz not found" });
          return;
        }
        res.json(publicQuiz(quiz, latestId(quizzes)));
        return;
      }

      // GET /quizzes: the archive list (ids and puzzle counts only)
      if (req.method === "GET" && path === "/quizzes") {
        logger.info("quiz_list", { event: "quiz_list" });
        res.json(quizIndex(quizzes));
        return;
      }

      if (req.method === "POST" && path === "/guess") {
        const { quizId, questionId, guess } = (req.body ?? {}) as Record<string, unknown>;
        const result = handleGuess(req.body, TOKEN_SECRET.value(), quizzes);
        if (result.status === 200) {
          const r = result.body as GuessResponse;
          logger.info("guess", {
            event: "guess",
            quizId,
            questionId,
            guess: clip(guess),
            guessNumber: r.guessesUsed,
            solved: r.solved,
            done: r.done,
          });
        } else {
          logger.warn("guess_rejected", {
            event: "guess_rejected",
            status: result.status,
            reason: (result.body as { error: string }).error,
            quizId: clip(quizId),
            questionId: clip(questionId),
          });
        }
        res.status(result.status).json(result.body);
        return;
      }

      logger.info("not_found", { event: "not_found", method: req.method, path: clip(path, 100) });
      res.status(404).json({ error: "Not found" });
    } catch (err) {
      logger.error("error", { event: "error", method: req.method, path: clip(path, 100), err });
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);
