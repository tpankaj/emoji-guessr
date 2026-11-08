import type { Guess, Mark } from "../types";

const FLIP_STAGGER_MS = 250;

interface TileProps {
  char?: string;
  mark?: Mark;
  index: number;
  animate?: boolean;
}

function Tile({ char, mark, index, animate }: TileProps) {
  const cls = ["tile", char ? "filled" : "", mark ?? "", mark && animate ? "flip" : ""]
    .filter(Boolean)
    .join(" ");
  const style = mark && animate ? { animationDelay: `${index * FLIP_STAGGER_MS}ms` } : undefined;
  return (
    <div class={cls} style={style} aria-label={mark ? `${char} ${mark}` : char}>
      {char}
    </div>
  );
}

interface BoardProps {
  length: number;
  maxGuesses: number;
  guesses: Guess[];
  typed: string[];
  active: boolean;
  pending: boolean;
  shake: number;
  animateRow: number | null;
}

export function Board(props: BoardProps) {
  const { length, maxGuesses, guesses, typed, active, pending, shake, animateRow } = props;
  const cols = Array.from({ length }, (_, i) => i);

  return (
    <div class="board" style={{ "--cols": length }} role="grid" aria-label="Guesses">
      {Array.from({ length: maxGuesses }, (_, r) => {
        const guess = guesses[r];
        if (guess) {
          const chars = Array.from(guess.text);
          return (
            <div class="row" key={`g${r}`} role="row">
              {cols.map((i) => (
                <Tile key={i} index={i} char={chars[i]} mark={guess.marks[i]} animate={animateRow === r} />
              ))}
            </div>
          );
        }
        if (r === guesses.length && active) {
          const cls = ["row", "active", pending ? "pending" : "", shake ? "shake" : ""].join(" ");
          return (
            <div class={cls} key={`a${shake}`} role="row">
              {cols.map((i) => (
                <Tile key={i} index={i} char={typed[i]} />
              ))}
            </div>
          );
        }
        return (
          <div class="row" key={`e${r}`} role="row">
            {cols.map((i) => (
              <Tile key={i} index={i} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export const flipDuration = (length: number) => length * FLIP_STAGGER_MS + 500;
