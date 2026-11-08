# Emoji Guessr

A guessing game where each puzzle is a Chinese phrase written in emoji (➕⛽️ → 加油).
Players get a set number of guesses per puzzle, see 🟩🟨⬜ feedback per character, and share a spoiler-free result string at the end.

Quizzes are permanent: `/` plays the newest quiz, and `/q/<id>` (the link in every shared result) always plays that exact quiz. Older quizzes are reachable only through their links.

## How it's built

```
web/         Vite + Preact + TypeScript static site (Firebase Hosting)
functions/   One Cloud Function, `api`, that reads quizzes from Firestore and checks guesses
scripts/     quiz.mjs: upload/download/list quizzes · check-leaks.mjs: answer leak check
quizzes/     your local quiz files (git-ignored — answers never go in the repo)
```

- **Quizzes live in Firestore**, one document per quiz in the `quizzes` collection (document id = quiz id). Firestore's rules (`firestore.rules`) block all browser access; only the function reads them, with admin access.
- **Answers never reach the browser.** The site gets each puzzle's emoji, answer length and guess limit from `GET /api/quiz/<id>` (or `/api/quiz/latest`). Guesses go to `POST /api/guess`, which returns the colors, and returns the answer only once the puzzle is solved or out of guesses.
- **Caching:** the function keeps quizzes in memory and reloads them at most every 5 minutes, so a newly published quiz can take up to 5 minutes to appear. A quiz that fails validation is left out and logged as `invalid_quiz`.
- **Progress needs no database.** The server signs a small token holding the guess count (HMAC with `TOKEN_SECRET`). The browser stores it with progress in `localStorage`, separately for each quiz. A forged token, or one from a different quiz or puzzle, is rejected.
- Firebase Hosting rewrites `/api/**` to the function, so everything runs on one domain.

## Managing quizzes

Quizzes are JSON files you keep in `quizzes/` (git-ignored) and upload with `npm run quiz`. The database is the source of truth; the files are your working copies.

```json
{
  "id": "2",
  "published": false,
  "questions": [
    { "id": 1, "emoji": "👉🐟", "answer": "摸鱼", "pinyin": "mō yú", "meaning": "“Touch fish” — slacking off at work", "maxGuesses": 2 }
  ]
}
```

Every puzzle needs a unique `id`, an `answer` in Chinese characters only, `pinyin`, `meaning` and `maxGuesses` (no default). Quiz ids are numbers (`"1"`, `"2"`, …); `/` plays the highest-numbered **published** quiz.

```bash
npm run quiz -- list                        # what's in the database
npm run quiz -- upload quizzes/2.json       # check and upload (asks before writing to live)
npm run quiz -- download all                # save every quiz to quizzes/<id>.json
npm run quiz -- delete 2                    # delete a draft
```

Add `--emulator` to any of these to work on the local emulator instead of the live project.

**Publishing a new quiz:**

1. Write `quizzes/<next id>.json` with `"published": false`.
2. Test it locally: `npm run emulators`, then `npm run quiz -- upload quizzes/2.json --emulator`, and play it at `http://localhost:5050/q/2`. Drafts are playable locally but never on the live site.
3. Upload the draft to live (`npm run quiz -- upload quizzes/2.json`) if you like — it stays invisible there.
4. When it's ready, set `"published": true` and upload again. No deploy needed; it appears within 5 minutes.

**The script enforces the rules:** a published quiz can't be unpublished or deleted, and its puzzles (count, order, ids, emoji, answers, guess limits) can't change — shared `/q/<id>` links and players' saved progress depend on them. Fixing a pinyin or meaning is allowed. Drafts can change freely or be deleted.

**Signing in for live uploads** (one time). The script uses your Google account through Google's standard sign-in:

```bash
brew install --cask google-cloud-sdk
gcloud auth application-default login
```

Use the Google account that owns the Firebase project.

## Local development

```bash
npm run install:all     # first time only
npm test                # game, validation, publish-rule and store tests
npm run emulators       # builds everything, serves at http://localhost:5050 (always the offline
                        # demo project, so local testing never touches the live one)
```

The emulators include a local Firestore, which needs Java (`brew install openjdk`; the script finds Homebrew's copy automatically). The local database starts empty; load your quizzes into it with:

```bash
npm run quiz -- upload quizzes/*.json --emulator
```

It's saved to `.emulator-data/` (git-ignored) when the emulators stop, and loaded again next time.

The emulator also needs `functions/.secret.local` containing `TOKEN_SECRET=<random string>`. It's gitignored; create one with:

```bash
echo "TOKEN_SECRET=$(openssl rand -hex 32)" > functions/.secret.local
```

For hot reload on the frontend, run `npm run emulators` in one terminal and `npm run dev` in another (Vite at :5173 proxies `/api` to the functions emulator).

Add `?reset` to the URL to clear your saved progress. This only works on `localhost` / `127.0.0.1`; on the live site, use a private window instead.

The leak check (`npm run check:leaks`, part of `npm run deploy`) looks for your quizzes' answers in the built site, using the files in `quizzes/`. With no files there it's skipped; `npm run quiz -- download all` refreshes them.

## Deploying (first time)

1. Create a Firebase project at <https://console.firebase.google.com> and upgrade it to the **Blaze** plan (required for Cloud Functions; this traffic level stays inside the free allowance). Set a budget alert in Google Cloud Billing.
2. `firebase login`
3. `firebase use --add` → pick the project (replaces the `demo-emoji-guessr` placeholder in `.firebaserc`).
4. Create the Firestore database (one time; the location can't be changed later):
   ```bash
   firebase firestore:databases:create "(default)" --location=nam5
   ```
5. Set the production token secret:
   ```bash
   openssl rand -hex 32 | firebase functions:secrets:set TOKEN_SECRET --data-file=-
   ```
6. `npm run deploy` (runs tests, builds, checks for answer leaks, deploys hosting, the function and the Firestore rules).
7. Upload your quizzes: `npm run quiz -- upload quizzes/*.json` (see "Signing in for live uploads" above).

The site will be at `https://<project-id>.web.app`.

## Visitor analytics (Cloudflare)

The site can report cookie-free visitor counts to Cloudflare Web Analytics (free; no consent banner needed). It's off until you add a token:

1. Sign up at <https://dash.cloudflare.com> → **Analytics & Logs** → **Web Analytics** → **Add a site**, and enter your domain.
2. Choose the **JavaScript snippet** option (the automatic option only works if Cloudflare runs your DNS), and copy the `token` value from the snippet.
3. Paste it into `CLOUDFLARE_ANALYTICS_TOKEN` in `web/src/analytics.ts`, commit, and `npm run deploy`.

It never loads on `localhost`, so local testing isn't counted. Visits are recorded per quiz (`/q/1`, `/q/2`, …).

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
| Broken quiz data | `jsonPayload.event="invalid_quiz"` |

Guess events include the guessed text (handy for spotting common wrong answers) but never tokens or anything that identifies a player. Logs are kept for 30 days by default, and this volume stays inside Cloud Logging's free allowance.
