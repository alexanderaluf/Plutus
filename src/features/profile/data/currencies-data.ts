import {
  currencySearchAliases,
  currencyTranslations,
} from "./currency-translations";

export type CurrencyOption = {
  code: string;
  /** Canonical English name; this is the value persisted on profile records. */
  name: string;
  symbol: string;
};

// National and regional fiat currencies from the supplied catalog, including legacy codes.
// Bundled locally for offline use; excludes crypto, metals, and accounting units.
const currencyNames: Record<string, string> = {
  aed: "Emirati Dirham",
  afn: "Afghan Afghani",
  all: "Albanian Lek",
  amd: "Armenian Dram",
  ang: "Dutch Guilder",
  aoa: "Angolan Kwanza",
  ars: "Argentine Peso",
  ats: "Austrian Schilling",
  aud: "Australian Dollar",
  awg: "Aruban or Dutch Guilder",
  azm: "Azerbaijani Manat",
  azn: "Azerbaijan Manat",
  bam: "Bosnian Convertible Mark",
  bbd: "Barbadian or Bajan Dollar",
  bdt: "Bangladeshi Taka",
  bef: "Belgian Franc",
  bgn: "Bulgarian Lev",
  bhd: "Bahraini Dinar",
  bif: "Burundian Franc",
  bmd: "Bermudian Dollar",
  bnd: "Bruneian Dollar",
  bob: "Bolivian Bolíviano",
  brl: "Brazilian Real",
  bsd: "Bahamian Dollar",
  btn: "Bhutanese Ngultrum",
  bwp: "Botswana Pula",
  byn: "Belarusian Ruble",
  byr: "Belarusian Ruble",
  bzd: "Belizean Dollar",
  cad: "Canadian Dollar",
  cdf: "Congolese Franc",
  chf: "Swiss Franc",
  clp: "Chilean Peso",
  cnh: "Chinese Yuan Renminbi Offshore",
  cny: "Chinese Yuan Renminbi",
  cop: "Colombian Peso",
  crc: "Costa Rican Colon",
  cuc: "Cuban Convertible Peso",
  cup: "Cuban Peso",
  cve: "Cape Verdean Escudo",
  cyp: "Cypriot Pound",
  czk: "Czech Koruna",
  dem: "German Deutsche Mark",
  djf: "Djiboutian Franc",
  dkk: "Danish Krone",
  dop: "Dominican Peso",
  dzd: "Algerian Dinar",
  eek: "Estonian Kroon",
  egp: "Egyptian Pound",
  ern: "Eritrean Nakfa",
  esp: "Spanish Peseta",
  etb: "Ethiopian Birr",
  eur: "Euro",
  fim: "Finnish Markka",
  fjd: "Fijian Dollar",
  fkp: "Falkland Island Pound",
  frf: "French Franc",
  gbp: "British Pound",
  gel: "Georgian Lari",
  ggp: "Guernsey Pound",
  ghc: "Ghanaian Cedi",
  ghs: "Ghanaian Cedi",
  gip: "Gibraltar Pound",
  gmd: "Gambian Dalasi",
  gnf: "Guinean Franc",
  grd: "Greek Drachma",
  gtq: "Guatemalan Quetzal",
  gyd: "Guyanese Dollar",
  hkd: "Hong Kong Dollar",
  hnl: "Honduran Lempira",
  hrk: "Croatian Kuna",
  htg: "Haitian Gourde",
  huf: "Hungarian Forint",
  idr: "Indonesian Rupiah",
  iep: "Irish Pound",
  ils: "Israeli Shekel",
  imp: "Isle of Man Pound",
  inr: "Indian Rupee",
  iqd: "Iraqi Dinar",
  irr: "Iranian Rial",
  isk: "Icelandic Krona",
  itl: "Italian Lira",
  jep: "Jersey Pound",
  jmd: "Jamaican Dollar",
  jod: "Jordanian Dinar",
  jpy: "Japanese Yen",
  kes: "Kenyan Shilling",
  kgs: "Kyrgyzstani Som",
  khr: "Cambodian Riel",
  kmf: "Comorian Franc",
  kpw: "North Korean Won",
  krw: "South Korean Won",
  kwd: "Kuwaiti Dinar",
  kyd: "Caymanian Dollar",
  kzt: "Kazakhstani Tenge",
  lak: "Lao Kip",
  lbp: "Lebanese Pound",
  lkr: "Sri Lankan Rupee",
  lrd: "Liberian Dollar",
  lsl: "Basotho Loti",
  ltl: "Lithuanian Litas",
  luf: "Luxembourg Franc",
  lvl: "Latvian Lat",
  lyd: "Libyan Dinar",
  mad: "Moroccan Dirham",
  mdl: "Moldovan Leu",
  mga: "Malagasy Ariary",
  mgf: "Malagasy Franc",
  mkd: "Macedonian Denar",
  mmk: "Burmese Kyat",
  mnt: "Mongolian Tughrik",
  mop: "Macau Pataca",
  mro: "Mauritanian Ouguiya",
  mru: "Mauritanian Ouguiya",
  mtl: "Maltese Lira",
  mur: "Mauritian Rupee",
  mvr: "Maldivian Rufiyaa",
  mwk: "Malawian Kwacha",
  mxn: "Mexican Peso",
  myr: "Malaysian Ringgit",
  mzm: "Mozambican Metical",
  mzn: "Mozambican Metical",
  nad: "Namibian Dollar",
  ngn: "Nigerian Naira",
  nio: "Nicaraguan Cordoba",
  nlg: "Dutch Guilder",
  nok: "Norwegian Krone",
  npr: "Nepalese Rupee",
  nzd: "New Zealand Dollar",
  omr: "Omani Rial",
  pab: "Panamanian Balboa",
  pen: "Peruvian Sol",
  pgk: "Papua New Guinean Kina",
  php: "Philippine Peso",
  pkr: "Pakistani Rupee",
  pln: "Polish Zloty",
  pte: "Portuguese Escudo",
  pyg: "Paraguayan Guarani",
  qar: "Qatari Riyal",
  rol: "Romanian Leu",
  ron: "Romanian Leu",
  rsd: "Serbian Dinar",
  rub: "Russian Ruble",
  rwf: "Rwandan Franc",
  sar: "Saudi Arabian Riyal",
  sbd: "Solomon Islander Dollar",
  scr: "Seychellois Rupee",
  sdd: "Sudanese Dinar",
  sdg: "Sudanese Pound",
  sek: "Swedish Krona",
  sgd: "Singapore Dollar",
  shp: "Saint Helenian Pound",
  sit: "Slovenian Tolar",
  skk: "Slovak Koruna",
  sle: "Sierra Leonean Leone",
  sll: "Sierra Leonean Leone",
  sos: "Somali Shilling",
  srd: "Surinamese Dollar",
  srg: "Surinamese Guilder",
  ssp: "South Sudanese Pound",
  std: "Sao Tomean Dobra",
  stn: "Sao Tomean Dobra",
  svc: "Salvadoran Colon",
  syp: "Syrian Pound",
  szl: "Swazi Lilangeni",
  thb: "Thai Baht",
  tjs: "Tajikistani Somoni",
  tmm: "Turkmenistani Manat",
  tmt: "Turkmenistani Manat",
  tnd: "Tunisian Dinar",
  top: "Tongan Pa'anga",
  trl: "Turkish Lira",
  try: "Turkish Lira",
  ttd: "Trinidadian Dollar",
  tvd: "Tuvaluan Dollar",
  twd: "Taiwan New Dollar",
  tzs: "Tanzanian Shilling",
  uah: "Ukrainian Hryvnia",
  ugx: "Ugandan Shilling",
  usd: "US Dollar",
  uyu: "Uruguayan Peso",
  uzs: "Uzbekistani Som",
  val: "Vatican City Lira",
  veb: "Venezuelan Bolívar",
  ved: "Venezuelan Bolívar",
  vef: "Venezuelan Bolívar",
  ves: "Venezuelan Bolívar",
  vnd: "Vietnamese Dong",
  vuv: "Ni-Vanuatu Vatu",
  wst: "Samoan Tala",
  xaf: "Central African CFA Franc BEAC",
  xcd: "East Caribbean Dollar",
  xof: "CFA Franc",
  xpf: "CFP Franc",
  yer: "Yemeni Rial",
  zar: "South African Rand",
  zmk: "Zambian Kwacha",
  zmw: "Zambian Kwacha",
  zwd: "Zimbabwean Dollar",
  zwg: "Zimbabwe Gold",
  zwl: "Zimbabwean Dollar",
};

const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  ILS: "₪",
  JPY: "¥",
};

export const currencies: CurrencyOption[] = Object.entries(currencyNames).map(
  ([key, name]) => {
    const code = key.toUpperCase();
    return { code, name: name || code, symbol: currencySymbols[code] ?? code };
  },
);

const REGIONAL_INDICATOR_A = 0x1f1e6;

/** Flag emoji of the issuing country (or a globe for multinational currencies). */
export function getCurrencyFlag(code: string) {
  const region = currencyTranslations[code.toUpperCase()]?.[0];
  if (!region) return "";
  if (!/^[A-Z]{2}$/.test(region)) return region;
  return String.fromCodePoint(
    ...[...region].map((char) => REGIONAL_INDICATOR_A + char.charCodeAt(0) - 65),
  );
}

/** Currency name in the interface language, falling back to English. */
export function getCurrencyDisplayName(
  currency: CurrencyOption,
  language: string | undefined,
) {
  const translation = currencyTranslations[currency.code.toUpperCase()];
  const base = language?.split("-")[0];
  if (base === "he") return translation?.[1] ?? currency.name;
  if (base === "ru") return translation?.[2] ?? currency.name;
  return currency.name;
}

// Strips Latin diacritics, Hebrew niqqud, and quote marks (so ש"ח matches ש״ח)
// before case-folding, so typed queries match regardless of accents or marks.
export function normalizeCurrencySearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-֑ͯ-ׇ]/g, "")
    .replace(/["'`’׳״]/g, "")
    .replace(/[-‐–—]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const searchIndex = new Map<string, string[]>();

function getCurrencySearchWords(currency: CurrencyOption) {
  const code = currency.code.toUpperCase();
  let words = searchIndex.get(code);
  if (words === undefined) {
    const [, he = "", ru = ""] = currencyTranslations[code] ?? [];
    words = normalizeCurrencySearch(
      [
        code,
        currency.symbol,
        currency.name,
        he,
        ru,
        ...(currencySearchAliases[code] ?? []),
      ].join(" "),
    ).split(" ");
    searchIndex.set(code, words);
  }
  return words;
}

/**
 * Matches the query against the code, symbol, and every localized name at
 * once, so a Hebrew name finds the currency in an English interface and vice
 * versa. Every query word must start a word of some name, in any order.
 */
export function searchCurrencies(list: CurrencyOption[], query: string) {
  const terms = normalizeCurrencySearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) return list;
  return list.filter((currency) => {
    const words = getCurrencySearchWords(currency);
    return terms.every((term) => words.some((word) => word.startsWith(term)));
  });
}
