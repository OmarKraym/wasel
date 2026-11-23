import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { verifyMetaSignature } from "@/lib/meta/signature";
import { normalizeWebhook } from "@/lib/meta/types";
import { computeRisk } from "@/lib/reputation";

describe("token encryption", () => {
  const key = randomBytes(32).toString("base64");
  it("round-trips and detects tampering", () => {
    const enc = encryptSecret("EAAB-page-token", key);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc, key)).toBe("EAAB-page-token");
    const raw = Buffer.from(enc.slice(3), "base64");
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
    expect(() => decryptSecret(`v1:${raw.toString("base64")}`, key)).toThrow();
  });
  it("rejects wrong key length", () => expect(() => encryptSecret("x", "c2hvcnQ=")).toThrow());
});

describe("verifyMetaSignature", () => {
  const secret = "app-secret";
  const body = '{"object":"page"}';
  const good = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  it("accepts a valid signature", () => expect(verifyMetaSignature(body, good, secret)).toBe(true));
  it("rejects bad / missing signatures", () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(`${body} `, good, secret)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=00", secret)).toBe(false);
  });
});

describe("normalizeWebhook", () => {
  it("maps messenger + echo events", () => {
    const events = normalizeWebhook({
      object: "page",
      entry: [{
        id: "PAGE1", time: 1,
        messaging: [
          { sender: { id: "U1" }, recipient: { id: "PAGE1" }, timestamp: 1, message: { mid: "m1", text: "نبي قطعة", attachments: [{ type: "image", payload: { url: "https://scontent.xx.fbcdn.net/a.jpg" } }] } },
          { sender: { id: "PAGE1" }, recipient: { id: "U1" }, timestamp: 2, message: { mid: "m2", text: "مرحبا", is_echo: true } },
          { sender: { id: "U1" }, recipient: { id: "PAGE1" }, timestamp: 3 },
        ],
      }],
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ platform: "facebook", accountId: "PAGE1", customerId: "U1", isEcho: false });
    expect(events[0]!.attachments).toHaveLength(1);
    expect(events[1]).toMatchObject({ customerId: "U1", isEcho: true });
  });
  it("ignores unknown objects", () => expect(normalizeWebhook({ object: "user", entry: [] })).toEqual([]));
});

describe("computeRisk", () => {
  it.each([
    [null, "unknown"],
    [{ delivered_count: 0, returned_count: 0 }, "unknown"],
    [{ delivered_count: 4, returned_count: 0 }, "low"],
    [{ delivered_count: 5, returned_count: 1 }, "medium"],
    [{ delivered_count: 2, returned_count: 2 }, "high"],
    [{ delivered_count: 20, returned_count: 3 }, "high"],
  ] as const)("%j -> %s", (rep, out) => expect(computeRisk(rep)).toBe(out));
});
