/**
 * Standard Libyan city list used by the AI extractor, the city selector
 * and the delivery-rate table. `name` is the canonical key everywhere
 * (orders.city, merchants.delivery_rates_json).
 */
export interface LibyanCity {
  name: string;
  en: string;
  aliases: string[];
  /** well-known districts / areas that imply this city */
  areas: string[];
}

export const LIBYAN_CITIES: LibyanCity[] = [
  {
    name: "طرابلس", en: "Tripoli",
    aliases: ["طرابلس", "طرابلص", "طرابلس الغرب", "trablus", "tripoli"],
    areas: ["حي الأندلس", "الاندلس", "قرقارش", "سوق الجمعة", "عين زارة", "الهضبة", "الهضبة الشرقية",
      "باب بن غشير", "بن عاشور", "الظهرة", "زاوية الدهماني", "النوفليين", "الفرناج", "صلاح الدين",
      "أبوسليم", "ابوسليم", "السراج", "غوط الشعال", "المنصورة", "شارع الجمهورية", "السياحية", "فشلوم",
      "عرادة", "الدريبي", "قدح", "الحشان", "ذات العماد", "طريق المطار", "الكريمية"],
  },
  { name: "تاجوراء", en: "Tajoura", aliases: ["تاجوراء", "تاجورا", "tajoura"], areas: ["الحميدية", "بئر الأسطى ميلاد"] },
  { name: "جنزور", en: "Janzour", aliases: ["جنزور", "janzour"], areas: ["النجيلة", "الغيران", "السبعة"] },
  {
    name: "بنغازي", en: "Benghazi",
    aliases: ["بنغازي", "بنغازى", "بن غازي", "benghazi"],
    areas: ["الفويهات", "الكيش", "السلماني", "الصابري", "بوعطني", "الحدائق", "الليثي", "قاريونس",
      "سيدي حسين", "البركة", "الماجوري", "الهواري", "قنفودة", "سيدي فرج", "دبي", "طريق النهر",
      "الكويفية", "بودزيرة", "الرحبة", "شبنة", "جليانة", "السرتي"],
  },
  { name: "مصراتة", en: "Misrata", aliases: ["مصراتة", "مصراته", "مصراطة", "misrata", "misurata"], areas: ["الزروق", "قصر أحمد", "الغيران مصراتة", "طمينة", "الدافنية"] },
  { name: "الزاوية", en: "Zawiya", aliases: ["الزاوية", "الزاويه", "زاوية", "zawiya"], areas: ["الحرشة", "جودائم"] },
  { name: "زليتن", en: "Zliten", aliases: ["زليتن", "zliten"], areas: [] },
  { name: "الخمس", en: "Khoms", aliases: ["الخمس", "خمس", "khoms"], areas: ["لبدة"] },
  { name: "صبراتة", en: "Sabratha", aliases: ["صبراتة", "صبراته", "sabratha"], areas: [] },
  { name: "صرمان", en: "Surman", aliases: ["صرمان", "surman"], areas: [] },
  { name: "زوارة", en: "Zuwara", aliases: ["زوارة", "زواره", "zuwara"], areas: [] },
  { name: "العجيلات", en: "Al Ajaylat", aliases: ["العجيلات", "ajaylat"], areas: [] },
  { name: "غريان", en: "Gharyan", aliases: ["غريان", "gharyan"], areas: [] },
  { name: "ترهونة", en: "Tarhuna", aliases: ["ترهونة", "ترهونه", "tarhuna"], areas: [] },
  { name: "مسلاتة", en: "Msallata", aliases: ["مسلاتة", "مسلاته"], areas: [] },
  { name: "بني وليد", en: "Bani Walid", aliases: ["بني وليد", "بنى وليد", "bani walid"], areas: [] },
  { name: "يفرن", en: "Yafran", aliases: ["يفرن", "yafran"], areas: [] },
  { name: "جادو", en: "Jadu", aliases: ["جادو"], areas: [] },
  { name: "نالوت", en: "Nalut", aliases: ["نالوت", "nalut"], areas: [] },
  { name: "سرت", en: "Sirte", aliases: ["سرت", "sirte"], areas: [] },
  { name: "البريقة", en: "Brega", aliases: ["البريقة", "البريقه", "brega"], areas: [] },
  { name: "أجدابيا", en: "Ajdabiya", aliases: ["أجدابيا", "اجدابيا", "ajdabiya"], areas: [] },
  { name: "المرج", en: "Al Marj", aliases: ["المرج", "marj"], areas: [] },
  { name: "البيضاء", en: "Bayda", aliases: ["البيضاء", "البيضا", "bayda"], areas: ["شحات"] },
  { name: "درنة", en: "Derna", aliases: ["درنة", "درنه", "derna"], areas: [] },
  { name: "طبرق", en: "Tobruk", aliases: ["طبرق", "tobruk"], areas: [] },
  { name: "سبها", en: "Sabha", aliases: ["سبها", "sabha", "sebha"], areas: ["المنشية", "الجديد", "القرضة"] },
  { name: "أوباري", en: "Ubari", aliases: ["أوباري", "اوباري", "ubari"], areas: [] },
  { name: "غات", en: "Ghat", aliases: ["غات", "ghat"], areas: [] },
  { name: "مرزق", en: "Murzuq", aliases: ["مرزق", "murzuq"], areas: [] },
  { name: "هون", en: "Hun", aliases: ["هون", "الجفرة", "hun"], areas: ["ودان", "سوكنة"] },
  { name: "الكفرة", en: "Kufra", aliases: ["الكفرة", "الكفره", "kufra"], areas: [] },
];

export const CITY_NAMES: string[] = LIBYAN_CITIES.map((c) => c.name);

/** Light Arabic normalisation for matching: unify alef/ya/ta-marbuta, drop tatweel & diacritics. */
export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "") // harakat
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a free-text city/area mention to a canonical city name, or null. */
export function resolveCity(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = normalizeArabic(text);
  for (const city of LIBYAN_CITIES) {
    if (city.aliases.some((a) => normalizeArabic(a) === t)) return city.name;
  }
  // contained alias, longest first so "طرابلس الغرب" beats "طرابلس"
  const candidates: Array<{ city: string; term: string }> = [];
  for (const city of LIBYAN_CITIES) {
    for (const term of [...city.aliases, ...city.areas]) {
      candidates.push({ city: city.name, term: normalizeArabic(term) });
    }
  }
  candidates.sort((a, b) => b.term.length - a.term.length);
  const words = t.split(/[\s،,.\-_/]+/).filter(Boolean);
  const hit = candidates.find((c) => {
    if (c.term.length >= 6 || c.term.includes(" ")) return t.includes(c.term);
    // short names ("هون", "سرت", "غات"): whole word only, allowing one Arabic
    // proclitic letter (و ب ل ف) e.g. "لسرت", "بغات" — avoids hits inside other words.
    return words.some((w) => w === c.term || (w.length === c.term.length + 1 && /^[وبلف]/.test(w) && w.slice(1) === c.term));
  });
  return hit ? hit.city : null;
}

/** Prompt-friendly reference: "طرابلس (Tripoli) — مناطق: حي الأندلس، قرقارش ..." */
export function citiesForPrompt(): string {
  return LIBYAN_CITIES.map((c) =>
    c.areas.length ? `- ${c.name} (${c.en}) — مناطق: ${c.areas.slice(0, 12).join("، ")}` : `- ${c.name} (${c.en})`,
  ).join("\n");
}
