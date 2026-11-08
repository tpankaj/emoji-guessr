// Fails if any answer, pinyin or meaning from your local quiz files appears in the built site.
// Warns (doesn't fail) if single answer characters appear, since UI text may use common ones.
//
// Quizzes live in Firestore; this reads the working copies in quizzes/*.json (git-ignored).
// Run `npm run quiz -- download all` to refresh them. With none present it warns and passes.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const quizDir = "quizzes";
const quizFiles = existsSync(quizDir) ? readdirSync(quizDir).filter((f) => f.endsWith(".json")) : [];
if (!quizFiles.length) {
  console.warn("check-leaks: no quiz files in quizzes/ — skipped (run `npm run quiz -- download all`)");
  process.exit(0);
}
const questions = quizFiles.flatMap((f) => JSON.parse(readFileSync(join(quizDir, f), "utf8")).questions ?? []);
const grab = (field) => questions.map((q) => q[field]).filter((v) => typeof v === "string" && v);
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
