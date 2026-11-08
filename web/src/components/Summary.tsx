import { buildShareText, shareText, solvedCount } from "../share";
import type { Progress, PublicQuiz } from "../types";

interface Props {
  quiz: PublicQuiz;
  progress: Progress;
  notify: (msg: string) => void;
}

export function Summary({ quiz, progress, notify }: Props) {
  const solved = solvedCount(quiz, progress);
  const total = quiz.questions.length;
  const text = buildShareText(quiz, progress, `${location.origin}/`);

  async function onShare() {
    const outcome = await shareText(text);
    if (outcome === "copied") notify("Copied results to clipboard");
    else if (outcome === "failed") notify("Couldn’t copy — select the text above instead");
  }

  return (
    <div class="summary">
      <h2>
        {solved === total ? "全对！" : solved === 0 ? "再接再厉！" : "完成！"} You solved {solved} of {total}
      </h2>

      <pre class="share-preview" aria-label="Share text">
        {text}
      </pre>
      <button class="btn primary wide share" onClick={onShare}>
        Share results
      </button>

      <h3>Answers</h3>
      <ul class="answers">
        {quiz.questions.map((q) => {
          const s = progress.questions[q.id];
          return (
            <li key={q.id}>
              <span class="emoji">{q.emoji}</span>
              <span class="answer" lang="zh-CN">
                {s?.reveal?.answer ?? "？"}
              </span>
              <span class="pinyin">{s?.reveal?.pinyin}</span>
              <span class="meaning">{s?.reveal?.meaning}</span>
              <span class={`badge ${s?.solved ? "ok" : "miss"}`}>
                {s?.solved ? `${s.guesses.length}/${q.maxGuesses}` : "✗"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
