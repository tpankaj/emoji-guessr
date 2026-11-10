// Converts tone-marked pinyin ("cè shì") to zhuyin / bopomofo ("ㄘㄜˋ ㄕˋ").
// Runs in the browser on the revealed pinyin, so no puzzle data lives here.

const INITIALS: [string, string][] = [
  ["zh", "ㄓ"], ["ch", "ㄔ"], ["sh", "ㄕ"],
  ["b", "ㄅ"], ["p", "ㄆ"], ["m", "ㄇ"], ["f", "ㄈ"],
  ["d", "ㄉ"], ["t", "ㄊ"], ["n", "ㄋ"], ["l", "ㄌ"],
  ["g", "ㄍ"], ["k", "ㄎ"], ["h", "ㄏ"],
  ["j", "ㄐ"], ["q", "ㄑ"], ["x", "ㄒ"],
  ["r", "ㄖ"], ["z", "ㄗ"], ["c", "ㄘ"], ["s", "ㄙ"],
];

const FINALS: Record<string, string> = {
  a: "ㄚ", o: "ㄛ", e: "ㄜ", "ê": "ㄝ", ai: "ㄞ", ei: "ㄟ", ao: "ㄠ", ou: "ㄡ",
  an: "ㄢ", en: "ㄣ", ang: "ㄤ", eng: "ㄥ", ong: "ㄨㄥ", er: "ㄦ",
  i: "ㄧ", ia: "ㄧㄚ", io: "ㄧㄛ", ie: "ㄧㄝ", iao: "ㄧㄠ", iu: "ㄧㄡ",
  ian: "ㄧㄢ", in: "ㄧㄣ", iang: "ㄧㄤ", ing: "ㄧㄥ", iong: "ㄩㄥ",
  u: "ㄨ", ua: "ㄨㄚ", uo: "ㄨㄛ", uai: "ㄨㄞ", ui: "ㄨㄟ",
  uan: "ㄨㄢ", un: "ㄨㄣ", uang: "ㄨㄤ", ueng: "ㄨㄥ",
  "ü": "ㄩ", "üe": "ㄩㄝ", "üan": "ㄩㄢ", "ün": "ㄩㄣ",
};

// Syllables written with y- or w- and no consonant.
const Y_W: Record<string, string> = {
  yi: "i", ya: "ia", yo: "io", ye: "ie", yao: "iao", you: "iu", yan: "ian",
  yin: "in", yang: "iang", ying: "ing", yong: "iong",
  yu: "ü", yue: "üe", yuan: "üan", yun: "ün",
  wu: "u", wa: "ua", wo: "uo", wai: "uai", wei: "ui", wan: "uan",
  wen: "un", wang: "uang", weng: "ueng",
};

// zhi, chi, shi, ri, zi, ci, si: the -i is not written in zhuyin.
const BARE_I = new Set(["zh", "ch", "sh", "r", "z", "c", "s"]);

// Tone marks on vowels → [plain vowel, tone].
const MARKED: Record<string, [string, number]> = {};
for (const [plain, marks] of Object.entries({
  a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", "ü": "ǖǘǚǜ"
})) {
  [...marks].forEach((m, i) => (MARKED[m] = [plain, i + 1]));
}

const TONE_SYMBOL = ["", "", "ˊ", "ˇ", "ˋ"];

/** One syllable without its tone ("zhuang", "lü") → zhuyin, or null if it isn't one. */
function baseToZhuyin(base: string): string | null {
  if (base === "") return null;
  if (Y_W[base]) return FINALS[Y_W[base]];
  if (FINALS[base] && !/^[iuü]|^ong$/.test(base)) return FINALS[base]; // a, ai, er, ...
  // Erhua: "huar" → ㄏㄨㄚㄦ.
  if (base.length > 2 && base.endsWith("r")) {
    const inner = baseToZhuyin(base.slice(0, -1));
    return inner && inner + "ㄦ";
  }
  const initial = INITIALS.find(([py]) => base.startsWith(py));
  if (!initial) return null;
  let final = base.slice(initial[0].length);
  if (final === "i" && BARE_I.has(initial[0])) return initial[1];
  if (/^[jqx]/.test(initial[0]) && final.startsWith("u")) final = "ü" + final.slice(1);
  if (final === "er" || final === "ê" || !FINALS[final]) return null;
  return initial[1] + FINALS[final];
}

interface Syllable {
  zhuyin: string;
  /** 1–4, 5 for neutral (unmarked), 0 when the text has no tones at all. */
  tone: number;
}

/** One syllable as written ("zhuāng", "lü4", "lv") → zhuyin and tone, or null. */
function syllable(text: string): Syllable | null {
  let tone = 0;
  let base = "";
  const chars = [...text.toLowerCase().normalize("NFC").replace(/u:|v/g, "ü")];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (MARKED[c]) {
      if (tone) return null;
      [base, tone] = [base + MARKED[c][0], MARKED[c][1]];
    } else if (/[1-5]/.test(c) && i === chars.length - 1) {
      if (tone) return null;
      tone = Number(c);
    } else {
      base += c;
    }
  }
  const zhuyin = baseToZhuyin(base);
  return zhuyin ? { zhuyin, tone } : null;
}

/** Splits a run of letters into syllables, longest match first ("xīān" → xī ān). */
function split(word: string): Syllable[] | null {
  if (word === "") return [];
  for (let len = Math.min(word.length, 7); len > 0; len--) {
    const head = syllable(word.slice(0, len));
    if (!head) continue;
    const rest = split(word.slice(len));
    if (rest) return [head, ...rest];
  }
  return null;
}

/**
 * Tone-marked pinyin → zhuyin, syllables separated by spaces ("nǐ hǎo" → "ㄋㄧˇ ㄏㄠˇ").
 * Unmarked syllables are neutral tone (˙ in front), unless the pinyin has no tones at all.
 * Returns null if any part isn't pinyin, so the page can simply leave it out.
 */
export function pinyinToZhuyin(pinyin: string): string | null {
  const words = pinyin
    .normalize("NFC")
    .split(/[\s'’\-.,!?;:，。！？；：、]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  const syllables: Syllable[] = [];
  for (const word of words) {
    const parts = split(word);
    if (!parts) return null;
    syllables.push(...parts);
  }
  const hasTones = syllables.some((s) => s.tone);
  return syllables
    .map(({ zhuyin, tone }) => {
      if (!hasTones) return zhuyin;
      if (tone === 0 || tone === 5) return "˙" + zhuyin;
      return zhuyin + TONE_SYMBOL[tone];
    })
    .join(" ");
}
