// Manage quizzes in Firestore.
//
//   npm run quiz -- list                          list quizzes in the database
//   npm run quiz -- new-id                        print an unused random id for an unlisted quiz
//   npm run quiz -- upload quizzes/2.json [...]   check and upload quiz files
//   npm run quiz -- download <id|all>             save quizzes to quizzes/<id>.json
//   npm run quiz -- delete <id>                   delete a draft (published quizzes are permanent)
//
// Add --emulator to work on the local emulator instead of the live project.
// Live uploads ask for confirmation unless you add --yes.
// --force overrides the publish rules (e.g. changing a published quiz during beta testing).
//
// Uses the same validation and publish rules as the server (functions/lib/game.js), so a
// quiz the script accepts is one the game will serve. Live access uses Google Application
// Default Credentials (see README → "Managing quizzes").

import { randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore } = requireFromFunctions("firebase-admin/firestore");
const { validateQuiz, checkUpdate, UNLISTED_ID } = requireFromFunctions("./lib/game.js");
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
const normalize = (q) => JSON.stringify({ id: q.id, published: q.published, listed: q.listed, questions: q.questions });
const urlPath = (q) => `/q/${q.id}`;
const UNLISTED_NOTE = "unlisted: not on the main site, reachable only by its link";

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
    const status = !q.published ? "draft" : q.listed ? "listed" : "unlisted";
    console.log(
      `  ${q.id.padEnd(10)}  ${status.padEnd(8)}  ${String(q.questions?.length ?? 0).padStart(2)} puzzles  ${urlPath(q)}${problems.length ? "  ⚠ invalid" : ""}`,
    );
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
    if (refused.length && !flags.has("--force")) {
      fail(`${file} can't be uploaded:\n  ${refused.join("\n  ")}\n(--force overrides this, e.g. before launch)`);
    }
    if (refused.length) {
      console.warn(`⚠ --force: overriding publish rules for ${file}:\n  ${refused.join("\n  ")}`);
    }

    let action;
    const hidden = quiz.published && !quiz.listed ? ` (${UNLISTED_NOTE})` : "";
    const sameContent = existing && JSON.stringify(existing.questions) === JSON.stringify(quiz.questions);
    if (!existing) action = quiz.published ? `add and PUBLISH${hidden}` : "add as draft";
    else if (normalize(existing) === normalize(quiz)) action = null;
    else if (refused.length) action = "FORCE-CHANGE published quiz";
    else if (!existing.published && quiz.published) action = `PUBLISH (was a draft)${hidden}`;
    else if (existing.published && sameContent && existing.listed !== quiz.listed) {
      action = quiz.listed ? "SHOW on the main site (list it)" : `HIDE from the main site (${UNLISTED_NOTE}; its /q/${quiz.id} link keeps working)`;
    } else action = existing.published ? "fix pinyin/meaning of published quiz" : "update draft";

    if (action) plan.push({ file, quiz, action });
    else console.log(`= quiz ${quiz.id} (${file}): no changes`);
  }
  if (!plan.length) return;

  console.log(`Uploading to ${target}:`);
  for (const p of plan) console.log(`  quiz ${p.quiz.id} (${p.file}): ${p.action}`);
  if (!(await confirm("Go ahead?"))) fail("cancelled, nothing uploaded");

  for (const { quiz } of plan) {
    const { id, ...data } = quiz;
    await collection.doc(id).set({ published: data.published, listed: data.listed, questions: data.questions });
    console.log(`✔ quiz ${id} uploaded`);
  }
  if (!useEmulator && plan.some((p) => p.quiz.published)) {
    console.log("Published quizzes can take up to 5 minutes to appear on the live site.");
  }
}

/** Prints a random id for an unlisted quiz: the id is the secret part of its link. */
async function newId() {
  const taken = new Set((await collection.get()).docs.map((d) => d.id));
  // No lookalike characters (0/o, 1/l/i); at least one letter so it can't be mistaken for a number.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  for (;;) {
    const id = Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join("");
    if (UNLISTED_ID.test(id) && !taken.has(id)) {
      console.log(id);
      console.log(`Set "id": "${id}" and "listed": false in the quiz file. Its link will be ${urlPath({ id })}`);
      return;
    }
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
    writeFileSync(path, JSON.stringify({ id: quiz.id, published: quiz.published, listed: quiz.listed, questions: quiz.questions }, null, 2) + "\n");
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
  else if (command === "new-id") await newId();
  else if (command === "delete") await remove(rest[0]);
  else if (command === "upload") await upload(rest);
  else if (command === "download") await download(rest[0]);
  else fail("usage: npm run quiz -- <list | new-id | upload <files…> | download <id|all> | delete <id>> [--emulator] [--yes] [--force]");
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
