import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { findQuiz, handleGuess, publicQuiz, validateQuizzes } from "./game";
import { QUIZZES } from "./quizzes";

// Set in production with: firebase functions:secrets:set TOKEN_SECRET
// Locally the emulator reads it from functions/.secret.local
const TOKEN_SECRET = defineSecret("TOKEN_SECRET");

// Refuse to start with broken quiz data (the tests check this too, before deploy).
const problems = validateQuizzes(QUIZZES);
if (problems.length) throw new Error(`Invalid quiz data:\n${problems.join("\n")}`);

export const api = onRequest(
  { secrets: [TOKEN_SECRET], region: "us-central1", maxInstances: 5, memory: "256MiB" },
  (req, res) => {
    // Hosting forwards /api/... with the prefix intact; tolerate both forms.
    const path = req.path.replace(/^\/api(?=\/|$)/, "") || "/";
    // Never cached: a stale puzzle list paired with a freshly deployed server
    // would show the wrong lengths or guess limits.
    res.set("Cache-Control", "no-store");

    // GET /quiz/<id> or /quiz/latest
    const quizMatch = /^\/quiz\/([^/]+)$/.exec(path);
    if (req.method === "GET" && quizMatch) {
      const quiz = findQuiz(decodeURIComponent(quizMatch[1]));
      if (!quiz) {
        res.status(404).json({ error: "Quiz not found" });
        return;
      }
      res.json(publicQuiz(quiz));
      return;
    }

    if (req.method === "POST" && path === "/guess") {
      const result = handleGuess(req.body, TOKEN_SECRET.value());
      res.status(result.status).json(result.body);
      return;
    }

    res.status(404).json({ error: "Not found" });
  },
);
