/**
 * Which country / language area published a book, from the ISBN's
 * registration group (the digits after 978/979). Used to ask the right
 * specialist catalogue first and to guess the language when no catalogue
 * knows the book.
 *
 * `language` is only set where the group is (nearly) single-language.
 * Source: International ISBN Agency range list (main groups only).
 */
export interface IsbnRegion {
  /** ISBN-13 prefix that matched, e.g. "9784" or "978605". */
  prefix: string;
  /** Readable area name, e.g. "Japan". */
  area: string;
  /** Likely language, as a readable name ("Japanese"), or '' if unsure. */
  language: string;
}

// [prefix, area, language]
const GROUPS: [string, string, string][] = [
  // 979 groups
  ['9798', 'United States', 'English'],
  ['97910', 'France', 'French'],
  ['97911', 'South Korea', 'Korean'],
  ['97912', 'Italy', 'Italian'],
  ['97913', 'Spain', 'Spanish'],
  // 978 single-digit groups
  ['9780', 'English-speaking countries', 'English'],
  ['9781', 'English-speaking countries', 'English'],
  ['9782', 'French-speaking countries', 'French'],
  ['9783', 'German-speaking countries', 'German'],
  ['9784', 'Japan', 'Japanese'],
  ['9785', 'Russia and former USSR', 'Russian'],
  ['9787', 'China', 'Chinese'],
  // 978 two-digit groups
  ['97865', 'Brazil', 'Portuguese'],
  ['97880', 'Czech Republic / Slovakia', ''],
  ['97881', 'India', ''],
  ['97882', 'Norway', 'Norwegian'],
  ['97883', 'Poland', 'Polish'],
  ['97884', 'Spain', 'Spanish'],
  ['97885', 'Brazil', 'Portuguese'],
  ['97886', 'Former Yugoslavia', ''],
  ['97887', 'Denmark', 'Danish'],
  ['97888', 'Italy', 'Italian'],
  ['97889', 'South Korea', 'Korean'],
  ['97890', 'Netherlands / Flanders', 'Dutch'],
  ['97891', 'Sweden', 'Swedish'],
  ['97893', 'India', ''],
  ['97894', 'Netherlands / Flanders', 'Dutch'],
  // 978 three-digit groups
  ['978600', 'Iran', 'Persian'],
  ['978601', 'Kazakhstan', ''],
  ['978602', 'Indonesia', 'Indonesian'],
  ['978603', 'Saudi Arabia', 'Arabic'],
  ['978604', 'Vietnam', 'Vietnamese'],
  ['978605', 'Turkey', 'Turkish'],
  ['978606', 'Romania', 'Romanian'],
  ['978607', 'Mexico', 'Spanish'],
  ['978608', 'North Macedonia', ''],
  ['978609', 'Lithuania', 'Lithuanian'],
  ['978611', 'Thailand', 'Thai'],
  ['978612', 'Peru', 'Spanish'],
  ['978614', 'Lebanon', 'Arabic'],
  ['978615', 'Hungary', 'Hungarian'],
  ['978616', 'Thailand', 'Thai'],
  ['978617', 'Ukraine', 'Ukrainian'],
  ['978618', 'Greece', 'Greek'],
  ['978619', 'Bulgaria', 'Bulgarian'],
  ['978621', 'Philippines', ''],
  ['978622', 'Iran', 'Persian'],
  ['978623', 'Indonesia', 'Indonesian'],
  ['978625', 'Turkey', 'Turkish'],
  ['978626', 'Taiwan', 'Chinese'],
  ['978627', 'Pakistan', ''],
  ['978628', 'Colombia', 'Spanish'],
  ['978629', 'Malaysia', ''],
  ['978630', 'Romania', 'Romanian'],
  ['978950', 'Argentina', 'Spanish'],
  ['978951', 'Finland', 'Finnish'],
  ['978952', 'Finland', 'Finnish'],
  ['978953', 'Croatia', 'Croatian'],
  ['978954', 'Bulgaria', 'Bulgarian'],
  ['978955', 'Sri Lanka', ''],
  ['978956', 'Chile', 'Spanish'],
  ['978957', 'Taiwan', 'Chinese'],
  ['978958', 'Colombia', 'Spanish'],
  ['978959', 'Cuba', 'Spanish'],
  ['978960', 'Greece', 'Greek'],
  ['978961', 'Slovenia', ''],
  ['978962', 'Hong Kong', ''],
  ['978963', 'Hungary', 'Hungarian'],
  ['978964', 'Iran', 'Persian'],
  ['978965', 'Israel', 'Hebrew'],
  ['978966', 'Ukraine', 'Ukrainian'],
  ['978967', 'Malaysia', ''],
  ['978968', 'Mexico', 'Spanish'],
  ['978969', 'Pakistan', ''],
  ['978970', 'Mexico', 'Spanish'],
  ['978971', 'Philippines', ''],
  ['978972', 'Portugal', 'Portuguese'],
  ['978973', 'Romania', 'Romanian'],
  ['978974', 'Thailand', 'Thai'],
  ['978975', 'Turkey', 'Turkish'],
  ['978977', 'Egypt', 'Arabic'],
  ['978979', 'Indonesia', 'Indonesian'],
  ['978980', 'Venezuela', 'Spanish'],
  ['978981', 'Singapore', ''],
  ['978983', 'Malaysia', ''],
  ['978984', 'Bangladesh', ''],
  ['978985', 'Belarus', ''],
  ['978986', 'Taiwan', 'Chinese'],
  ['978987', 'Argentina', 'Spanish'],
  ['978988', 'Hong Kong', ''],
  ['978989', 'Portugal', 'Portuguese'],
  // 978 four-digit groups (selection)
  ['9789944', 'Turkey', 'Turkish'],
  ['9789953', 'Lebanon', 'Arabic'],
  ['9789957', 'Jordan', 'Arabic'],
  ['9789960', 'Saudi Arabia', 'Arabic'],
  ['9789948', 'United Arab Emirates', 'Arabic'],
];

// Longest prefix wins ("978605" before "9786…", "9789944" before "97899…").
const SORTED = [...GROUPS].sort((a, b) => b[0].length - a[0].length);

export function isbnRegion(isbn13: string): IsbnRegion | null {
  if (!/^97[89]\d{10}$/.test(isbn13)) return null;
  for (const [prefix, area, language] of SORTED) {
    if (isbn13.startsWith(prefix)) return { prefix, area, language };
  }
  return null;
}

/** Likely language for an ISBN, or '' when the group is multilingual or unknown. */
export function guessLanguage(isbn13: string): string {
  return isbnRegion(isbn13)?.language ?? '';
}
