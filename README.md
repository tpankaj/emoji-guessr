# Emoji Guessr

Guess the Chinese phrase hidden in the emoji. ➕⛽️ is 加油, “add oil”: keep going!

Each puzzle gives you a few guesses. After each one, every character turns green (right spot), gold (in the phrase, wrong spot) or gray (not in the phrase). When you finish, share your result as a grid of colored squares that gives nothing away.

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

Write a quiz file in `quizzes/` (this folder is ignored by git):

```json
{
  "id": "1",
  "published": true,
  "questions": [
    { "id": 1, "emoji": "➕⛽️", "answer": "加油", "pinyin": "jiā yóu", "meaning": "“Add oil!” — keep going", "maxGuesses": 2 }
  ]
}
```

Upload it to your local database and play it:

```bash
npm run quiz -- upload quizzes/1.json --emulator
```

Without `--emulator`, the same command uploads to the live site. Quizzes with `"published": false` are drafts that only you can play locally.

## Deploying

```bash
npm run deploy
```

First-time setup, the full quiz rules and other details are in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)
