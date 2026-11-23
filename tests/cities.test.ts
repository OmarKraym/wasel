import { describe, expect, it } from "vitest";
import { resolveCity } from "@/lib/libya/cities";

describe("resolveCity", () => {
  it.each([
    ["طرابلس", "طرابلس"],
    ["لطرابلس", "طرابلس"],
    ["بنغازي الفويهات", "بنغازي"],
    ["الفويهات قدام الجامع", "بنغازي"],
    ["حي الأندلس", "طرابلس"],
    ["مصراته", "مصراتة"],
    ["الزاويه", "الزاوية"],
    ["Benghazi", "بنغازي"],
    ["ساكن في سرت", "سرت"],
  ])("%s -> %s", (input, out) => expect(resolveCity(input)).toBe(out));

  it("does not match short names inside other words", () => {
    expect(resolveCity("الخمسين")).toBeNull();
    expect(resolveCity("تلفون")).toBeNull();
  });
  it("returns null for unknown", () => expect(resolveCity("باريس")).toBeNull());
});
