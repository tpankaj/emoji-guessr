// Manage quizzes in Firestore.
//
//   npm run quiz -- list                          list quizzes in the database
//   npm run quiz -- upload quizzes/2.json [...]   check and upload quiz files
//   npm run quiz -- download <id|all>             save quizzes to quizzes/<id>.json
//   npm run quiz -- delete <id>                   delete a draft (published quizzes are permanent)
//
// Add --emulator to work on the local emulator instead of the live project.
// Live uploads ask for confirmation unless you add --yes.
//
// Uses the same validation and publish rules as the server (functions/lib/game.js), so a
// quiz the script accepts is one the game will serve. Live access uses Google Application
// Default Credentials (see README → "Managing quizzes").

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore } = requireFromFunctions("firebase-admin/firestore");
const { validateQuiz, checkUpdate } = requireFromFunctions("./lib/game.js");
const { QUIZ_COLLECTION } = requireFromFunctions("./lib/store.js");

const EMULATOR_PROJECT = "demo-emoji-guessr";
const EMULATOR_HOST = "127.0.0.1:8080";
const QUIZ_DIR = "quizzes";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [command, ...rest] = args.filter((a) => !a.startsWith("--"));
const useEmulator = flags.has("--emulator");

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function projectId() {
  if (useEmulator) return EMULATOR_PROJECT;
  const rc = JSON.parse(readFileSync(".firebaserc", "utf8"));
  const id = rc?.projects?.default;
  if (!id || id.startsWith("demo-")) fail(`.firebaserc has no live project (found "${id}")`);
  return id;
}

if (useEmulator) process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
// This runs on your computer, not a Google server: skip the slow cloud-metadata probe.
process.env.METADATA_SERVER_DETECTION ??= "none";
const project = projectId();
initializeApp({ projectId: project });
const collection = getFirestore().collection(QUIZ_COLLECTION);
const target = useEmulator ? `local emulator (${project})` : `LIVE project ${project}`;

/** The quiz as stored: Firestore holds everything but the id, which is the document id. */
const fromDoc = (doc) => ({ id: doc.id, ...doc.data() });
const normalize = (q) => JSON.stringify({ id: q.id, published: q.published, questions: q.questions });

async function confirm(question) {
  if (useEmulator || flags.has("--yes")) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

async function list() {
  const snap = await collection.get();
  const quizzes = snap.docs.map(fromDoc).sort((a, b) => Number(a.id) - Number(b.id));
  console.log(`Quizzes in ${target}:`);
  if (!quizzes.length) console.log("  (none)");
  for (const q of quizzes) {
    const problems = validateQuiz(q);
    const status = q.published ? "published" : "draft";
    console.log(`  ${q.id}  ${status.padEnd(9)}  ${q.questions?.length ?? 0} puzzles${problems.length ? "  ⚠ invalid" : ""}`);
  }
}

async function upload(files) {
  if (!files.length) fail("give at least one quiz file, e.g. npm run quiz -- upload quizzes/2.json");
  const plan = [];
  for (const file of files) {
    let quiz;
    try {
      quiz = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      fail(`${file}: ${e.message}`);
    }
    const problems = validateQuiz(quiz);
    if (problems.length) fail(`${file} isn't valid:\n  ${problems.join("\n  ")}`);

    const doc = await collection.doc(quiz.id).get();
    const existing = doc.exists ? fromDoc(doc) : undefined;
    const refused = checkUpdate(existing, quiz);
    if (refused.length) fail(`${file} can't be uploaded:\n  ${refused.join("\n  ")}`);

    let action;
    if (!existing) action = quiz.published ? "add and PUBLISH" : "add as draft";
    else if (normalize(existing) === normalize(quiz)) action = null;
    else if (!existing.published && quiz.published) action = "PUBLISH (was a draft)";
    else action = existing.published ? "fix pinyin/meaning of published quiz" : "update draft";

    if (action) plan.push({ file, quiz, action });
    else console.log(`= quiz ${quiz.id} (${file}): no changes`);
  }
  if (!plan.length) return;

  console.log(`Uploading to ${target}:`);
  for (const p of plan) console.log(`  quiz ${p.quiz.id} (${p.file}): ${p.action}`);
  if (!(await confirm("Go ahead?"))) fail("cancelled, nothing uploaded");

  for (const { quiz } of plan) {
    const { id, ...data } = quiz;
    await collection.doc(id).set({ published: data.published, questions: data.questions });
    console.log(`✔ quiz ${id} uploaded`);
  }
  if (!useEmulator && plan.some((p) => p.quiz.published)) {
    console.log("Published quizzes can take up to 5 minutes to appear on the live site.");
  }
}

async function download(which) {
  if (!which) fail("say which quiz: npm run quiz -- download 2   (or: download all)");
  const docs =
    which === "all" ? (await collection.get()).docs : [await collection.doc(which).get()].filter((d) => d.exists);
  if (!docs.length) fail(`no quiz "${which}" in ${target}`);
  mkdirSync(QUIZ_DIR, { recursive: true });
  for (const doc of docs) {
    const quiz = fromDoc(doc);
    const path = join(QUIZ_DIR, `${quiz.id}.json`);
    writeFileSync(path, JSON.stringify({ id: quiz.id, published: quiz.published, questions: quiz.questions }, null, 2) + "\n");
    console.log(`✔ quiz ${quiz.id} → ${path}`);
  }
}

async function remove(id) {
  if (!id) fail("say which draft to delete: npm run quiz -- delete 2");
  const doc = await collection.doc(id).get();
  if (!doc.exists) fail(`no quiz "${id}" in ${target}`);
  if (doc.data().published) fail(`quiz ${id} is published and can't be deleted (shared links depend on it)`);
  if (!(await confirm(`Delete draft quiz ${id} from ${target}?`))) fail("cancelled, nothing deleted");
  await collection.doc(id).delete();
  console.log(`✔ draft quiz ${id} deleted`);
}

try {
  if (command === "list") await list();
  else if (command === "delete") await remove(rest[0]);
  else if (command === "upload") await upload(rest);
  else if (command === "download") await download(rest[0]);
  else fail("usage: npm run quiz -- <list | upload <files…> | download <id|all> | delete <id>> [--emulator] [--yes]");
} catch (e) {
  if (!useEmulator && /credential|Could not load the default credentials|PERMISSION_DENIED|UNAUTHENTICATED/i.test(String(e))) {
    fail(`couldn't access ${target}: ${e.message}\nSign in first — see README → "Managing quizzes".`);
  }
  if (useEmulator && /ECONNREFUSED|14 UNAVAILABLE/i.test(String(e))) {
    fail("couldn't reach the Firestore emulator — is `npm run emulators` running?");
  }
  fail(e.stack ?? String(e));
}
process.exit(0);
