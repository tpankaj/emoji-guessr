import { isUnlistedId, quizPath } from "../share";
import type { Progress, PublicQuiz } from "../types";

export const ARCHIVE_PATH = "/archive";

interface Props {
  children: preact.ComponentChildren;
  onHelp?: () => void;
  quiz?: PublicQuiz;
  progress?: Progress;
  /** Hides the archive button, on the archive page itself. */
  onArchive?: boolean;
}

export function Shell({ children, onHelp, quiz, progress, onArchive }: Props) {
  return (
    <div class="app">
      <header class="header">
        <div class="header-side">
          {!onArchive && (
            <a class="icon-btn" href={ARCHIVE_PATH} aria-label="All quizzes" title="All quizzes">
              <ListIcon />
            </a>
          )}
        </div>
        <h1>
          <a class="home-link" href="/">
            Emoji Guessr
          </a>
        </h1>
        <div class="header-side right">
          {onHelp && (
            <button class="icon-btn" onClick={onHelp} aria-label="How to play">
              ?
            </button>
          )}
        </div>
      </header>
      {quiz && progress && (
        <>
          <div class="quiz-bar">
            <span class="muted">{isUnlistedId(quiz.id) ? "Unlisted quiz" : `Quiz #${quiz.id}`}</span>
            {quiz.latest && Number(quiz.latest) > Number(quiz.id) && (
              <a href={quizPath(quiz.latest)}>Newer quiz: #{quiz.latest} →</a>
            )}
          </div>
          <nav class="progress" aria-label="Puzzle progress">
            {quiz.questions.map((q, i) => {
              const s = progress.questions[q.id];
              const cls = s?.done ? (s.solved ? "solved" : "failed") : i === progress.current ? "current" : "";
              return <span key={q.id} class={`dot ${cls}`} title={`Puzzle ${i + 1}`} />;
            })}
          </nav>
        </>
      )}
      {children}
    </div>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
      />
    </svg>
  );
}
