import { useEffect, useRef } from "preact/hooks";
import type { QuestionState } from "../types";
import { pinyinToZhuyin } from "../zhuyin";

// Indexed by guesses used (1 → 天才, 5 → 好险)
const PRAISE = ["天才！", "太棒了！", "厉害！", "不错！", "好险！"];

interface Props {
  state: QuestionState;
  isLast: boolean;
  delayMs: number;
  onNext: () => void;
}

export function RevealCard({ state, isLast, delayMs, onNext }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const t = setTimeout(() => btnRef.current?.focus(), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  if (!state.reveal) return null;
  const { answer, pinyin, meaning } = state.reveal;
  const zhuyin = pinyinToZhuyin(pinyin);
  const n = state.guesses.length;
  const headline = state.solved ? PRAISE[Math.min(n, PRAISE.length) - 1] : "下次加油！";

  return (
    <div class="reveal" style={{ animationDelay: `${delayMs}ms` }} aria-live="polite">
      <div class="reveal-head">
        {headline}
        <span class="muted">{state.solved ? ` Solved in ${n}` : " Out of guesses"}</span>
      </div>
      <div class="reveal-answer" lang="zh-CN">
        {answer}
      </div>
      <div class="reveal-pinyin">{pinyin}</div>
      {zhuyin && (
        <div class="reveal-zhuyin" lang="zh-TW">
          {zhuyin}
        </div>
      )}
      <div class="reveal-meaning">{meaning}</div>
      <button ref={btnRef} class="btn primary wide" onClick={onNext}>
        {isLast ? "See results" : "Next puzzle →"}
      </button>
    </div>
  );
}
