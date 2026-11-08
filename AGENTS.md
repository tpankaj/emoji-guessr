# Emoji Guessr — project notes

The full reference for working on this repo. The README is the short human intro; keep it short and put detail here.

Live at <https://emojiguessr.io> (also `https://emoji-guessr-e99da.web.app`). Firebase project `emoji-guessr-e99da`. Public repo: <https://github.com/tpankaj/emoji-guessr> (MIT).

## Working conventions (from the owner)

- **American spelling** everywhere: code, UI text, docs and commit messages ("color", "gray").
- **Commit only when asked**, and **split unrelated changes into separate commits** — never one big dump. If a file mixes changes, stage partial versions.
- **Deploy only when asked.** `npm run deploy -- --force` (non-interactive) is how deploys have been run.
- **Commit messages and code must never contain a draft puzzle** (answer, pinyin, meaning or emoji clue) — the repo is public. The commit hooks check this; don't bypass them.
- **Commit messages must not mention copyright, IP, or other games.**
- **Never put real puzzle answers in tests.** Use obvious fixtures (the tests use 测试题目 / 🧪📝).
- Don't name other word games anywhere in the project, and keep the game's look its own.

## Layout

```
web/                 Vite + Preact + TypeScript site (Firebase Hosting, served from web/dist)
functions/           Cloud Function `api` (Node 22, us-central1): quiz loading, scoring, tokens, logs
  src/game.ts        scoring, validation (validateQuiz), publish rules (checkUpdate), guess handling
  src/store.ts       QuizStore: loads + validates + caches quizzes from Firestore
  src/token.ts       HMAC-signed progress tokens
  src/types.ts       Quiz / Question types (server only — never import from web/)
scripts/
  quiz.mjs           npm run quiz: list / upload / download / delete quizzes
  quiz-secrets.mjs   shared by both leak checks: loads quizzes/, ALLOWED_PHRASES
  check-leaks.mjs    website leak check (runs in npm run deploy)
  check-commit-leaks.mjs  git commit leak check (run by .githooks/)
.githooks/           pre-commit + commit-msg hooks (enable with npm run setup:hooks)
firestore.rules      deny-all for clients; only the function (admin) reads quizzes
quizzes/             git-ignored local quiz files (working copies; Firestore is the source of truth)
.emulator-data/      git-ignored local Firestore data, saved when the emulators stop
```

## Architecture and invariants

- **Answers never reach the browser before a puzzle ends.** `GET /api/quiz/<id|latest>` returns only `{id, questions: [{id, emoji, length, maxGuesses}]}`. `POST /api/guess {quizId, questionId, guess, token}` returns `{marks, solved, done, guessesUsed, token, reveal?}`; `reveal` (answer, pinyin, meaning) only when solved or out of guesses. There is no hint.
- **Progress needs no database.** The token is `base64url(JSON {v: quizId, q: questionId, n: guessesUsed, done}).HMAC-SHA256` with secret `TOKEN_SECRET`. Tokens are bound to quiz + question. Replaying an older token can grant extra guesses but never the answer; this is accepted (honor system, like clearing localStorage).
- **Quizzes live in Firestore**, collection `quizzes`, document id = quiz id (`"1"`, `"2"`, …), fields `published` (bool) and `questions` (array). Every puzzle requires `id`, `emoji`, `answer` (Chinese characters only), `pinyin`, `meaning`, `maxGuesses` — no defaults.
- **Caching:** `QuizStore` reloads at most every 5 minutes live (every request in the emulator), shares concurrent loads, drops invalid quizzes (logged as `invalid_quiz`) and falls back to the last good set if a reload fails. A newly published quiz can take up to 5 minutes to appear.
- **Drafts** (`published: false`) are invisible live (`/q/<id>` 404, guesses rejected) but playable in the emulator. `/` plays the highest-numbered **published** quiz and the site pins the URL to `/q/<id>`.
- **Published quizzes are permanent.** Never unpublish, delete, or change a published quiz's puzzle count/order/ids/emoji/answers/maxGuesses — shared links and saved progress depend on them. Fixing pinyin/meaning is fine. `checkUpdate` enforces this in `npm run quiz`; `--force` overrides (owner used it once, pre-launch, to trim quiz 1).
- **No caching of the API** (`Cache-Control: no-store`): a stale puzzle list paired with a new server once showed "NaN guesses left".
- **Saved progress** is per quiz in localStorage (`emoji-guessr:progress:<quizId>`); `emoji-guessr:help-seen` remembers the How to play popup. `?reset` clears progress, on localhost only.
- **Share text**: `Emoji Guessr #<id>  <solved>/<total>`, one line per puzzle (`1. 🟩🟨 🟩🟩`, ❌ if failed), then `https://<origin>/q/<id>`. No emoji clues, no characters.
- **Colors** are the project's own palette (jade / gold / warm gray on warm neutrals), defined as CSS variables in `web/src/styles.css`.

## Commands

```bash
npm run install:all     # install functions/ and web/ dependencies
npm run setup:hooks     # git config core.hooksPath .githooks (once per clone)
npm test                # vitest in functions/ (game, validation, publish rules, store)
npm run build           # functions (tsc, clean lib/) + web (tsc + vite)
npm run emulators       # build, then functions + hosting + firestore emulators on demo-emoji-guessr
npm run dev             # Vite at :5173, proxies /api to the functions emulator
npm run check:leaks     # website leak check
npm run deploy          # test + build + check:leaks + firebase deploy (functions, hosting, firestore:rules)
npm run quiz -- <list | upload <files…> | download <id|all> | delete <id>> [--emulator] [--yes] [--force]
```

## Dependency notes

- `functions/package.json` has `"overrides": { "rimraf": "^6.1.4" }`. Google's Firestore client (`@google-cloud/firestore` → `google-gax` 5.x and `gaxios` 7.1.x) lists `rimraf` 5 but never calls it, and `rimraf` 5 pulls in vulnerable `glob` 10 / `minimatch` 9. The override clears those Dependabot alerts without changing any Google library version. **Remove it** once `firebase-admin`'s Firestore dependency no longer depends on `rimraf` (check with `npm ls rimraf --prefix functions`).
- Prefer this kind of targeted override over `npm audit fix` when the fix would downgrade libraries.

## Local development details

- To run the app: start `npm run emulators` in the background, wait for "All emulators ready" in its output, then open <http://localhost:5050> in the browser. Don't commit tool-specific launch configs (e.g. `.claude/` is git-ignored).
- Emulators: hosting `:5050`, functions `:5001`, firestore `:8080`. Always run under the **demo project** `demo-emoji-guessr` (pinned in the npm script) so local testing can never touch live resources; `web/vite.config.ts` proxies to `/demo-emoji-guessr/us-central1/api`.
- The Firestore emulator needs Java; the npm script puts `$(brew --prefix openjdk)/bin` on PATH.
- Needs `functions/.secret.local` with `TOKEN_SECRET=<random>` (git-ignored).
- The local database starts empty: `npm run quiz -- upload quizzes/*.json --emulator`. To wipe it: `curl -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/demo-emoji-guessr/databases/(default)/documents"`.
- The site can load before the function emulator is ready and show "Couldn't load the quiz"; wait for "All emulators ready" and retry.
- Cloudflare analytics never loads on localhost.

## Managing quizzes (live)

- `npm run quiz` uses Google Application Default Credentials: `gcloud auth application-default login` with the account that owns the project (the owner has done this). Live writes ask for confirmation unless `--yes`.
- Publishing flow: write `quizzes/<n>.json` with `published: false` → test with `--emulator` at `localhost:5050/q/<n>` → optionally upload the draft live → set `published: true` and upload. No deploy needed.
- `delete` only works on drafts. `download all` refreshes the local files (and so the leak checks).

## Leak checks

Both read the local `quizzes/` files and skip with a warning if there are none.

- **Website** (`check-leaks.mjs`): fails if any quiz's answer, pinyin or meaning is in `web/dist`; warns on single answer characters.
- **Commits** (`check-commit-leaks.mjs` via hooks): blocks added lines or commit messages containing a **draft** puzzle's answer, pinyin, meaning or full emoji clue. Anything also in a published quiz counts as public and passes. Takes ~0.06s.
- `ALLOWED_PHRASES` in `quiz-secrets.mjs` lists UI phrases that contain an answer but are fine (下次加油！, 加油！).
- Git history was rewritten once to remove a draft puzzle that had been committed; don't reintroduce answers.

## Auto deploy (GitHub Actions)

`.github/workflows/deploy.yml`: every push and pull request runs `npm ci`, `npm test` and `npm run build`. Pushes to `main` (and manual runs) then deploy functions, hosting and Firestore rules with `firebase deploy --force --non-interactive`, one deploy at a time. Quizzes aren't deployed; they're managed with `npm run quiz`.

- **No stored keys.** GitHub signs in through Workload Identity Federation: pool `github`, provider `github-oidc`, which only accepts tokens where `repository == 'tpankaj/emoji-guessr'` and `ref == 'refs/heads/main'`. Repo variables `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` point the workflow at them.
- **Deploy account** `github-deployer@emoji-guessr-e99da.iam.gserviceaccount.com` has: Cloud Functions Developer, Firebase Hosting Admin, Firebase Rules Admin, Firebase Viewer, Service Usage Consumer, Secret Manager Viewer, Artifact Registry Reader, and Service Account User on two accounts only: the function's runtime account (`846603703445-compute@developer.gserviceaccount.com`) and the App Engine default account (`emoji-guessr-e99da@appspot.gserviceaccount.com`), which the Firebase CLI checks on every functions deploy. It has no database access.
- **No leak check in CI** (the quiz files aren't in the repo). The commit hooks and a local `npm run deploy` still run it.
- `firebase-tools` is pinned in the workflow; bump it alongside the local CLI.
- Deploying from your machine with `npm run deploy` still works.

## First-time setup (already done for the live project)

1. Firebase project on the **Blaze** plan, with a budget alert in Google Cloud Billing.
2. `firebase login`, `firebase use --add` (sets `.firebaserc`).
3. Firestore database: `firebase firestore:databases:create "(default)" --location=nam5` (permanent location; the project uses nam5, Standard edition). The Firestore API may need enabling first — creating the database in the Firebase console does both.
4. `openssl rand -hex 32 | firebase functions:secrets:set TOKEN_SECRET --data-file=-`
5. `npm run deploy`, then upload quizzes with `npm run quiz -- upload quizzes/*.json`.
6. Custom domain: Firebase Hosting → Add custom domain (apex + `www` redirecting to apex); DNS at Namecheap (A + TXT records from Firebase; delete Namecheap's parking CNAME/URL redirect). Don't use Namecheap's URL redirect (no HTTPS).

## Analytics and logs

- **Cloudflare Web Analytics** (cookie-free): token in `web/src/analytics.ts`; the beacon loads after the URL settles on `/q/<id>` or the not-found page, never on localhost.
- **Function logs** are structured, one line per request, with `jsonPayload.event` = `quiz_load`, `guess` (quizId, questionId, guess text, guessNumber, solved, done), `guess_rejected` (warning, with reason), `not_found`, `error`, `invalid_quiz`. Never log tokens or player-identifying data. Logs are kept 30 days by default; this volume stays inside Cloud Logging's free allowance. View: Firebase console → Functions → Logs, or Logs Explorer:

| What | Query |
|---|---|
| All game events | `resource.labels.service_name="api" AND jsonPayload.event:*` |
| Quizzes opened | `jsonPayload.event="quiz_load"` |
| Every guess | `jsonPayload.event="guess"` |
| Puzzles solved | `jsonPayload.event="guess" AND jsonPayload.solved=true` |
| Puzzles failed | `jsonPayload.event="guess" AND jsonPayload.done=true AND jsonPayload.solved=false` |
| One puzzle | `jsonPayload.event="guess" AND jsonPayload.quizId="1" AND jsonPayload.questionId=2` |
| Possible tampering | `jsonPayload.event="guess_rejected" AND jsonPayload.reason="Invalid progress token"` |
| Server errors | `jsonPayload.event="error"` |
| Broken quiz data | `jsonPayload.event="invalid_quiz"` |

## Security notes

- Firestore rules deny all client access; the database is reachable only by the function's service account and project members (via console, `gcloud`, the Firebase CLI).
- The owner's ADC file (`~/.config/gcloud/application_default_credentials.json`) grants project access — never copy or commit it.
- Function `maxInstances: 5` caps cost from request floods; App Check was deliberately not added.
- Secrets that must never be committed: `functions/.secret.local`, service-account JSON, `.env*`, `.runtimeconfig.json` (all git-ignored). The Cloudflare token and Firebase project id are public by design.
