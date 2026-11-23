import { describe, expect, it } from "vitest";
import { cleanExtraction, computeMissing, extractPhonesFromText, mergeDraft, type DraftFields } from "@/lib/orders/draft";

const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";

const raw = {
  customer_name: " سارة ",
  phone_primary: "+218 92 123 4567",
  phone_secondary: null,
  city: "الفويهات",
  address_details: "قدام مسجد الصحابة",
  matched_items: [
    { product_id: P1, quantity: 2 },
    { product_id: "hallucinated-id", quantity: 1 },
    { product_id: P1, quantity: 1 },
  ],
  payment_method: null,
};

describe("cleanExtraction", () => {
  it("normalises phone, resolves city, drops unknown products, merges quantities", () => {
    const d = cleanExtraction(raw, { catalogIds: new Set([P1, P2]), customerText: "" });
    expect(d.customer_name).toBe("سارة");
    expect(d.phone_primary).toBe("0921234567");
    expect(d.city).toBe("بنغازي");
    expect(d.items).toEqual([{ product_id: P1, quantity: 3 }]);
  });
  it("falls back to regex phones from customer text", () => {
    const d = cleanExtraction(
      { ...raw, phone_primary: null },
      { catalogIds: new Set([P1]), customerText: "رقمي 0912345678 والثاني ٠٩٤٧٦٥٤٣٢١" },
    );
    expect(d.phone_primary).toBe("0912345678");
    expect(d.phone_secondary).toBe("0947654321");
  });
});

describe("mergeDraft", () => {
  const existing: DraftFields = {
    customer_name: "علي",
    phone_primary: "0911111111",
    phone_secondary: null,
    city: "طرابلس",
    address_details: "قرقارش",
    items: [{ product_id: P2, quantity: 1 }],
    payment_method: "COD",
  };
  const incoming: DraftFields = {
    customer_name: null,
    phone_primary: "0922222222",
    phone_secondary: null,
    city: "بنغازي",
    address_details: null,
    items: [],
    payment_method: null,
  };
  it("never replaces known values with null and keeps items when AI found none", () => {
    const m = mergeDraft(existing, incoming, []);
    expect(m.customer_name).toBe("علي");
    expect(m.phone_primary).toBe("0922222222");
    expect(m.items).toEqual(existing.items);
  });
  it("respects merchant-locked fields", () => {
    const m = mergeDraft(existing, incoming, ["city", "phone_primary"]);
    expect(m.city).toBe("طرابلس");
    expect(m.phone_primary).toBe("0911111111");
  });
});

describe("computeMissing / extractPhonesFromText", () => {
  it("lists missing fields", () => {
    expect(
      computeMissing({ customer_name: null, phone_primary: null, phone_secondary: null, city: "طرابلس", address_details: null, items: [], payment_method: null }),
    ).toEqual(["customer_name", "phone_primary", "address_details", "items"]);
  });
  it("finds phones in mixed text", () => {
    expect(extractPhonesFromText("كلمني على 218-91-234-5678 بعد العصر")).toEqual(["0912345678"]);
  });
});
