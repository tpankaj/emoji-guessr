# Emoji Guessr

Guess the Chinese phrase hidden in the emoji. ➕⛽️ is 加油, “add oil”: keep going!

Each puzzle gives you a few guesses, typed in simplified or traditional characters. After each one, every character turns green (right spot), gold (in the phrase, wrong spot) or gray (not in the phrase). When you finish, share your result as a grid of colored squares that gives nothing away.

**Play it at [emojiguessr.io](https://emojiguessr.io).**

## How it works

- **Website** (`web/`): a small Preact app hosted on Firebase Hosting.
- **Server** (`functions/`): one Cloud Function that checks guesses. The answers never reach your browser until you've solved the puzzle or run out of guesses.
- **Quizzes** live in a Firestore database, not in this repo, so the code can be public without spoiling anything.

## Running it locally

You need Node.js, the [Firebase CLI](https://firebase.google.com/docs/cli) and Java (`brew install openjdk` on a Mac).

```bash
npm run install:all
npm run setup:hooks
echo "TOKEN_SECRET=$(openssl rand -hex 32)" > functions/.secret.local
npm run emulators
```

Then open <http://localhost:5050>. The local database starts empty, so add a quiz first (see below).

Run the tests with `npm test`.

## Adding a quiz

A quiz starts as a draft with a random id, can be shared by its link while you test it, and is then released under the next number.

```bash
npm run quiz -- new-id          # prints an unused id, e.g. k3m9x2qv7t
```

Write `quizzes/k3m9x2qv7t.json` (this folder is ignored by git):

```json
{
  "id": "k3m9x2qv7t",
  "published": false,
  "listed": false,
  "questions": [
    { "id": 1, "emoji": "➕⛽️", "answer": "加油", "pinyin": "jiā yóu", "meaning": "“Add oil!” — keep going", "maxGuesses": 2 }
  ]
}
```

Upload it to your local database and play it at `localhost:5050/q/k3m9x2qv7t`:

```bash
npm run quiz -- upload quizzes/k3m9x2qv7t.json --emulator
```

Without `--emulator`, the same command uploads to the live site. Then:

- Set `"published": true` and upload again: the quiz is live, but only people with its link can play it. It isn't on the main page or in the archive.
- Edit and upload as often as you like while testing. If an edit would make a tester's saved progress wrong (a changed answer, say), the script says so and their progress restarts.
- `npm run quiz -- promote k3m9x2qv7t` releases it as the next number. The old link keeps working and testers keep their progress. Released quizzes can't be unpublished, deleted or have their puzzles changed.

## Deploying

Pushing to `main` deploys automatically through GitHub Actions. To deploy from your own machine instead:

```bash
npm run deploy
```

First-time setup, the full quiz rules and other details are in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
