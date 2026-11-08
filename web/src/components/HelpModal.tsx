import { useEffect, useRef } from "preact/hooks";

export function HelpModal({ maxGuesses, hintAfter, onClose }: { maxGuesses: number; hintAfter: number; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <button ref={closeRef} class="icon-btn close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="help-title">How to play</h2>
        <p>Each puzzle is a Chinese phrase spelled out in emoji. Guess the phrase in {maxGuesses} tries.</p>
        <p>Type with your Chinese (pinyin) keyboard. The empty boxes show how many characters the phrase has.</p>
        <div class="example">
          <div class="row">
            <div class="tile correct">你</div>
            <div class="tile absent">们</div>
          </div>
          <p>
            <b>你</b> is in the phrase and in the right spot. <b>们</b> isn’t in the phrase.
          </p>
          <div class="row">
            <div class="tile present">好</div>
            <div class="tile absent">吃</div>
          </div>
          <p>
            <b>好</b> is in the phrase but in a different spot.
          </p>
        </div>
        <p>
          After {hintAfter} wrong guesses you get a pinyin hint. When you finish every puzzle, share your
          results — they show colours only, no answers.
        </p>
        <button class="btn primary wide" onClick={onClose}>
          Let’s go
        </button>
      </div>
    </div>
  );
}
