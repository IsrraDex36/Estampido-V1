import { describe, expect, it } from "vitest";
import { toWhatsAppNumber } from "../../src/adapters/bot/pairing.js";
import { COUNTRIES, composePhone, countryByIso, guessCountry, phoneHint } from "../../web/src/features/self/phone.js";

const c = countryByIso;
const full = (iso: string, raw: string) => {
  const r = composePhone(c(iso), raw);
  return r.ok ? r.digits : r.reason;
};
/** What WhatsApp finally gets (web composes, server converts). */
const wa = (iso: string, raw: string) => {
  const r = composePhone(c(iso), raw);
  return r.ok ? toWhatsAppNumber(r.digits) : r.reason;
};

describe("country list", () => {
  it("covers LatAm + España + EE. UU., unique ISO, digits-only codes, valid examples", () => {
    const isos = COUNTRIES.map((x) => x.iso);
    expect(new Set(isos).size).toBe(isos.length);
    for (const iso of [
      "MX",
      "PE",
      "CO",
      "AR",
      "CL",
      "EC",
      "VE",
      "BO",
      "PY",
      "UY",
      "BR",
      "GT",
      "SV",
      "HN",
      "NI",
      "CR",
      "PA",
      "CU",
      "DO",
      "PR",
      "US",
      "ES",
    ]) {
      expect(isos).toContain(iso);
    }
    for (const x of COUNTRIES) {
      expect(x.dial).toMatch(/^\d{1,3}$/);
      // Every placeholder is itself a valid number for its country.
      expect(composePhone(x, x.example).ok, `${x.iso} example`).toBe(true);
      const total = x.dial.length + Math.max(...x.lengths);
      expect(total).toBeLessThanOrEqual(15); // E.164
    }
  });
});

describe("what people type → what WhatsApp gets", () => {
  it.each([
    // México: plain, spaced, with +52, with the habitual 1, old 044/045 → always 521 + 10
    ["MX", "229 123 4567", "5212291234567"],
    ["MX", "(229) 123-4567", "5212291234567"],
    ["MX", "+52 229 123 4567", "5212291234567"],
    ["MX", "+52 1 229 123 4567", "5212291234567"],
    ["MX", "1 229 123 4567", "5212291234567"],
    ["MX", "044 229 123 4567", "5212291234567"],
    ["MX", "522291234567", "5212291234567"],
    ["MX", "0052 229 123 4567", "5212291234567"],
    // Perú: 9 digits, mobiles start with 9
    ["PE", "912 345 678", "51912345678"],
    ["PE", "+51 912 345 678", "51912345678"],
    ["PE", "51912345678", "51912345678"],
    // Colombia
    ["CO", "300 123 4567", "573001234567"],
    ["CO", "+57 300 123 4567", "573001234567"],
    // Argentina: area + number; «0 11 15 …» local dialing → 549 + area + number
    ["AR", "11 2345 6789", "5491123456789"],
    ["AR", "011 15 2345 6789", "5491123456789"],
    ["AR", "+54 9 11 2345 6789", "5491123456789"],
    // Chile, Ecuador (trunk 0 dropped), Venezuela (0 dropped), Bolivia, Paraguay, Uruguay
    ["CL", "9 1234 5678", "56912345678"],
    ["EC", "099 123 4567", "593991234567"],
    ["VE", "0412 123 4567", "584121234567"],
    ["BO", "7123 4567", "59171234567"],
    ["PY", "0981 123 456", "595981123456"],
    ["UY", "094 123 456", "59894123456"],
    // Brasil: 10 or 11 digits
    ["BR", "11 91234 5678", "5511912345678"],
    ["BR", "11 1234 5678", "551112345678"],
    // Centroamérica y Caribe
    ["GT", "5123 4567", "50251234567"],
    ["CR", "8312 3456", "50683123456"],
    ["PA", "6123 4567", "50761234567"],
    ["DO", "809 123 4567", "18091234567"],
    ["US", "+1 (212) 555-0123", "12125550123"],
    ["ES", "612 34 56 78", "34612345678"],
  ])("%s «%s» → %s", (iso, raw, expected) => {
    expect(wa(iso, raw)).toBe(expected);
  });

  it("wrong lengths are caught before asking WhatsApp (with a clear hint)", () => {
    expect(full("PE", "912 345")).toBe("short");
    expect(full("MX", "229 123 45678 9")).toBe("long");
    expect(full("MX", "")).toBe("empty");
    expect(full("MX", "abc")).toBe("empty");
    expect(phoneHint(c("PE"), composePhone(c("PE"), "9123"))).toBe("Faltan 5 dígitos (Perú: 9).");
    expect(phoneHint(c("PE"), composePhone(c("PE"), "91234567"))).toBe("Faltan 1 dígito (Perú: 9).");
    expect(phoneHint(c("BR"), composePhone(c("BR"), "1191234567890"))).toMatch(/Sobran dígitos: en Brasil son 10 u 11/);
    expect(phoneHint(c("MX"), composePhone(c("MX"), ""))).toBeNull();
    expect(phoneHint(c("MX"), composePhone(c("MX"), "2291234567"))).toBeNull();
  });

  it("a number that merely starts like the country code is not mangled", () => {
    // Perú mobile «51…»? (9 digits starting with 51 isn't stripped: the result would be too short)
    expect(full("PE", "519 123 456")).toBe("51519123456");
    // Colombia «57…» landline-like 10-digit national stays
    expect(full("CO", "571 234 5678")).toBe("575712345678");
  });
});

describe("country guess", () => {
  it.each([
    ["es-PE", "America/Lima", "PE"],
    ["es-MX", "America/Mexico_City", "MX"],
    ["es", "America/Lima", "PE"],
    ["es", "America/Bogota", "CO"],
    ["es", "America/Argentina/Buenos_Aires", "AR"],
    ["pt", "America/Sao_Paulo", "BR"],
    ["es", "America/Monterrey", "MX"],
    ["es", "America/Tijuana", "MX"],
    ["es", "Europe/Madrid", "ES"],
    ["es-419", "America/Caracas", "VE"],
    ["en-US", "America/New_York", "US"],
    ["es", "Asia/Tokyo", "MX"], // unknown → México (default)
    [undefined, undefined, "MX"],
    ["fr-FR", "Europe/Paris", "MX"], // region not in the list → default
  ])("%s · %s → %s", (lang, tz, iso) => {
    expect(guessCountry(lang, tz)).toBe(iso);
  });

  it("unknown ISO falls back to the first country (México)", () => {
    expect(countryByIso("ZZ").iso).toBe("MX");
    expect(countryByIso("pe").iso).toBe("PE");
  });
});
