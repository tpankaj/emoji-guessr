import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { handleGuess, publicQuiz } from "./game";

// Set in production with: firebase functions:secrets:set TOKEN_SECRET
// Locally the emulator reads it from functions/.secret.local
const TOKEN_SECRET = defineSecret("TOKEN_SECRET");

export const api = onRequest(
  { secrets: [TOKEN_SECRET], region: "us-central1", maxInstances: 5, memory: "256MiB" },
  (req, res) => {
    // Hosting forwards /api/... with the prefix intact; tolerate both forms.
    const path = req.path.replace(/^\/api(?=\/|$)/, "") || "/";
    res.set("Cache-Control", "no-store");

    if (req.method === "GET" && path === "/quiz") {
      res.set("Cache-Control", "public, max-age=60");
      res.json(publicQuiz());
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
