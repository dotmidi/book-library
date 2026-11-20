/**
 * Countries for the Location field: names, flags, and matching of whatever
 * people typed ("Turkey", "Türkiye", "Turkije", "Holland", "NL"…).
 * Location stays free text; a location that is a country just gets a flag.
 */
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(
    ' ',
  );

/** Extra names people use (Dutch, Turkish, local, short forms). Keys are folded. */
const ALIASES: Record<string, string> = {
  turkey: 'TR', turkiye: 'TR', turkije: 'TR', 'türkei': 'TR',
  netherlands: 'NL', holland: 'NL', nederland: 'NL', hollanda: 'NL', 'the netherlands': 'NL', nl: 'NL',
  belgium: 'BE', belgie: 'BE', belcika: 'BE',
  germany: 'DE', duitsland: 'DE', deutschland: 'DE', almanya: 'DE',
  'united kingdom': 'GB', uk: 'GB', england: 'GB', engeland: 'GB', ingiltere: 'GB', 'great britain': 'GB', britain: 'GB',
  'united states': 'US', usa: 'US', us: 'US', america: 'US', amerika: 'US', abd: 'US',
  japan: 'JP', japonya: 'JP', '日本': 'JP',
  france: 'FR', frankrijk: 'FR', fransa: 'FR',
  spain: 'ES', spanje: 'ES', ispanya: 'ES', espana: 'ES',
  italy: 'IT', italie: 'IT', italya: 'IT',
  'south korea': 'KR', korea: 'KR', 'kore': 'KR',
  china: 'CN', cin: 'CN',
  taiwan: 'TW',
  greece: 'GR', griekenland: 'GR', yunanistan: 'GR',
  cyprus: 'CY', kibris: 'CY',
  iran: 'IR', russia: 'RU', rusland: 'RU', rusya: 'RU',
};

export interface Country {
  code: string;
  name: string;
  flag: string;
}

export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').toLowerCase().trim();
}

let list: Country[] | null = null;
let byName: Map<string, string> | null = null;

function build() {
  if (list) return;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    names = null;
  }
  list = CODES.map((code) => ({ code, name: names?.of(code) ?? code, flag: flagEmoji(code) }))
    .filter((c) => c.name && c.name !== c.code)
    .sort((a, b) => a.name.localeCompare(b.name));
  byName = new Map();
  for (const c of list) byName.set(fold(c.name), c.code);
  for (const [k, v] of Object.entries(ALIASES)) byName.set(fold(k), v);
  // Older/newer English names that Intl may not use.
  byName.set('turkey', 'TR');
  byName.set('turkiye', 'TR');
}

export function countries(): Country[] {
  build();
  return list!;
}

/** ISO code if the location text names a country, else ''. */
export function countryCode(location: string): string {
  if (!location) return '';
  build();
  return byName!.get(fold(location)) ?? '';
}

/** Flag for a location that is a country, else ''. */
export function locationFlag(location: string): string {
  return flagEmoji(countryCode(location));
}

/** Countries (and other locations already used) matching what is typed so far. */
export function suggestLocations(query: string, used: string[], limit = 8): { label: string; value: string; flag: string }[] {
  const q = fold(query);
  const out: { label: string; value: string; flag: string }[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const key = fold(value);
    if (!value || seen.has(key)) return;
    seen.add(key);
    out.push({ label: value, value, flag: locationFlag(value) });
  };
  for (const u of used) if (!q || fold(u).includes(q)) push(u);
  for (const c of countries()) {
    if (out.length >= limit) break;
    if (!q || fold(c.name).startsWith(q) || fold(c.name).includes(` ${q}`)) push(c.name);
  }
  if (q) for (const [alias, code] of Object.entries(ALIASES)) if (fold(alias).startsWith(q)) push(countries().find((c) => c.code === code)?.name ?? '');
  return out.slice(0, limit);
}
