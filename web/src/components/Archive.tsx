import { useCallback, useEffect, useState } from "preact/hooks";
import { loadAnalytics } from "../analytics";
import { getQuizIndex } from "../api";
import { isUnlistedId, quizPath } from "../share";
import { archiveStatus, resetProgress, type ArchiveStatus } from "../storage";
import type { QuizIndex } from "../types";
import { ConfirmModal } from "./ConfirmModal";
import { Shell } from "./Shell";

/** /archive: every quiz, newest first, with how far this player got in each. */
export function Archive() {
  const [index, setIndex] = useState<QuizIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  // Bumped after a reset so the rows re-read saved progress.
  const [, setVersion] = useState(0);

  const load = useCallback(() => {
    setError(null);
    getQuizIndex()
      .then(setIndex)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    loadAnalytics();
    load();
  }, [load]);

  const cancelReset = useCallback(() => setResetting(null), []);
  const doReset = () => {
    if (resetting) resetProgress(resetting);
    setResetting(null);
    setVersion((v) => v + 1);
  };

  let body;
  if (error) {
    body = (
      <div class="center">
        <p>Couldn’t load the quizzes. {error}</p>
        <button class="btn primary" onClick={load}>
          Try again
        </button>
      </div>
    );
  } else if (!index) {
    body = <div class="center muted">Loading…</div>;
  } else if (index.quizzes.length === 0) {
    body = <div class="center muted">No quizzes yet.</div>;
  } else {
    body = (
      <ul class="archive">
        {index.quizzes.map((q) => {
          const status = archiveStatus(q.id, q.count);
          const label = isUnlistedId(q.id) ? q.id : `#${q.id}`;
          return (
            <li key={q.id}>
              <a class="archive-row" href={quizPath(q.id)}>
                <span class="archive-num">{label}</span>
                {q.id === index.latest && <span class="tag latest">Latest</span>}
                {q.draft && <span class="tag">Draft</span>}
                {q.unlisted && <span class="tag">Unlisted</span>}
                <StatusText status={status} count={q.count} />
              </a>
              {status.kind !== "new" && (
                <button
                  class="icon-btn archive-reset"
                  onClick={() => setResetting(q.id)}
                  aria-label={`Start quiz ${label} over`}
                  title="Start over"
                >
                  ↺
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Shell onArchive>
      <main class="archive-page">
        <h2>All quizzes</h2>
        {body}
      </main>
      {resetting && (
        <ConfirmModal
          title={`Start ${isUnlistedId(resetting) ? "this quiz" : `quiz #${resetting}`} over?`}
          message="Your guesses and results for this quiz will be erased."
          confirmLabel="Start over"
          onConfirm={doReset}
          onCancel={cancelReset}
        />
      )}
    </Shell>
  );
}

function StatusText({ status, count }: { status: ArchiveStatus; count: number }) {
  switch (status.kind) {
    case "new":
      return <span class="archive-status muted">{count} {count === 1 ? "puzzle" : "puzzles"}</span>;
    case "playing":
      return (
        <span class="archive-status">
          In progress · {status.played} of {count} played
        </span>
      );
    case "done":
      return (
        <span class="archive-status">
          <span class={`badge ${status.solved > 0 ? "ok" : "miss"}`}>
            {status.solved}/{count}
          </span>
        </span>
      );
  }
}
