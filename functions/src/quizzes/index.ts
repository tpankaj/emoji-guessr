import type { Quiz } from "./types";
import quiz1 from "./1";

/**
 * Every quiz ever published, oldest first. The last one is what "/" plays.
 *
 * Never remove a quiz or change its answers: anyone with a /q/<id> link or a
 * shared result must still be able to play it. To change puzzles, add a new
 * file (e.g. 2.ts with id "2") and append it here.
 */
export const QUIZZES: Quiz[] = [quiz1];
