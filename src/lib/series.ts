/**
 * Recognise series in the library from titles:
 *  - strong: "Let's Do It Already!, Vol. 5", "Royal Tailor Volume 2", "進撃の巨人 3巻"
 *            also with a subtitle after the number: "Absolute Batman Vol. 2: Abomination"
 *  - weak:   "Bless 3", "The Ice Guy and the Cool Girl 03" — only counted as a
 *            series when at least two books share the same name.
 */
import type { Book } from './types';

export interface ParsedVolume {
  base: string;
  volume: number;
  /** Last volume of an omnibus ("Ojojojo Vol. 1-2" → volume 1, to 2). */
  to?: number;
  strong: boolean;
}

// "#3" is left out on purpose: in comics it's a single issue, not a volume.
const KEYWORD = String.raw`(?:vol(?:ume)?s?\.?|v\.|tome|tomo|deel|dl\.|cilt|band|bd\.|omnibus)`;
const STRONG = new RegExp(String.raw`^(.*?\S)[\s,:;.\-–—]*(?:[(\[]\s*)?(?:${KEYWORD}\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?|第?\s*(\d{1,3})\s*(?:巻|권))(?:\s*[)\]])?(?:[\s:;,.\-–—]+.*)?$`, 'i');
const WEAK = /^(.*?\S)[\s,:\-–—]+0*(\d{1,2})$/;
/** Edition notes that sit after the number: "Bless 3 (Manga)". */
const SUFFIX = /\s*[(\[](?:manga|light novel|novel|comic|graphic novel|paperback|hardcover)[)\]]\s*$/i;
/** The same notes inside the name: "Some Title (Manga) Vol. 2". */
const EDITION = /\s*[(\[](?:manga|light novel|novel|comic|graphic novel|paperback|hardcover)[)\]]/gi;

export function parseVolume(title: string): ParsedVolume | null {
  const t = title.replace(SUFFIX, '').trim();
  const s = STRONG.exec(t);
  if (s) {
    const volume = Number(s[2] ?? s[4]);
    const to = s[3] ? Number(s[3]) : undefined;
    const base = s[1].replace(EDITION, '').replace(/[\s,:;.\-–—]+$/, '');
    return to && to > volume && to - volume < 6 ? { base, volume, to, strong: true } : { base, volume, strong: true };
  }
  const w = WEAK.exec(t);
  // Leave years and big numbers alone ("1984", "Fahrenheit 451").
  if (w && Number(w[2]) > 0 && Number(w[2]) < 100) return { base: w[1], volume: Number(w[2]), strong: false };
  return null;
}

export type EditionKind = 'novel' | 'manga' | '';

/** "(light novel)" / "(manga)" in a title says which edition it is. */
export function titleKind(title: string): EditionKind {
  if (/[(\[]\s*(?:light novel|novel)\s*[)\]]/i.test(title)) return 'novel';
  if (/[(\[]\s*manga\s*[)\]]/i.test(title)) return 'manga';
  return '';
}

/** Publishers' light-novel imprints (Yen Press's manga is "Yen Press", its novels "Yen On"). */
const NOVEL_IMPRINT = /\byen on\b|j-novel|\bairship\b|cross infinite world/i;

/** Is this book a (light) novel rather than manga/comics? */
export function isNovel(book: Pick<Book, 'title' | 'category' | 'publisher'>): boolean {
  const kind = titleKind(book.title);
  if (kind) return kind === 'novel';
  if (/graphic novel|comic|manga/i.test(book.category)) return false;
  return /novel/i.test(book.category) || NOVEL_IMPRINT.test(book.publisher);
}

/** Matching key: case/accents/punctuation-insensitive, ignores a leading "The". */
export function seriesKey(base: string): string {
  return base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /, '');
}

export interface SeriesGroup {
  key: string;
  /** Display name (the longest spelling seen, e.g. with "The"). */
  name: string;
  /** volume number → books (owned or wishlisted) */
  volumes: Map<number, Book[]>;
  /**
   * Sure it's a series: a "Vol. N" title, or two or more numbered books with
   * the same name. A lone "Smoking Behind the Supermarket With You 2" isn't
   * (it could be "Apollo 13") until other volumes are found online.
   */
  confirmed: boolean;
}

export function groupSeries(books: Book[]): Map<string, SeriesGroup> {
  const groups = new Map<string, SeriesGroup>();
  for (const b of books) {
    const p = parseVolume(b.title);
    if (!p) continue;
    const key = seriesKey(p.base);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { key, name: p.base, volumes: new Map(), confirmed: false };
      groups.set(key, g);
    }
    if (p.base.length > g.name.length) g.name = p.base;
    g.confirmed ||= p.strong;
    // An omnibus counts for every volume it contains.
    for (let n = p.volume; n <= (p.to ?? p.volume); n++) {
      const list = g.volumes.get(n) ?? [];
      list.push(b);
      g.volumes.set(n, list);
    }
  }
  // A lone "Bless 3" isn't evidence of a series; "Bless 1" + "Bless 3" is.
  for (const g of groups.values()) if (g.volumes.size >= 2) g.confirmed = true;
  return groups;
}

/** The series a book belongs to, if any. */
export function seriesOf(book: Book, books: Book[]): { group: SeriesGroup; volume: number } | null {
  const p = parseVolume(book.title);
  if (!p) return null;
  const group = groupSeries(books).get(seriesKey(p.base));
  return group ? { group, volume: p.volume } : null;
}

/** Two titles name the same volume ("Let's Do It Already!, Vol. 4" vs "Let’s Do It Already! Vol 4"). */
export function sameVolumeTitle(a: string, b: string): boolean {
  const pa = parseVolume(a);
  const pb = parseVolume(b);
  if (pa && pb) return pa.volume === pb.volume && seriesKey(pa.base) === seriesKey(pb.base);
  return seriesKey(a) === seriesKey(b);
}
