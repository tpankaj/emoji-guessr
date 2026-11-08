# Emoji Guessr

A guessing game where each puzzle is a Chinese phrase written in emoji (➕⛽️ → 加油).
Players get a set number of guesses per puzzle, see 🟩🟨⬜ feedback per character, and share a spoiler-free result string at the end.

Quizzes are permanent: `/` plays the newest quiz, and `/q/<id>` (the link in every shared result) always plays that exact quiz. Older quizzes are reachable only through their links.

## How it's built

```
web/         Vite + Preact + TypeScript static site (Firebase Hosting)
functions/   One Cloud Function, `api`, that holds the answers and checks guesses
scripts/     check-leaks.mjs: fails the deploy if an answer ends up in the built site
```

- **Answers never reach the browser.** `functions/src/quizzes/` is the only place they live. The site gets each puzzle's emoji, answer length and guess limit from `GET /api/quiz/<id>` (or `/api/quiz/latest`). Guesses go to `POST /api/guess`, which returns the colors, and returns the answer only once the puzzle is solved or out of guesses.
- **No database.** The server signs a small token holding the guess count (HMAC with `TOKEN_SECRET`). The browser stores it with progress in `localStorage`, separately for each quiz. A forged token, or one from a different quiz or puzzle, is rejected.
- Firebase Hosting rewrites `/api/**` to the function, so everything runs on one domain.

## Publishing a new quiz

1. Copy `functions/src/quizzes/1.ts` to the next number (e.g. `2.ts`) and set `id: "2"`.
2. Fill in its puzzles. Each needs a unique `id`, an `answer` in Chinese characters only, `pinyin`, `meaning`, and a `maxGuesses` (there is no default).
3. Import it in `functions/src/quizzes/index.ts` and add it to the **end** of `QUIZZES`. The last entry is what `/` plays.

**Never remove a published quiz or change its answers or puzzles** — shared `/q/<id>` links must keep working, and players' saved progress refers to them. Fixing a typo in a pinyin or meaning is fine. `npm test` checks the quiz data (unique ids, Chinese-only answers, guess limits) and runs before every deploy.

## Local development

```bash
npm run install:all     # first time only
npm test                # scoring + token tests
npm run emulators       # builds everything, serves at http://localhost:5050 (always the offline
                        # demo project, so local testing never touches the live one)
```

The emulator needs `functions/.secret.local` containing `TOKEN_SECRET=<random string>`. It's gitignored; create one with:

```bash
echo "TOKEN_SECRET=$(openssl rand -hex 32)" > functions/.secret.local
```

For hot reload on the frontend, run `npm run emulators` in one terminal and `npm run dev` in another (Vite at :5173 proxies `/api` to the functions emulator).

Add `?reset` to the URL to clear your saved progress. This only works on `localhost` / `127.0.0.1`; on the live site, use a private window instead.

## Deploying (first time)

1. Create a Firebase project at <https://console.firebase.google.com> and upgrade it to the **Blaze** plan (required for Cloud Functions; this traffic level stays inside the free allowance). Set a budget alert in Google Cloud Billing.
2. `firebase login`
3. `firebase use --add` → pick the project (replaces the `demo-emoji-guessr` placeholder in `.firebaserc`).
4. Set the production token secret:
   ```bash
   openssl rand -hex 32 | firebase functions:secrets:set TOKEN_SECRET --data-file=-
   ```
5. `npm run deploy` (runs tests, builds, checks for answer leaks, deploys hosting + function).

The site will be at `https://<project-id>.web.app`.

## Logs and stats

The function writes one structured log line per request. View them in the Firebase console → **Functions** → **Logs**, or for filtering and counting, in [Google Cloud Logs Explorer](https://console.cloud.google.com/logs/query) with these queries:

| What | Query |
|---|---|
| All game events | `resource.labels.service_name="api" AND jsonPayload.event:*` |
| Quizzes opened | `jsonPayload.event="quiz_load"` |
| Every guess | `jsonPayload.event="guess"` |
| Puzzles solved | `jsonPayload.event="guess" AND jsonPayload.solved=true` |
| Puzzles failed | `jsonPayload.event="guess" AND jsonPayload.done=true AND jsonPayload.solved=false` |
| One puzzle | `jsonPayload.event="guess" AND jsonPayload.quizId="1" AND jsonPayload.questionId=3` |
| Possible tampering | `jsonPayload.event="guess_rejected" AND jsonPayload.reason="Invalid progress token"` |
| Server errors | `jsonPayload.event="error"` |

Guess events include the guessed text (handy for spotting common wrong answers) but never tokens or anything that identifies a player. Logs are kept for 30 days by default, and this volume stays inside Cloud Logging's free allowance.
