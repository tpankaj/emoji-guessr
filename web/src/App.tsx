import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { loadAnalytics } from "./analytics";
import { ApiError, getQuiz, postGuess } from "./api";
import { Board, flipDuration } from "./components/Board";
import { Archive } from "./components/Archive";
import { HelpModal } from "./components/HelpModal";
import { RevealCard } from "./components/RevealCard";
import { ARCHIVE_PATH, Shell } from "./components/Shell";
import { Summary } from "./components/Summary";
import { TriedChars } from "./components/TriedChars";
import { quizPath } from "./share";
import { clearProgress, emptyQuestion, helpSeen, loadProgress, markHelpSeen, saveProgress } from "./storage";
import type { Progress, PublicQuiz } from "./types";

const isHan = (ch: string) => /^\p{Script=Han}$/u.test(ch);

/** "/" plays the newest quiz; "/q/<id>" plays that quiz forever. Anything else isn't a quiz. */
function quizIdFromPath(path: string): string | null {
  if (path === "/") return "latest";
  return /^\/q\/([1-9][0-9]*)\/?$/.exec(path)?.[1] ?? null;
}

const isArchivePath = (path: string) => path.replace(/\/$/, "") === ARCHIVE_PATH;

export function App() {
  // Every navigation is a full page load, so the route is fixed for this render tree.
  return isArchivePath(location.pathname) ? <Archive /> : <QuizPage />;
}

function QuizPage() {
  const [quiz, setQuiz] = useState<PublicQuiz | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [typed, setTyped] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [shake, setShake] = useState(0);
  const [animateRow, setAnimateRow] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string) => setToast({ msg, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(() => {
    setLoadError(null);
    const id = quizIdFromPath(location.pathname);
    if (!id) {
      setNotFound(true);
      loadAnalytics();
      return;
    }
    getQuiz(id)
      .then((q) => {
        // Pin the address to this exact quiz, so a refresh or copied URL keeps
        // playing it even after a newer quiz is published.
        if (location.pathname !== quizPath(q.id)) history.replaceState(null, "", quizPath(q.id));
        loadAnalytics();
        setQuiz(q);
        setProgress(loadProgress(q.id));
        if (!helpSeen()) setShowHelp(true);
      })
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
          loadAnalytics();
        } else {
          setLoadError(e.message);
        }
      });
  }, []);

  useEffect(() => {
    // ?reset clears saved progress — a testing aid, so only on local hosts
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    if (isLocal && new URLSearchParams(location.search).has("reset")) {
      clearProgress();
      history.replaceState(null, "", location.pathname);
    }
    load();
  }, [load]);

  const update = (fn: (p: Progress) => Progress) =>
    setProgress((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      saveProgress(next);
      return next;
    });

  const closeHelp = useCallback(() => {
    markHelpSeen();
    setShowHelp(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const current = progress?.current ?? 0;
  useEffect(() => {
    setAnimateRow(null);
    setTyped([]);
    if (inputRef.current) inputRef.current.value = "";
    if (!showHelp) inputRef.current?.focus();
    // Re-run when the quiz first loads too: the input doesn't exist before that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, quiz?.id]);

  if (notFound) {
    return (
      <Shell>
        <div class="center">
          <p>This quiz doesn’t exist.</p>
          <div class="actions">
            <a class="btn primary" href="/">
              Play the latest quiz
            </a>
            <a class="btn" href={ARCHIVE_PATH}>
              See all quizzes
            </a>
          </div>
        </div>
      </Shell>
    );
  }
  if (loadError) {
    return (
      <Shell>
        <div class="center">
          <p>Couldn’t load the quiz. {loadError}</p>
          <button class="btn primary" onClick={load}>
            Try again
          </button>
        </div>
      </Shell>
    );
  }
  if (!quiz || !progress) {
    return (
      <Shell>
        <div class="center muted">Loading…</div>
      </Shell>
    );
  }

  const total = quiz.questions.length;
  const finished = current >= total;
  const question = quiz.questions[Math.min(current, total - 1)];
  const qs = progress.questions[question.id] ?? emptyQuestion();

  const reject = (msg: string) => {
    setShake((s) => s + 1);
    notify(msg);
  };

  async function submit() {
    if (pending || qs.done || !quiz) return;
    const raw = (inputRef.current?.value ?? "").replace(/\s+/g, "");
    const chars = Array.from(raw);
    if (chars.length === 0) return;
    if (!chars.every(isHan)) return reject("Chinese characters only");
    if (chars.length !== question.length) return reject(`The phrase has ${question.length} characters`);

    setPending(true);
    try {
      const r = await postGuess(quiz.id, question.id, raw, qs.token);
      const id = question.id;
      update((p) => {
        const prev = p.questions[id] ?? emptyQuestion();
        return {
          ...p,
          questions: {
            ...p.questions,
            [id]: {
              guesses: [...prev.guesses, { text: raw, marks: r.marks }],
              token: r.token,
              done: r.done,
              solved: r.solved,
              reveal: r.reveal,
            },
          },
        };
      });
      setAnimateRow(qs.guesses.length);
      if (inputRef.current) inputRef.current.value = "";
      setTyped([]);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  const next = () => update((p) => ({ ...p, current: p.current + 1 }));
  const revealDelay = animateRow !== null ? flipDuration(question.length) : 0;

  return (
    <Shell onHelp={() => setShowHelp(true)} quiz={quiz} progress={progress}>
      {finished ? (
        <Summary quiz={quiz} progress={progress} notify={notify} />
      ) : (
        <main class="game">
          <div class="clue" aria-label="Emoji clue">
            {question.emoji}
          </div>

          <Board
            length={question.length}
            maxGuesses={question.maxGuesses}
            guesses={qs.guesses}
            typed={typed}
            active={!qs.done}
            pending={pending}
            shake={shake}
            animateRow={animateRow}
          />

          {qs.done ? (
            <RevealCard state={qs} isLast={current === total - 1} delayMs={revealDelay} onNext={next} />
          ) : (
            <>
              <form
                class="guess-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input
                  ref={inputRef}
                  class="guess-input"
                  lang="zh-CN"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellcheck={false}
                  enterKeyHint="go"
                  placeholder={`Type ${question.length} Chinese characters`}
                  aria-label="Your guess"
                  // readOnly (not disabled) keeps focus, so the phone keyboard stays open
                  readOnly={pending}
                  // Only finished Han characters show in the tiles, so in-progress pinyin is ignored.
                  onInput={(e) => setTyped(Array.from(e.currentTarget.value).filter(isHan))}
                  onKeyDown={(e) => {
                    // Enter while the IME is composing confirms a character; don't submit.
                    if (e.key === "Enter" && (e.isComposing || e.keyCode === 229)) e.preventDefault();
                  }}
                />
                <button class="btn primary" type="submit" disabled={pending}>
                  {pending ? "…" : "Guess"}
                </button>
              </form>
              <TriedChars guesses={qs.guesses} />
              <div class="guesses-left muted">
                {question.maxGuesses - qs.guesses.length} of {question.maxGuesses} guesses left
              </div>
            </>
          )}
        </main>
      )}

      {showHelp && <HelpModal onClose={closeHelp} />}
      {toast && (
        <div class="toast" key={toast.id} role="status">
          {toast.msg}
        </div>
      )}
    </Shell>
  );
}
