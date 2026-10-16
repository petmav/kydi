/** Locale reference data derived from the runtime's Intl implementation. */

const COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GI GL GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW".split(
    " ",
  );

let countryCache: { value: string; label: string }[] | null = null;
export function countryOptions() {
  if (!countryCache) {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    countryCache = COUNTRY_CODES.map((c) => ({ value: c, label: names.of(c) ?? c })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }
  return countryCache;
}

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "INR", "SEK", "NOK", "DKK", "PLN", "BRL", "MXN", "ZAR", "SGD", "NZD", "AED"];

let currencyCache: { value: string; label: string }[] | null = null;
export function currencyOptions() {
  if (!currencyCache) {
    const names = new Intl.DisplayNames(["en"], { type: "currency" });
    const all = Intl.supportedValuesOf("currency");
    const toOpt = (c: string) => ({ value: c, label: `${c} — ${names.of(c) ?? c}` });
    currencyCache = [
      ...COMMON_CURRENCIES.filter((c) => all.includes(c)).map(toOpt),
      ...all.filter((c) => !COMMON_CURRENCIES.includes(c)).map(toOpt),
    ];
  }
  return currencyCache;
}

export function isCurrency(code: string): boolean {
  return Intl.supportedValuesOf("currency").includes(code);
}

let tzCache: { value: string; label: string }[] | null = null;
export function timezoneOptions() {
  if (!tzCache) {
    tzCache = ["UTC", ...Intl.supportedValuesOf("timeZone").filter((t) => t !== "UTC")].map((t) => ({
      value: t,
      label: t.replace(/_/g, " "),
    }));
  }
  return tzCache;
}

export function isTimezone(tz: string): boolean {
  return tz === "UTC" || Intl.supportedValuesOf("timeZone").includes(tz);
}

export const DATE_FORMATS = [
  { value: "yyyy-MM-dd", label: "2026-03-31 (ISO)" },
  { value: "dd/MM/yyyy", label: "31/03/2026" },
  { value: "MM/dd/yyyy", label: "03/31/2026" },
  { value: "dd.MM.yyyy", label: "31.03.2026" },
  { value: "d MMM yyyy", label: "31 Mar 2026" },
  { value: "MMM d, yyyy", label: "Mar 31, 2026" },
] as const;

export const LOCALES = [
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "fr-FR", label: "Français (France)" },
  { value: "es-ES", label: "Español (España)" },
  { value: "it-IT", label: "Italiano (Italia)" },
  { value: "nl-NL", label: "Nederlands (Nederland)" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "el-GR", label: "Ελληνικά (Ελλάδα)" },
  { value: "sv-SE", label: "Svenska (Sverige)" },
  { value: "pl-PL", label: "Polski (Polska)" },
  { value: "ja-JP", label: "日本語 (日本)" },
] as const;

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((m, i) => ({ value: String(i + 1), label: m }));
