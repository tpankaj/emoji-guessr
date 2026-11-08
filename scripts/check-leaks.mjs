// Fails if any answer, pinyin or meaning from functions/src/quiz.ts appears in the built site.
// Warns (doesn't fail) if single answer characters appear, since UI text may use common ones.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const quizSrc = readFileSync("functions/src/quiz.ts", "utf8");
const grab = (field) => [...quizSrc.matchAll(new RegExp(`${field}:\\s*"([^"]+)"`, "g"))].map((m) => m[1]);
const answers = grab("answer");
const secrets = [...answers, ...grab("pinyin"), ...grab("meaning")];

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
};
walk("web/dist");
const bundle = files.map((f) => [f, readFileSync(f, "utf8")]);

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
