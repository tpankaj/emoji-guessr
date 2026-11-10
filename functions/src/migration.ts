// One-time migration of the live database to the listed/unlisted model. Delete this file
// (and `npm run quiz -- migrate`) once it has been run on the live project.
//
// Before: published quizzes and drafts all had numbers, with no listed or revision field.
// After:  published quizzes keep their number and gain listed: true, revision: 1; every draft
//         gets a random id (listed: false, revision: 1), so numbers are used only by released quizzes.

import { NUMBERED_ID, isAlias, validateQuiz } from "./game";

export interface StoredQuiz {
  published: boolean;
  listed: boolean;
  revision: number;
  questions: unknown[];
}

export type MigrationStep =
  /** Add the missing fields to a quiz that keeps its id. */
  | { kind: "update"; id: string; data: StoredQuiz }
  /** Move a numbered draft to a random id: write the new document, then delete the old one. */
  | { kind: "unnumber"; from: string; to: string; data: StoredQuiz };

export interface MigrationPlan {
  steps: MigrationStep[];
  /** Ids that need nothing (already migrated, or an alias). */
  unchanged: string[];
  /** Things that stop a document from being migrated; it is left as it is. */
  problems: string[];
  /** Worth knowing, but not blocking. */
  warnings: string[];
}

/** `docs` is every document in the collection with its id; `newId` returns a fresh random id. */
export function planMigration(docs: ({ id: string } & Record<string, unknown>)[], newId: () => string): MigrationPlan {
  const plan: MigrationPlan = { steps: [], unchanged: [], problems: [], warnings: [] };

  for (const doc of docs) {
    if (isAlias(doc)) {
      plan.unchanged.push(doc.id);
      continue;
    }
    const published = doc.published === true;
    const revision = Number.isInteger(doc.revision) && (doc.revision as number) >= 1 ? (doc.revision as number) : 1;
    const numbered = NUMBERED_ID.test(doc.id);
    const unnumber = numbered && !published;
    const data: StoredQuiz = {
      published,
      listed: numbered && published,
      revision,
      questions: Array.isArray(doc.questions) ? doc.questions : [],
    };

    // Validate the result under the id it will have (a stand-in random id for a draft).
    const target = unnumber ? "a1b2c3d4e5" : doc.id;
    const errors = validateQuiz({ ...data, id: target }).map((e) => e.replace(`"${target}"`, `"${doc.id}"`));
    if (errors.length) {
      plan.problems.push(...errors);
      continue;
    }

    const alreadyDone =
      doc.published === data.published &&
      doc.listed === data.listed &&
      doc.revision === data.revision &&
      !unnumber;
    if (alreadyDone) plan.unchanged.push(doc.id);
    else if (unnumber) plan.steps.push({ kind: "unnumber", from: doc.id, to: newId(), data });
    else plan.steps.push({ kind: "update", id: doc.id, data });
  }

  // After the migration the released numbers should run 1..N with no gaps.
  const released = docs
    .filter((d) => !isAlias(d) && NUMBERED_ID.test(d.id) && d.published === true)
    .map((d) => Number(d.id))
    .sort((a, b) => a - b);
  const missing = released.length ? Array.from({ length: released.at(-1)! }, (_, i) => i + 1).filter((n) => !released.includes(n)) : [];
  if (missing.length) {
    plan.warnings.push(`released quizzes have gaps: ${missing.join(", ")} missing (the next release will not fill them)`);
  }
  return plan;
}
