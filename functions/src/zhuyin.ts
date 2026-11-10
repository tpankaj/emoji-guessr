import { pinyin } from "pinyin-pro";
import { pinyinToZhuyin } from "pinyin-zhuyin";

/**
 * An answer's zhuyin, one syllable per character, separated by spaces ("测试" → "ㄘㄜˋ ㄕˋ").
 * pinyin-pro reads the characters (picking the reading of a polyphonic character from the
 * word around it) and pinyin-zhuyin writes each syllable in zhuyin. Tones are the dictionary
 * ones (no 一/不 tone changes), and the neutral-tone dot goes in front, as zhuyin is written.
 */
export function toZhuyin(answer: string): string {
  return pinyin(answer, { type: "array", toneSandhi: false })
    .map((syllable) => pinyinToZhuyin(syllable).replace(/^(.+)˙$/, "˙$1"))
    .join(" ");
}
