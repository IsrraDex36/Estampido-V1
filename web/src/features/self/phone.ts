/**
 * Phone numbers for «vincular con código», standardized per country (LatAm
 * first). People type their number the way they dial it at home; WhatsApp
 * needs it as country code + national number (the server then adds the extra
 * mobile digit WhatsApp keeps for México «521» and Argentina «549»). Pure.
 */
export interface Country {
  iso: string;
  name: string;
  flag: string;
  /** Country calling code (digits). */
  dial: string;
  /** Valid national lengths, without the country code or trunk prefixes. */
  lengths: readonly number[];
  /** Shown as placeholder: a made-up local mobile number. */
  example: string;
}

export const COUNTRIES: readonly Country[] = [
  { iso: "MX", name: "México", flag: "🇲🇽", dial: "52", lengths: [10], example: "229 123 4567" },
  { iso: "PE", name: "Perú", flag: "🇵🇪", dial: "51", lengths: [9], example: "912 345 678" },
  { iso: "CO", name: "Colombia", flag: "🇨🇴", dial: "57", lengths: [10], example: "300 123 4567" },
  { iso: "AR", name: "Argentina", flag: "🇦🇷", dial: "54", lengths: [10], example: "11 2345 6789" },
  { iso: "CL", name: "Chile", flag: "🇨🇱", dial: "56", lengths: [9], example: "9 1234 5678" },
  { iso: "EC", name: "Ecuador", flag: "🇪🇨", dial: "593", lengths: [9], example: "99 123 4567" },
  { iso: "VE", name: "Venezuela", flag: "🇻🇪", dial: "58", lengths: [10], example: "412 123 4567" },
  { iso: "BO", name: "Bolivia", flag: "🇧🇴", dial: "591", lengths: [8], example: "7123 4567" },
  { iso: "PY", name: "Paraguay", flag: "🇵🇾", dial: "595", lengths: [9], example: "981 123 456" },
  { iso: "UY", name: "Uruguay", flag: "🇺🇾", dial: "598", lengths: [8], example: "94 123 456" },
  { iso: "BR", name: "Brasil", flag: "🇧🇷", dial: "55", lengths: [10, 11], example: "11 91234 5678" },
  { iso: "GT", name: "Guatemala", flag: "🇬🇹", dial: "502", lengths: [8], example: "5123 4567" },
  { iso: "SV", name: "El Salvador", flag: "🇸🇻", dial: "503", lengths: [8], example: "7123 4567" },
  { iso: "HN", name: "Honduras", flag: "🇭🇳", dial: "504", lengths: [8], example: "9123 4567" },
  { iso: "NI", name: "Nicaragua", flag: "🇳🇮", dial: "505", lengths: [8], example: "8123 4567" },
  { iso: "CR", name: "Costa Rica", flag: "🇨🇷", dial: "506", lengths: [8], example: "8312 3456" },
  { iso: "PA", name: "Panamá", flag: "🇵🇦", dial: "507", lengths: [8], example: "6123 4567" },
  { iso: "CU", name: "Cuba", flag: "🇨🇺", dial: "53", lengths: [8], example: "5123 4567" },
  { iso: "DO", name: "República Dominicana", flag: "🇩🇴", dial: "1", lengths: [10], example: "809 123 4567" },
  { iso: "PR", name: "Puerto Rico", flag: "🇵🇷", dial: "1", lengths: [10], example: "787 123 4567" },
  { iso: "US", name: "Estados Unidos", flag: "🇺🇸", dial: "1", lengths: [10], example: "212 555 0123" },
  { iso: "ES", name: "España", flag: "🇪🇸", dial: "34", lengths: [9], example: "612 345 678" },
] as const;

export const DEFAULT_COUNTRY = "MX";

export const countryByIso = (iso: string): Country =>
  COUNTRIES.find((c) => c.iso === iso.toUpperCase()) ?? (COUNTRIES[0] as Country);

/** Time zones that name the country unambiguously (when the language has no region). */
const ZONES: Record<string, string> = {
  Lima: "PE",
  Bogota: "CO",
  Santiago: "CL",
  Guayaquil: "EC",
  Caracas: "VE",
  La_Paz: "BO",
  Asuncion: "PY",
  Montevideo: "UY",
  Guatemala: "GT",
  El_Salvador: "SV",
  Tegucigalpa: "HN",
  Managua: "NI",
  Costa_Rica: "CR",
  Panama: "PA",
  Havana: "CU",
  Santo_Domingo: "DO",
  Puerto_Rico: "PR",
  Madrid: "ES",
};

/** Best guess of the person's country: language region (es-PE), then time zone, else México. */
export function guessCountry(language: string | undefined, timeZone: string | undefined): string {
  const region = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(language ?? "")?.[1]?.toUpperCase();
  if (region && COUNTRIES.some((c) => c.iso === region)) return region;
  const tz = timeZone ?? "";
  if (/^America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ciudad_Juarez|Ojinaga|Mazatlan|Bahia_Banderas|Hermosillo|Tijuana)$/.test(tz)) return "MX";
  if (/^America\/Argentina\//.test(tz) || tz === "America/Buenos_Aires") return "AR";
  if (/^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Santarem|Noronha)$/.test(tz)) return "BR";
  const city = tz.split("/").pop() ?? "";
  if (tz.startsWith("America/") || tz.startsWith("Europe/")) {
    const iso = ZONES[city];
    if (iso) return iso;
  }
  return DEFAULT_COUNTRY;
}

export type PhoneCheck =
  | { ok: true; digits: string; national: string }
  | { ok: false; reason: "empty" | "short" | "long"; missing?: number };

/**
 * Country + what the person typed → full number (country code + national).
 * Accepts pasted international numbers (+51 …, 0051 …), drops trunk prefixes
 * (a leading 0; México's old 044/045 and «1»; Argentina's 9 and the 15 after a 0), spaces and symbols.
 */
export function composePhone(country: Country, raw: string): PhoneCheck {
  let d = raw.replace(/\D/g, "");
  const intl = /^\s*(\+|00)/.test(raw);
  if (d.startsWith("00")) d = d.slice(2);
  // Pasted with the country code (with or without +) when the result has a valid length.
  if (d.startsWith(country.dial)) {
    const rest = d.slice(country.dial.length);
    if (intl || fits(country, normalizeNational(country, rest))) d = rest;
  }
  const national = normalizeNational(country, d);
  if (!national) return { ok: false, reason: "empty" };
  const min = Math.min(...country.lengths);
  const max = Math.max(...country.lengths);
  if (national.length < min) return { ok: false, reason: "short", missing: min - national.length };
  if (national.length > max) return { ok: false, reason: "long" };
  return { ok: true, digits: `${country.dial}${national}`, national };
}

const fits = (c: Country, national: string) => c.lengths.includes(national.length);

function normalizeNational(country: Country, d: string): string {
  let n = d;
  if (country.iso === "MX") {
    if (/^04[45]\d{10}$/.test(n)) n = n.slice(3); // old mobile dialing
    if (/^1\d{10}$/.test(n)) n = n.slice(1); // «52 1 …» typed by habit (the server adds it back)
  }
  if (country.iso === "AR" && /^9\d{10}$/.test(n)) n = n.slice(1); // «+54 9 …» as WhatsApp shows it (the server adds it back)
  if (country.iso === "AR" && /^0\d{2,4}15\d{6,8}$/.test(n)) {
    // 0 + area + 15 + local → area + local (mobile written for local dialing)
    const m = /^0(\d{2,4})15(\d{6,8})$/.exec(n);
    if (m && (m[1] as string).length + (m[2] as string).length === 10) n = `${m[1]}${m[2]}`;
  }
  if (country.dial !== "1" && /^0/.test(n) && !fits(country, n)) n = n.replace(/^0+/, ""); // trunk 0
  return n;
}

/** «Faltan 2 dígitos» / «Sobran dígitos» / null when fine or empty. */
export function phoneHint(country: Country, check: PhoneCheck): string | null {
  if (check.ok || check.reason === "empty") return null;
  if (check.reason === "long") return `Sobran dígitos: en ${country.name} son ${country.lengths.join(" u ")}.`;
  return `Faltan ${check.missing} dígito${check.missing === 1 ? "" : "s"} (${country.name}: ${country.lengths.join(" u ")}).`;
}
