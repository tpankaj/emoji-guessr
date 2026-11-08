// Fails if any answer, pinyin or meaning from your local quiz files appears in the built site.
// Warns (doesn't fail) if single answer characters appear, since UI text may use common ones.
//
// Reads the working copies in quizzes/*.json (see quiz-secrets.mjs). With none present it
// warns and passes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadQuizzes, stripAllowed, websiteSecrets } from "./quiz-secrets.mjs";

const quizzes = loadQuizzes();
if (!quizzes.length) {
  console.warn("check-leaks: no quiz files in quizzes/ — skipped (run `npm run quiz -- download all`)");
  process.exit(0);
}
const { phrases: secrets, answers } = websiteSecrets(quizzes);

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
};
walk("web/dist");
const bundle = files.map((f) => [f, stripAllowed(readFileSync(f, "utf8"))]);

let failed = false;
for (const s of secrets) {
  for (const [f, text] of bundle) {
    if (text.includes(s)) {
      console.error(`LEAK: "${s}" found in ${f}`);
      failed = true;
    }
  }
}
const chars = new Set(answers.flatMap((a) => Array.from(a)));
for (const ch of chars) {
  for (const [f, text] of bundle) {
    if (text.includes(ch)) console.warn(`warning: answer character "${ch}" appears in ${f} (UI text?)`);
  }
}
if (failed) process.exit(1);
console.log(`check-leaks: ${secrets.length} secrets, ${files.length} files — clean`);
