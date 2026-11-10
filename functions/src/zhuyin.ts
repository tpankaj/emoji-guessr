import { pinyin } from "pinyin-pro";
import { pinyinToZhuyin } from "pinyin-zhuyin";

/**
 * An answer's zhuyin, one syllable per character, separated by spaces ("测试" → "ㄘㄜˋ ㄕˋ").
 * pinyin-pro reads the characters (picking the reading of a polyphonic character from the
 * word around it) and pinyin-zhuyin writes each syllable in zhuyin. Tones are the dictionary
 * ones (no 一/不 tone changes). Every tone mark, the neutral-tone dot included, follows its
 * syllable ("ㄗ˙"); the answer card raises it to the syllable's top right.
 */
export function toZhuyin(answer: string): string {
  return pinyin(answer, { type: "array", toneSandhi: false })
    .map((syllable) => pinyinToZhuyin(syllable))
    .join(" ");
}
