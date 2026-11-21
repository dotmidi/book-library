/**
 * Series facts from outside sources:
 *  - AniList (manga, light novels, manhwa): finished or not, and the total
 *    number of volumes (original Japanese count).
 *  - Google Books: covers, ISBNs and release dates of the individual volumes in
 *    your language, including ones you don't own yet and announced ones.
 * Both are searched by series name *and* author, because short names ("Bless")
 * match lots of unrelated books and even other series with the same name.
 */
import { config } from '../config';
import { parseVolume, seriesKey, titleKind, type EditionKind } from '../series';
import { Throttle } from './throttle';
import { getLookup, putLookup } from '../store/db';

export interface SeriesCandidate {
  id: number;
  title: string;
  format: string;
  status: string;
  volumes: number | null;
  /** Authors/artists credited on AniList. */
  staff: string[];
}

export interface VolumeInfo {
  volume: number;
  title: string;
  isbn13: string;
  cover: string;
  published: string;
}

const anilist = new Throttle(2100); // AniList allows 30 requests/minute
const google = new Throttle(300);

interface AniListMedia {
  id: number;
  title?: { english?: string | null; romaji?: string | null };
  format?: string;
  status?: string;
  volumes?: number | null;
  staff?: { nodes?: { name?: { full?: string | null } }[] };
}

export function mapAniList(media: AniListMedia[]): SeriesCandidate[] {
  return media.map((m) => ({
    id: m.id,
    title: m.title?.english || m.title?.romaji || '?',
    format: m.format ?? '',
    status: m.status ?? '',
    volumes: m.volumes ?? null,
    staff: (m.staff?.nodes ?? []).map((n) => n.name?.full ?? '').filter(Boolean),
  }));
}

export async function searchAniList(name: string): Promise<SeriesCandidate[]> {
  const query = `query($s:String){Page(perPage:6){media(search:$s,type:MANGA){id title{english romaji} format status volumes staff(perPage:4){nodes{name{full}}}}}}`;
  const res = await anilist.fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { s: name } }),
  });
  const json = (await res.json()) as { data?: { Page?: { media?: AniListMedia[] } } };
  return mapAniList(json.data?.Page?.media ?? []);
}

/** Same person, ignoring case, accents and name order ("Yukino Sonoyama" = "Sonoyama Yukino"). */
export function samePerson(a: string, b: string): boolean {
  const parts = (s: string) => seriesKey(s).split(' ').filter(Boolean).sort().join(' ');
  return !!a && !!b && parts(a) === parts(b);
}

/**
 * Which AniList entry is the series: same name, then the one by the same
 * author, then novels for novel-like books, else manga.
 */
export function pickCandidate(cands: SeriesCandidate[], name: string, preferNovel: boolean, author = ''): SeriesCandidate | null {
  const key = seriesKey(name);
  const sameName = cands.filter((c) => seriesKey(c.title) === key || seriesKey(c.title).startsWith(key) || key.startsWith(seriesKey(c.title)));
  // An exact name beats a spin-off that starts with it ("86—EIGHTY-SIX Alter").
  const exact = sameName.filter((c) => seriesKey(c.title) === key);
  let pool = exact.length ? exact : sameName.length ? sameName : cands.slice(0, 1);
  const byAuthor = author ? pool.filter((c) => c.staff.some((s) => samePerson(s, author))) : [];
  if (byAuthor.length) pool = byAuthor;
  const want = preferNovel ? ['NOVEL'] : ['MANGA', 'ONE_SHOT'];
  return pool.find((c) => want.includes(c.format)) ?? pool[0] ?? null;
}

interface GBItem {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    language?: string;
    publishedDate?: string;
    imageLinks?: { thumbnail?: string };
    industryIdentifiers?: { type: string; identifier: string }[];
  };
}

/**
 * Volumes of the series found on Google Books, by volume number. Results in
 * another language are skipped (Google's language filter lets German and
 * Polish editions through).
 */
export function mapVolumes(name: string, items: GBItem[], lang = '', kind: EditionKind = ''): Map<number, VolumeInfo> {
  const key = seriesKey(name);
  const out = new Map<number, VolumeInfo>();
  const omnibus = new Set<number>();
  for (const it of items) {
    const v = it.volumeInfo;
    if (!v?.title) continue;
    if (lang && v.language && v.language !== lang) continue;
    const full = [v.title, v.subtitle].filter(Boolean).join(' ');
    // A light novel's shelf shouldn't show the manga adaptation's covers, and vice versa.
    const itsKind = titleKind(full);
    if (kind && itsKind && itsKind !== kind) continue;
    const p = parseVolume(v.title) ?? parseVolume(full);
    if (!p || seriesKey(p.base) !== key) continue;
    const info: VolumeInfo = {
      volume: p.volume,
      title: v.title,
      isbn13: v.industryIdentifiers?.find((x) => x.type === 'ISBN_13')?.identifier ?? '',
      cover: (v.imageLinks?.thumbnail ?? '').replace(/^http:/, 'https:').replace(/&edge=curl/, ''),
      published: v.publishedDate ?? '',
    };
    // An omnibus ("Vol. 3-4") stands in for each volume it contains, unless a single volume is listed too.
    for (let n = p.volume; n <= (p.to ?? p.volume); n++) {
      const prev = out.get(n);
      const replacesOmnibus = !p.to && omnibus.has(n);
      const better = !prev || (!prev.cover && info.cover) || (!prev.isbn13 && info.isbn13 && !!info.cover === !!prev.cover);
      if (replacesOmnibus || (better && !(p.to && prev && !omnibus.has(n)))) {
        out.set(n, { ...info, volume: n });
        if (p.to) omnibus.add(n);
        else omnibus.delete(n);
      }
    }
  }
  return out;
}

const LANG_CODES: Record<string, string> = { English: 'en', Dutch: 'nl', Turkish: 'tr', Japanese: 'ja', German: 'de', French: 'fr', Spanish: 'es', Italian: 'it' };

async function googlePage(q: string, lang: string | undefined, start: number): Promise<GBItem[]> {
  const params = new URLSearchParams({ q, maxResults: '40', startIndex: String(start), printType: 'books' });
  if (lang) params.set('langRestrict', lang);
  if (config.booksApiKey) params.set('key', config.booksApiKey);
  const res = await google.fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!res.ok) return [];
  return ((await res.json()) as { items?: GBItem[] }).items ?? [];
}

const MAX_PAGES = 4;

/** Volumes found by one query; further pages are fetched while they keep turning up volumes. */
async function volumesFor(q: string, name: string, lang: string | undefined, kind: EditionKind): Promise<Map<number, VolumeInfo>> {
  const items: GBItem[] = [];
  let found = new Map<number, VolumeInfo>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const got = await googlePage(q, lang, items.length);
    if (!got.length) break;
    items.push(...got);
    const next = mapVolumes(name, items, lang, kind);
    if (next.size === found.size && page > 0) break;
    found = next;
    if (!found.size) break;
  }
  return found;
}

/** The search queries to try, best first. */
export function volumeQueries(name: string, author = ''): string[] {
  const phrase = `intitle:"${name.replace(/"/g, '')}"`;
  const out = author ? [`${phrase} inauthor:"${author.replace(/"/g, '')}"`, phrase] : [phrase];
  // Dashes and such break Google's phrase search ("86—EIGHTY-SIX"): then look for the words.
  if (/[^\p{L}\p{N}\s'’!?.,&]/u.test(name)) {
    out.push(name.split(/[^\p{L}\p{N}'’]+/u).filter(Boolean).map((w) => `intitle:${w}`).join(' '));
  }
  return out;
}

export async function searchVolumes(name: string, language: string, author = '', kind: EditionKind = ''): Promise<Map<number, VolumeInfo>> {
  const lang = LANG_CODES[language];
  for (const q of volumeQueries(name, author)) {
    const found = await volumesFor(q, name, lang, kind);
    if (found.size) return found;
  }
  return new Map();
}

export interface SeriesFacts {
  candidates: SeriesCandidate[];
  volumes: [number, VolumeInfo][];
  at: number;
}

const DAY = 24 * 3600 * 1000;

/** AniList + Google Books facts for a series, cached on this device (a week; a day if nothing was found). */
export async function seriesFacts(name: string, language: string, author = '', kind: EditionKind = '', force = false): Promise<SeriesFacts> {
  const cacheKey = `series5:${seriesKey(name)}:${language}:${seriesKey(author)}:${kind}`;
  if (!force) {
    const c = (await getLookup(cacheKey)) as unknown as { facts?: SeriesFacts } | undefined;
    const maxAge = c?.facts?.volumes.length ? 7 * DAY : DAY;
    if (c?.facts && Date.now() - c.facts.at < maxAge) return c.facts;
  }
  const [candidates, volumes] = await Promise.all([
    searchAniList(name).catch(() => [] as SeriesCandidate[]),
    searchVolumes(name, language, author, kind).catch(() => new Map<number, VolumeInfo>()),
  ]);
  const facts: SeriesFacts = { candidates, volumes: [...volumes.entries()], at: Date.now() };
  await putLookup({ isbn: cacheKey, metadata: null, sources: [], at: Date.now(), facts } as never);
  return facts;
}

export const STATUS_LABEL: Record<string, string> = {
  FINISHED: 'Series finished',
  RELEASING: 'Still releasing',
  HIATUS: 'On hiatus',
  CANCELLED: 'Cancelled',
  NOT_YET_RELEASED: 'Not released yet',
};
