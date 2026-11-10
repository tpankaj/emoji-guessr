import { describe, expect, it } from "vitest";
import { pinyinToZhuyin } from "./zhuyin";

describe("pinyinToZhuyin", () => {
  it("converts tone-marked syllables", () => {
    expect(pinyinToZhuyin("cè shì tí mù")).toBe("ㄘㄜˋ ㄕˋ ㄊㄧˊ ㄇㄨˋ");
    expect(pinyinToZhuyin("nǐ hǎo")).toBe("ㄋㄧˇ ㄏㄠˇ");
    expect(pinyinToZhuyin("zhuāng")).toBe("ㄓㄨㄤ");
  });

  it("handles y-, w-, ü and j/q/x + u", () => {
    expect(pinyinToZhuyin("yī wǔ yuán yòng wēng")).toBe("ㄧ ㄨˇ ㄩㄢˊ ㄩㄥˋ ㄨㄥ");
    expect(pinyinToZhuyin("lǜ nǚ lüè")).toBe("ㄌㄩˋ ㄋㄩˇ ㄌㄩㄝˋ");
    expect(pinyinToZhuyin("jú qù xuě")).toBe("ㄐㄩˊ ㄑㄩˋ ㄒㄩㄝˇ");
  });

  it("drops the -i of zhi/chi/shi/ri/zi/ci/si", () => {
    expect(pinyinToZhuyin("zhī chī shí rì zǐ cí sì")).toBe("ㄓ ㄔ ㄕˊ ㄖˋ ㄗˇ ㄘˊ ㄙˋ");
  });

  it("marks unmarked syllables as neutral tone", () => {
    expect(pinyinToZhuyin("zhuō zi")).toBe("ㄓㄨㄛ ˙ㄗ");
  });

  it("leaves tones off when the pinyin has none", () => {
    expect(pinyinToZhuyin("ni hao")).toBe("ㄋㄧ ㄏㄠ");
  });

  it("splits joined syllables and apostrophes", () => {
    expect(pinyinToZhuyin("cèshì")).toBe("ㄘㄜˋ ㄕˋ");
    expect(pinyinToZhuyin("xī'ān")).toBe("ㄒㄧ ㄢ");
    expect(pinyinToZhuyin("Xīān")).toBe("ㄒㄧ ㄢ");
  });

  it("accepts tone numbers, v and capitals", () => {
    expect(pinyinToZhuyin("Ni3 hao3")).toBe("ㄋㄧˇ ㄏㄠˇ");
    expect(pinyinToZhuyin("lv4")).toBe("ㄌㄩˋ");
  });

  it("handles erhua and punctuation", () => {
    expect(pinyinToZhuyin("huār")).toBe("ㄏㄨㄚㄦ");
    expect(pinyinToZhuyin("ér")).toBe("ㄦˊ");
    expect(pinyinToZhuyin("hǎo, hǎo!")).toBe("ㄏㄠˇ ㄏㄠˇ");
  });

  it("returns null for anything that isn't pinyin", () => {
    expect(pinyinToZhuyin("")).toBeNull();
    expect(pinyinToZhuyin("hello world")).toBeNull();
    expect(pinyinToZhuyin("nǐǎ")).toBe("ㄋㄧˇ ㄚˇ");
    expect(pinyinToZhuyin("ōng")).toBeNull();
  });
});
