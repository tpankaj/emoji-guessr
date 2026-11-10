// Manage quizzes in Firestore.
//
//   npm run quiz -- list                          list quizzes in the database
//   npm run quiz -- new-id                        print an unused random id for a new quiz
//   npm run quiz -- upload quizzes/<id>.json [...]  check and upload quiz files
//   npm run quiz -- promote <random-id>           release a quiz: move it to the next number
//   npm run quiz -- download <id|all>             save quizzes to quizzes/<id>.json
//   npm run quiz -- delete <id>                   delete a quiz that isn't released
//   npm run quiz -- migrate                       one-time: convert the database to listed/unlisted quizzes
//
// A quiz starts as a draft with a random id (published: false), becomes unlisted when published
// (playable by its link only), and is released with `promote`, which gives it the next number.
// Add --emulator to work on the local emulator instead of the live project.
// Live writes ask for confirmation unless you add --yes.
// --force overrides the rules for a released quiz (e.g. changing one during beta testing).
//
// Uses the same validation and release rules as the server (functions/lib/game.js), so a
// quiz the script accepts is one the game will serve. Live access uses Google Application
// Default Credentials (see README → "Managing quizzes").

import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const requireFromFunctions = createRequire(new URL("../functions/package.json", import.meta.url));
const { initializeApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore } = requireFromFunctions("firebase-admin/firestore");
const { NUMBERED_ID, checkUpdate, generateUnlistedId, isAlias, nextNumber, nextRevision, planPromotion, validateQuiz } =
  requireFromFunctions("./lib/game.js");
const { planMigration } = requireFromFunctions("./lib/migration.js");
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
const db = getFirestore();
const collection = db.collection(QUIZ_COLLECTION);
const target = useEmulator ? `local emulator (${project})` : `LIVE project ${project}`;

/** The quiz as stored: Firestore holds everything but the id, which is the document id. */
const fromDoc = (doc) => ({ id: doc.id, ...doc.data() });
/** What Firestore holds for a quiz (and what a local file holds, plus the id). */
const stored = (q) => ({ published: q.published, listed: q.listed, revision: q.revision, questions: q.questions });
const normalize = (q) => JSON.stringify({ id: q.id, ...stored(q) });
const urlPath = (q) => `/q/${q.id}`;
const UNLISTED_NOTE = "unlisted: not on the main site, reachable only by its link";

const localPath = (id) => join(QUIZ_DIR, `${id}.json`);
function writeLocal(quiz) {
  mkdirSync(QUIZ_DIR, { recursive: true });
  writeFileSync(localPath(quiz.id), JSON.stringify({ id: quiz.id, ...stored(quiz) }, null, 2) + "\n");
}

async function confirm(question) {
  if (useEmulator || flags.has("--yes")) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

const statusOf = (q) => (!q.published ? "draft" : NUMBERED_ID.test(q.id) ? "released" : "unlisted");

async function list() {
  const snap = await collection.get();
  const docs = snap.docs.map(fromDoc);
  // Released quizzes by number, then everything else by id.
  const rank = (q) => (NUMBERED_ID.test(q.id) ? Number(q.id) : Infinity);
  docs.sort((a, b) => (rank(a) === rank(b) ? a.id.localeCompare(b.id) : rank(a) - rank(b)));
  console.log(`Quizzes in ${target}:`);
  if (!docs.length) console.log("  (none)");
  for (const q of docs) {
    if (isAlias(q)) {
      console.log(`  ${q.id.padEnd(10)}  moved     → quiz ${q.movedTo}  ${urlPath(q)} still works`);
      continue;
    }
    const problems = validateQuiz(q);
    const count = `${String(q.questions?.length ?? 0).padStart(2)} puzzles`;
    console.log(`  ${q.id.padEnd(10)}  ${statusOf(q).padEnd(8)}  ${count}  rev ${q.revision ?? "?"}  ${urlPath(q)}${problems.length ? "  ⚠ invalid" : ""}`);
  }
}

async function newId() {
  const taken = new Set((await collection.get()).docs.map((d) => d.id));
  const id = generateUnlistedId(taken, randomInt);
  console.log(id);
  console.log(`Use it as "id" in the new quiz file (with "published": false, "listed": false). Its link will be ${urlPath({ id })}`);
}

async function upload(files) {
  if (!files.length) fail("give at least one quiz file, e.g. npm run quiz -- upload quizzes/k3m9x2qv7t.json");
  const docs = (await collection.get()).docs;
  const known = new Map(docs.map((d) => [d.id, fromDoc(d)]));
  const plan = [];
  for (const file of files) {
    let quiz;
    try {
      quiz = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      fail(`${file}: ${e.message}`);
    }
    const existing = known.get(quiz.id);
    if (existing && isAlias(existing)) {
      fail(`${file}: "${quiz.id}" was released as quiz ${existing.movedTo}; edit quizzes/${existing.movedTo}.json instead`);
    }
    // The revision is managed here: it goes up when an edit would break players' saved progress.
    const revision = nextRevision(existing, quiz);
    quiz = { ...quiz, revision };

    const problems = validateQuiz(quiz);
    if (problems.length) fail(`${file} isn't valid:\n  ${problems.join("\n  ")}`);

    // Numbers are given out in order with no gaps, and only to released quizzes.
    if (!existing && NUMBERED_ID.test(quiz.id)) {
      const next = nextNumber([...known.keys()]);
      if (quiz.id !== next) {
        fail(`${file}: quiz ${quiz.id} would leave a gap; the next number is ${next}.\n  Give the quiz a random id (npm run quiz -- new-id) and release it with: npm run quiz -- promote <id>`);
      }
    }

    const refused = checkUpdate(existing, quiz);
    if (refused.length && !flags.has("--force")) {
      fail(`${file} can't be uploaded:\n  ${refused.join("\n  ")}\n(--force overrides this, e.g. before launch)`);
    }
    if (refused.length) {
      console.warn(`⚠ --force: overriding release rules for ${file}:\n  ${refused.join("\n  ")}`);
    }

    const hidden = quiz.published && !NUMBERED_ID.test(quiz.id) ? ` (${UNLISTED_NOTE})` : "";
    const restart =
      existing && revision !== existing.revision
        ? `; revision ${existing.revision} → ${revision}: players' saved progress for this quiz restarts`
        : "";
    let action;
    if (!existing) {
      action = !quiz.published ? "add as draft" : NUMBERED_ID.test(quiz.id) ? "add and RELEASE" : `add and PUBLISH${hidden}`;
    } else if (normalize(existing) === normalize(quiz)) action = null;
    else if (refused.length) action = "FORCE-CHANGE released quiz";
    else if (!existing.published && quiz.published) action = `PUBLISH (was a draft)${hidden}`;
    else if (existing.published && !quiz.published) action = "UNPUBLISH (back to a draft; its link stops working)";
    else if (NUMBERED_ID.test(quiz.id)) action = "fix pinyin/meaning of released quiz";
    else action = `update ${quiz.published ? "unlisted quiz" : "draft"}`;
    if (action) action += restart;

    known.set(quiz.id, quiz);
    if (action) plan.push({ file, quiz, action });
    else console.log(`= quiz ${quiz.id} (${file}): no changes`);
    writeLocal(quiz); // keeps the file's revision in step with the database
  }
  if (!plan.length) return;

  console.log(`Uploading to ${target}:`);
  for (const p of plan) console.log(`  quiz ${p.quiz.id} (${p.file}): ${p.action}`);
  if (!(await confirm("Go ahead?"))) fail("cancelled, nothing uploaded");

  for (const { quiz } of plan) {
    await collection.doc(quiz.id).set(stored(quiz));
    console.log(`✔ quiz ${quiz.id} uploaded`);
  }
  if (!useEmulator && plan.some((p) => p.quiz.published)) {
    console.log("Published quizzes can take up to 5 minutes to appear on the live site.");
  }
}

/** Releases a quiz with a random id: it takes the next number and its old link keeps working. */
async function promote(id) {
  if (!id) fail("say which quiz to release: npm run quiz -- promote <random-id>");
  // Peek first so the confirmation can say what will happen.
  const docs = (await collection.get()).docs.map((d) => ({ id: d.id, data: d.data() }));
  const preview = planPromotion(docs, id);
  if (!preview.ok) fail(preview.error);
  const wasDraft = docs.find((d) => d.id === id).data.published !== true;
  console.log(
    `Release ${id} as quiz ${preview.to} in ${target}: ${preview.quiz.questions.length} puzzles` +
      `${wasDraft ? " (it is a draft, so it goes live)" : ""}.`,
  );
  console.log(`  /q/${id} will keep working and show quiz ${preview.to}; testers keep their progress.`);
  if (!(await confirm("Go ahead?"))) fail("cancelled, nothing changed");

  // Re-plan inside a transaction, so two releases at once can't take the same number.
  const result = await db
    .runTransaction(async (tx) => {
      const snap = await tx.get(collection);
      const plan = planPromotion(snap.docs.map((d) => ({ id: d.id, data: d.data() })), id);
      if (!plan.ok) return plan;
      tx.set(collection.doc(plan.to), stored(plan.quiz));
      tx.set(collection.doc(id), { movedTo: plan.to });
      return plan;
    });
  if (!result.ok) fail(result.error); // e.g. another release got there first

  writeLocal(result.quiz);
  if (existsSync(localPath(id))) unlinkSync(localPath(id));
  console.log(`✔ quiz ${id} is now quiz ${result.to} (${localPath(result.to)})`);
  if (!useEmulator) console.log("It can take up to 5 minutes to appear on the live site.");
}

async function download(which) {
  if (!which) fail("say which quiz: npm run quiz -- download 2   (or: download all)");
  const all = which === "all";
  const docs = all ? (await collection.get()).docs : [await collection.doc(which).get()].filter((d) => d.exists);
  if (!docs.length) fail(`no quiz "${which}" in ${target}`);
  mkdirSync(QUIZ_DIR, { recursive: true });
  for (const doc of docs) {
    const quiz = fromDoc(doc);
    if (isAlias(quiz)) {
      if (!all) fail(`"${quiz.id}" was released as quiz ${quiz.movedTo}; download that instead`);
      continue;
    }
    writeLocal(quiz);
    console.log(`✔ quiz ${quiz.id} → ${localPath(quiz.id)}`);
  }
}

async function remove(id) {
  if (!id) fail("say which quiz to delete: npm run quiz -- delete <id>");
  const doc = await collection.doc(id).get();
  if (!doc.exists) fail(`no quiz "${id}" in ${target}`);
  if (isAlias(doc.data())) fail(`"${id}" is a redirect to quiz ${doc.data().movedTo}; redirects are permanent (shared links depend on them)`);
  if (NUMBERED_ID.test(id)) fail(`quiz ${id} is released and can't be deleted (shared links depend on it)`);
  if (!(await confirm(`Delete ${statusOf(fromDoc(doc))} quiz ${id} from ${target}?`))) fail("cancelled, nothing deleted");
  await collection.doc(id).delete();
  console.log(`✔ quiz ${id} deleted`);
}

/**
 * One-time conversion of the live database: released quizzes gain listed and revision, and
 * every numbered draft moves to a random id. Safe to run twice (the second run does nothing)
 * and safe while the old server is live, which ignores the new fields.
 */
async function migrate() {
  const docs = (await collection.get()).docs.map(fromDoc);
  const taken = new Set(docs.map((d) => d.id));
  const newId = () => {
    const id = generateUnlistedId(taken, randomInt);
    taken.add(id);
    return id;
  };
  const plan = planMigration(docs, newId);

  console.log(`Migration of ${target}: ${docs.length} documents`);
  for (const p of plan.problems) console.log(`  ⚠ ${p}`);
  for (const w of plan.warnings) console.log(`  ⚠ ${w}`);
  for (const s of plan.steps) {
    if (s.kind === "update") console.log(`  quiz ${s.id}: keeps its number; add listed: ${s.data.listed}, revision: ${s.data.revision}`);
    else console.log(`  draft ${s.from}: becomes ${s.to} (random id; the number is freed)`);
  }
  if (plan.unchanged.length) console.log(`  already fine: ${plan.unchanged.join(", ")}`);
  if (plan.problems.length) console.log("  The documents with problems are left as they are.");
  if (!plan.steps.length) {
    console.log("Nothing to migrate.");
    return;
  }
  if (!(await confirm("Go ahead?"))) fail("cancelled, nothing changed");

  for (const s of plan.steps) {
    if (s.kind === "update") {
      await collection.doc(s.id).set(s.data);
      writeLocal({ id: s.id, ...s.data });
      console.log(`✔ quiz ${s.id} updated`);
    } else {
      // Write the new document and delete the old one together, so a draft is never lost or doubled.
      const batch = db.batch();
      batch.set(collection.doc(s.to), s.data);
      batch.delete(collection.doc(s.from));
      await batch.commit();
      writeLocal({ id: s.to, ...s.data });
      if (existsSync(localPath(s.from))) unlinkSync(localPath(s.from));
      console.log(`✔ draft ${s.from} → ${s.to}`);
    }
  }
  console.log("Done. Check it with: npm run quiz -- list");
}

try {
  if (command === "list") await list();
  else if (command === "new-id") await newId();
  else if (command === "delete") await remove(rest[0]);
  else if (command === "upload") await upload(rest);
  else if (command === "promote") await promote(rest[0]);
  else if (command === "download") await download(rest[0]);
  else if (command === "migrate") await migrate();
  else fail("usage: npm run quiz -- <list | new-id | upload <files…> | promote <id> | download <id|all> | delete <id> | migrate> [--emulator] [--yes] [--force]");
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
