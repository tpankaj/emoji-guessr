import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {
  findQuiz,
  handleGuess,
  latestId,
  playableQuizzes,
  previousIdsOf,
  publicQuiz,
  quizIndex,
  type GuessResponse,
} from "./game";
import { MAX_ID_LENGTH, clip, guessShapeError } from "./request";
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

export const api = onRequest(
  { secrets: [TOKEN_SECRET], region: "us-central1", maxInstances: 5, memory: "256MiB" },
  async (req, res) => {
    // Hosting forwards /api/... with the prefix intact; tolerate both forms.
    const path = req.path.replace(/^\/api(?=\/|$)/, "") || "/";
    // Never cached: a stale puzzle list paired with a freshly deployed server
    // would show the wrong lengths or guess limits.
    res.set("Cache-Control", "no-store");

    try {
      // Cheap checks first: route, method and input shape are settled before any quiz is loaded,
      // so malformed or unknown requests never touch Firestore.
      const quizMatch = /^\/quiz\/([^/]+)$/.exec(path);
      const isQuizLoad = req.method === "GET" && quizMatch !== null;
      const isList = req.method === "GET" && path === "/quizzes";
      const isGuess = req.method === "POST" && path === "/guess";

      if (!isQuizLoad && !isList && !isGuess) {
        logger.info("not_found", { event: "not_found", method: clip(req.method, 10), path: clip(path, 100) });
        res.status(404).json({ error: "Not found" });
        return;
      }

      let requested = "";
      if (isQuizLoad) {
        // Express normally rejects invalid percent-encoding with its own 400 before this
        // handler runs; this guard only matters if that ever stops being true.
        try {
          requested = decodeURIComponent(quizMatch[1]);
        } catch {
          requested = "";
        }
        if (!requested || requested.length > MAX_ID_LENGTH) {
          res.status(404).json({ error: "Quiz not found" });
          return;
        }
      }

      if (isGuess) {
        const problem = guessShapeError(req.body);
        if (problem) {
          const b = (req.body ?? {}) as Record<string, unknown>;
          logger.warn("guess_rejected", {
            event: "guess_rejected",
            status: 400,
            reason: problem,
            quizId: clip(b.quizId),
            questionId: clip(b.questionId),
          });
          res.status(400).json({ error: problem });
          return;
        }
      }

      // Drafts (published: false) are playable only in the local emulator, never live.
      // Aliases let a quiz released under a number still answer to its old random id.
      const snapshot = await store.snapshot();
      const quizzes = playableQuizzes(snapshot.quizzes, IS_EMULATOR);
      const { aliases } = snapshot;

      // GET /quiz/<id> or /quiz/latest
      if (isQuizLoad) {
        const quiz = findQuiz(requested, quizzes, aliases);
        logger.info("quiz_load", { event: "quiz_load", requested: clip(requested), quizId: quiz?.id ?? null });
        if (!quiz) {
          res.status(404).json({ error: "Quiz not found" });
          return;
        }
        res.json(publicQuiz(quiz, latestId(quizzes), previousIdsOf(quiz.id, aliases)));
        return;
      }

      // GET /quizzes: the archive list (ids and puzzle counts only)
      if (isList) {
        logger.info("quiz_list", { event: "quiz_list" });
        res.json(quizIndex(quizzes, IS_EMULATOR));
        return;
      }

      const { quizId, questionId, guess } = req.body as Record<string, unknown>;
      const result = handleGuess(req.body, TOKEN_SECRET.value(), quizzes, aliases);
      if (result.status === 200) {
        const r = result.body as GuessResponse;
        logger.info("guess", {
          event: "guess",
          quizId: clip(quizId),
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
    } catch (err) {
      logger.error("error", { event: "error", method: req.method, path: clip(path, 100), err });
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);
