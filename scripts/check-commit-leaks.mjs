// Blocks a commit that would put a hidden (draft or unlisted) quiz into the git repo (see repoSecrets in
// quiz-secrets.mjs for exactly what counts). Run by the git hooks in .githooks/:
//
//   node scripts/check-commit-leaks.mjs --staged            the changes being committed
//   node scripts/check-commit-leaks.mjs --message <file>    the commit message
//
// Only added lines are checked, so it takes milliseconds. With no local quiz files it passes.
// In an emergency, `git commit --no-verify` skips it.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadQuizzes, repoSecrets, stripAllowed } from "./quiz-secrets.mjs";

const [mode, messageFile] = process.argv.slice(2);
const secrets = repoSecrets(loadQuizzes());
if (!secrets.length) process.exit(0);

/** [where, text] pairs to check. */
let chunks = [];
if (mode === "--staged") {
  const diff = execFileSync("git", ["diff", "--cached", "-U0", "--no-color", "--no-ext-diff", "--text"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let file = "?";
  let line = 0;
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) file = l.slice(4).replace(/^b\//, "");
    else if (l.startsWith("@@")) line = Number(/\+(\d+)/.exec(l)?.[1] ?? 0);
    else if (l.startsWith("+")) chunks.push([`${file}:${line++}`, l.slice(1)]);
  }
} else if (mode === "--message" && messageFile) {
  chunks = readFileSync(messageFile, "utf8")
    .split("\n")
    .map((l, i) => [`commit message, line ${i + 1}`, l])
    .filter(([, l]) => !l.startsWith("#"));
} else {
  console.error("usage: check-commit-leaks.mjs --staged | --message <file>");
  process.exit(2);
}

const hits = [];
for (const [where, text] of chunks) {
  const clean = stripAllowed(text);
  for (const s of secrets) if (clean.includes(s)) hits.push(`  ${where}: "${s}"`);
}
if (hits.length) {
  console.error("✖ Commit blocked: it contains part of a draft or unlisted quiz from quizzes/:");
  console.error(hits.join("\n"));
  console.error("Remove it, or if it's really fine, commit with --no-verify.");
  process.exit(1);
}
