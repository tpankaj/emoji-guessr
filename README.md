# Emoji 中文

A Wordle-style guessing game: each puzzle is a Chinese phrase written in emoji (➕⛽️ → 加油).
Players get 5 guesses per puzzle, see 🟩🟨⬜ feedback per character, and share a spoiler-free result string at the end.

## How it's built

```
web/         Vite + Preact + TypeScript static site (Firebase Hosting)
functions/   One Cloud Function, `api`, that holds the answers and checks guesses
scripts/     check-leaks.mjs: fails the deploy if an answer ends up in the built site
```

- **Answers never reach the browser.** `functions/src/quiz.ts` is the only place they live. The site gets the emoji and answer length from `GET /api/quiz`. Guesses go to `POST /api/guess`, which returns the colours, and returns the answer only once the puzzle is solved or out of guesses.
- **No database.** The server signs a small token holding the guess count (HMAC with `TOKEN_SECRET`). The browser stores it with progress in `localStorage`. A forged or swapped token is rejected.
- Firebase Hosting rewrites `/api/**` to the function, so everything runs on one domain.

## Adding puzzles

Edit `functions/src/quiz.ts` and append to `questions` with a new unique `id`. Answers must be Chinese characters only. If you change puzzles after people have started playing, bump the quiz `id` (e.g. `"v2"`) so old saved progress resets.

## Local development

```bash
npm run install:all     # first time only
npm test                # scoring + token tests
npm run emulators       # builds everything, serves at http://localhost:5050
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
3. `firebase use --add` → pick the project (replaces the `demo-emoji-guesser` placeholder in `.firebaserc`).
4. Set the production token secret:
   ```bash
   openssl rand -hex 32 | firebase functions:secrets:set TOKEN_SECRET --data-file=-
   ```
5. `npm run deploy` (runs tests, builds, checks for answer leaks, deploys hosting + function).

The site will be at `https://<project-id>.web.app`.
