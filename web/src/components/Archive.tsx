import { useCallback, useEffect, useState } from "preact/hooks";
import { loadAnalytics } from "../analytics";
import { getQuizIndex } from "../api";
import { quizPath } from "../share";
import { archiveStatus, type ArchiveStatus } from "../storage";
import type { QuizIndex } from "../types";
import { Shell } from "./Shell";

/** /archive: every quiz, newest first, with how far this player got in each. */
export function Archive() {
  const [index, setIndex] = useState<QuizIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        {index.quizzes.map((q) => (
          <li key={q.id}>
            <a class="archive-row" href={quizPath(q.id)}>
              <span class="archive-num">#{q.id}</span>
              {q.id === index.latest && <span class="tag latest">Latest</span>}
              {q.draft && <span class="tag">Draft</span>}
              <StatusText status={archiveStatus(q.id, q.count)} count={q.count} />
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Shell onArchive>
      <main class="archive-page">
        <h2>All quizzes</h2>
        {body}
      </main>
    </Shell>
  );
}

function StatusText({ status, count }: { status: ArchiveStatus; count: number }) {
  switch (status.kind) {
    case "new":
      return <span class="archive-status muted">{count} puzzles</span>;
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
