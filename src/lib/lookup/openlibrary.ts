import type { BookMetadata } from '../types';
import { languageName } from '../languages';
import { extractYear, type MetadataProvider } from './provider';
import { Throttle } from './throttle';

/** Open Library asks for ≤1 request/second; this is shared by every OL call in the app. */
export const openLibraryThrottle = new Throttle(1000);

interface OLData {
  title?: string;
  subtitle?: string;
  authors?: { name?: string }[];
  publishers?: { name?: string }[];
  publish_date?: string;
  number_of_pages?: number;
  cover?: { small?: string; medium?: string; large?: string };
  identifiers?: { isbn_10?: string[]; isbn_13?: string[] };
}

interface OLDetails {
  details?: {
    languages?: { key?: string }[];
    covers?: number[];
  };
}

/** Covers are always stored by cover ID (the by-ISBN cover endpoint is rate-limited). */
export function coverUrlFromId(id: number | undefined | null): string {
  return id && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : '';
}

export function mapOpenLibrary(isbn13: string, data: OLData | undefined, details?: OLDetails): BookMetadata | null {
  if (!data || !data.title) return null;
  let cover = data.cover?.medium ?? '';
  // jscmd=data gives /b/id/<id>-M.jpg already; anything else gets rebuilt from the cover id.
  if (!/covers\.openlibrary\.org\/b\/id\/\d+-M\.jpg/.test(cover)) {
    cover = coverUrlFromId(details?.details?.covers?.find((c) => c > 0));
  }
  cover = cover.replace(/^http:/, 'https:');
  const lang = details?.details?.languages?.[0]?.key;
  return {
    isbn13,
    isbn10: data.identifiers?.isbn_10?.[0] ?? '',
    title: data.title.trim(),
    subtitle: data.subtitle?.trim() ?? '',
    authors: (data.authors ?? []).map((a) => a.name?.trim() ?? '').filter(Boolean),
    publisher: data.publishers?.[0]?.name?.trim() ?? '',
    year: extractYear(data.publish_date),
    pages: data.number_of_pages ?? null,
    language: lang ? languageName(lang) : '',
    cover_url: cover,
  };
}

export class OpenLibraryProvider implements MetadataProvider {
  id = 'openlibrary';
  name = 'Open Library';
  constructor(private throttle = openLibraryThrottle) {}

  async lookup(isbn13: string, signal?: AbortSignal): Promise<BookMetadata | null> {
    const key = `ISBN:${isbn13}`;
    const base = 'https://openlibrary.org/api/books?format=json&bibkeys=' + encodeURIComponent(key);
    const res = await this.throttle.fetch(`${base}&jscmd=data`, {}, signal);
    if (res.status === 404) return null;
    const json = (await res.json()) as Record<string, OLData>;
    const data = json[key];
    if (!data) return null;
    // jscmd=data has no language; jscmd=details does. One extra (throttled) call only on a hit.
    let details: OLDetails | undefined;
    try {
      const r2 = await this.throttle.fetch(`${base}&jscmd=details`, {}, signal);
      if (r2.ok) details = ((await r2.json()) as Record<string, OLDetails>)[key];
    } catch {
      /* language is optional */
    }
    return mapOpenLibrary(isbn13, data, details);
  }
}
