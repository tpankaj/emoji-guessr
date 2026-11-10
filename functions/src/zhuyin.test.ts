import { describe, expect, it } from "vitest";
import { toZhuyin } from "./zhuyin";

describe("toZhuyin", () => {
  it("converts characters to zhuyin, one syllable per character", () => {
    expect(toZhuyin("测试题目")).toBe("ㄘㄜˋ ㄕˋ ㄊㄧˊ ㄇㄨˋ");
  });

  it("puts the neutral-tone dot after the syllable, like the other tone marks", () => {
    expect(toZhuyin("桌子")).toBe("ㄓㄨㄛ ㄗ˙");
  });

  it("reads a polyphonic character from its word", () => {
    expect(toZhuyin("银行")).toBe("ㄧㄣˊ ㄏㄤˊ");
    expect(toZhuyin("行走")).toBe("ㄒㄧㄥˊ ㄗㄡˇ");
  });

  it("keeps the dictionary tones of 一 and 不", () => {
    expect(toZhuyin("一个")).toBe("ㄧ ㄍㄜˋ");
    expect(toZhuyin("不是")).toBe("ㄅㄨˋ ㄕˋ");
  });
});
