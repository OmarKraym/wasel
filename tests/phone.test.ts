import { describe, expect, it } from "vitest";
import { hashPhone, maskPhone, normalizeLibyanPhone } from "@/lib/phone";

describe("normalizeLibyanPhone", () => {
  it.each([
    ["0912345678", "0912345678"],
    ["+218 91 234 5678", "0912345678"],
    ["00218-92-1234567", "0921234567"],
    ["218941234567", "0941234567"],
    ["912345678", "0912345678"],
    ["٠٩٢١٢٣٤٥٦٧", "0921234567"],
    ["۰۹۳۱۲۳۴۵۶۷", "0931234567"],
  ])("%s -> %s", (input, out) => expect(normalizeLibyanPhone(input)).toBe(out));

  it.each(["0212345678", "091234567", "09712345678", "", null, "abc"])("rejects %s", (input) =>
    expect(normalizeLibyanPhone(input as string | null)).toBeNull(),
  );
});

describe("hashPhone", () => {
  const pepper = "a-very-long-test-pepper-value";
  it("is deterministic, hex, and keyed", () => {
    const a = hashPhone("0912345678", pepper);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPhone("0912345678", pepper)).toBe(a);
    expect(hashPhone("0912345678", `${pepper}x`)).not.toBe(a);
  });
  it("refuses un-normalised input and weak pepper", () => {
    expect(() => hashPhone("+218912345678", pepper)).toThrow();
    expect(() => hashPhone("0912345678", "short")).toThrow();
  });
  it("masks", () => expect(maskPhone("0912345678")).toBe("091****678"));
});
