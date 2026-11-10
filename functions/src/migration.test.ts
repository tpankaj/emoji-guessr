import { describe, expect, it } from "vitest";
import { validateQuiz } from "./game";
import { planMigration } from "./migration";

// Quizzes as the live database holds them today: numbered, with published and questions only.
const puzzle = { id: 1, emoji: "🧪", answer: "测试", pinyin: "cè shì", meaning: "test", maxGuesses: 3 };
const old = (id: string, published: boolean, questions: unknown[] = [puzzle]) => ({ id, published, questions });

const ids = ["k3m9x2qv7t", "d4f5g6h7j8", "q2w3e4r5t6", "z9y8x7w6v5"];
const idSource = () => {
  let i = 0;
  return () => ids[i++];
};

describe("planMigration", () => {
  it("lists released quizzes and moves drafts to random ids", () => {
    const plan = planMigration([old("1", true), old("2", true), old("3", false), old("4", false)], idSource());
    expect(plan.problems).toEqual([]);
    expect(plan.steps).toEqual([
      { kind: "update", id: "1", data: { published: true, listed: true, revision: 1, questions: [puzzle] } },
      { kind: "update", id: "2", data: { published: true, listed: true, revision: 1, questions: [puzzle] } },
      { kind: "unnumber", from: "3", to: "k3m9x2qv7t", data: { published: false, listed: false, revision: 1, questions: [puzzle] } },
      { kind: "unnumber", from: "4", to: "d4f5g6h7j8", data: { published: false, listed: false, revision: 1, questions: [puzzle] } },
    ]);
  });

  it("produces data the new server accepts", () => {
    const plan = planMigration([old("1", true), old("2", false)], idSource());
    for (const step of plan.steps) {
      const id = step.kind === "update" ? step.id : step.to;
      expect(validateQuiz({ id, ...step.data }), id).toEqual([]);
    }
  });

  it("only publishes listed: true for published quizzes", () => {
    const plan = planMigration([old("1", true), old("2", false), old("3", true)], idSource());
    const listed = plan.steps.map((s) => (s.kind === "update" ? [s.id, s.data.listed] : [s.from, s.data.listed]));
    expect(listed).toEqual([["1", true], ["2", false], ["3", true]]);
  });

  it("changes nothing the second time", () => {
    const first = planMigration([old("1", true), old("2", false)], idSource());
    const after = first.steps.map((s) =>
      s.kind === "update" ? { id: s.id, ...s.data } : { id: s.to, ...s.data },
    );
    const second = planMigration([...after, { id: "5", movedTo: "1" } as never], idSource());
    expect(second.steps).toEqual([]);
    expect(second.unchanged).toEqual(["1", "k3m9x2qv7t", "5"]);
  });

  it("keeps an existing revision and leaves aliases alone", () => {
    const plan = planMigration([{ ...old("1", true), revision: 4, listed: false }], idSource());
    expect(plan.steps).toEqual([
      { kind: "update", id: "1", data: { published: true, listed: true, revision: 4, questions: [puzzle] } },
    ]);
  });

  it("does not touch a document that can't be migrated cleanly, and says why", () => {
    const plan = planMigration([old("1", true), old("2", true, []), old("3", false, [{ id: "x" }])], idSource());
    expect(plan.steps.map((s) => (s.kind === "update" ? s.id : s.from))).toEqual(["1"]);
    expect(plan.problems.join("\n")).toMatch(/quiz "2": has no puzzles/);
    expect(plan.problems.join("\n")).toMatch(/quiz "3" puzzle x/);
    expect(plan.problems.join("\n")).not.toContain("a1b2c3d4e5");
  });

  it("warns about gaps among released numbers without blocking", () => {
    const plan = planMigration([old("1", true), old("3", true), old("4", false)], idSource());
    expect(plan.steps).toHaveLength(3);
    expect(plan.warnings.join()).toMatch(/gaps: 2 missing/);
    expect(planMigration([old("1", true), old("2", true)], idSource()).warnings).toEqual([]);
  });

  it("needs a random id per draft and never reuses one", () => {
    let calls = 0;
    const plan = planMigration([old("1", false), old("2", false)], () => `id${++calls}`);
    expect(plan.steps.map((s) => (s.kind === "unnumber" ? s.to : ""))).toEqual(["id1", "id2"]);
  });
});
