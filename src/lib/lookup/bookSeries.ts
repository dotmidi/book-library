/**
 * Series for books whose titles don't carry a volume number ("House of Earth
 * and Blood" is Crescent City book 1). Open Library records this on the work:
 *   /isbn/<isbn>.json → works[0] → /works/<id>.json → series[{series:{key}, position}]
 *   /series/<id>.json → name
 *   /search.json?q=series_key:<id> → the books in the series, with positions and covers
 */
import { getLookup, putLookup } from '../store/db';
import { coverUrlFromId, openLibraryThrottle } from './openlibrary';

export interface SeriesBook {
  position: number;
  title: string;
  cover: string;
  isbns: string[];
}

export interface BookSeries {
  key: string;
  name: string;
  /** This book's place in the series. */
  position: number;
  books: SeriesBook[];
}

interface SearchDoc {
  title?: string;
  series_key?: string[];
  series_position?: string[];
  cover_i?: number;
  isbn?: string[];
}

const get = async <T>(url: string): Promise<T | null> => {
  const res = await openLibraryThrottle.fetch(url);
  return res.ok ? ((await res.json()) as T) : null;
};

/** Books of one series from Open Library's search results: whole-numbered positions only, one per position. */
export function mapSeriesDocs(seriesKey: string, docs: SearchDoc[]): SeriesBook[] {
  const out = new Map<number, SeriesBook>();
  for (const d of docs) {
    if (!d.title) continue;
    const i = d.series_key?.indexOf(seriesKey) ?? -1;
    const pos = Number(d.series_position?.[i >= 0 ? i : 0]);
    // Skip novellas at "1.5" and entries without a position.
    if (!Number.isInteger(pos) || pos < 1) continue;
    if (out.has(pos) && out.get(pos)!.cover) continue;
    out.set(pos, { position: pos, title: d.title, cover: coverUrlFromId(d.cover_i), isbns: (d.isbn ?? []).filter((x) => x.length === 13) });
  }
  return [...out.values()].sort((a, b) => a.position - b.position);
}

async function fetchSeries(isbn13: string): Promise<BookSeries | null> {
  const edition = await get<{ works?: { key: string }[] }>(`https://openlibrary.org/isbn/${isbn13}.json`);
  const workKey = edition?.works?.[0]?.key;
  if (!workKey) return null;
  const work = await get<{ series?: { series?: { key?: string }; position?: string }[] }>(`https://openlibrary.org${workKey}.json`);
  const entry = work?.series?.find((s) => s.series?.key);
  const key = entry?.series?.key?.replace('/series/', '');
  if (!key) return null;
  const [series, search] = await Promise.all([
    get<{ name?: string }>(`https://openlibrary.org/series/${key}.json`),
    get<{ docs?: SearchDoc[] }>(
      `https://openlibrary.org/search.json?${new URLSearchParams({ q: `series_key:${key}`, fields: 'title,series_key,series_position,cover_i,isbn', limit: '60' })}`,
    ),
  ]);
  const books = mapSeriesDocs(key, search?.docs ?? []);
  if (!series?.name || books.length < 2) return null;
  return { key, name: series.name, position: Number(entry?.position) || 0, books };
}

const WEEK = 7 * 24 * 3600 * 1000;

/** The Open Library series of a book, cached on this device for a week (also when it has none). */
export async function bookSeries(isbn13: string): Promise<BookSeries | null> {
  if (!isbn13) return null;
  const cacheKey = `olseries1:${isbn13}`;
  const c = (await getLookup(cacheKey)) as unknown as { series?: BookSeries | null; at?: number } | undefined;
  if (c?.at && Date.now() - c.at < WEEK) return c.series ?? null;
  let series: BookSeries | null = null;
  try {
    series = await fetchSeries(isbn13);
  } catch {
    return null; // offline: try again next time
  }
  await putLookup({ isbn: cacheKey, metadata: null, sources: [], at: Date.now(), series } as never);
  return series;
}
