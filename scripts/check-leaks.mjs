// Fails if any answer, pinyin or meaning from any quiz appears in the built site.
// Warns (doesn't fail) if single answer characters appear, since UI text may use common ones.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Every quiz file under functions/src/quizzes/ (each holds one published quiz).
const quizDir = "functions/src/quizzes";
const quizSrc = readdirSync(quizDir)
  .filter((f) => /^\d+\.ts$/.test(f))
  .map((f) => readFileSync(join(quizDir, f), "utf8"))
  .join("\n");
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
// UI phrases that contain an answer but are fine to ship (e.g. encouragement shown after a
// puzzle ends). They're removed before searching, so the answer elsewhere still counts as a leak.
// Longest first, so a phrase isn't partly removed by a shorter one it contains.
const ALLOWED_PHRASES = ["下次加油！", "加油！"].sort((a, b) => b.length - a.length);
const stripAllowed = (text) => ALLOWED_PHRASES.reduce((t, p) => t.split(p).join(""), text);
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
