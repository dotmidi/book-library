/**
 * Find a book by title + author when there is no ISBN (e.g. importing an old
 * spreadsheet). Only returns a match that clearly is the same book; a wrong
 * guess is worse than leaving the row for the user to fill in.
 */
import type { BookMetadata } from '../types';
import { fold } from '../search';
import { isValidIsbn13, isbn10to13, isValidIsbn10 } from '../isbn';
import { languageName } from '../languages';
import { coverUrlFromId, openLibraryThrottle } from './openlibrary';
import { extractYear } from './provider';
import { Throttle } from './throttle';

const googleThrottle = new Throttle(300);

function words(s: string): string[] {
  return fold(s)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['the', 'de', 'het', 'een', 'le', 'la', 'les', 'a', 'an', 'bir', 've'].includes(w));
}

/** 0..1: how much of the wanted title's words appear in the found title (and vice versa). */
export function titleSimilarity(wanted: string, found: string): number {
  const a = words(wanted);
  const b = new Set(words(found));
  if (!a.length || !b.size) return 0;
  const hit = a.filter((w) => b.has(w)).length;
  return Math.min(hit / a.length, hit / b.size);
}

export function authorMatches(wanted: string, found: string[]): boolean {
  if (!wanted.trim()) return true;
  const w = new Set(words(wanted));
  return found.some((f) => words(f).some((x) => w.has(x)));
}

/** Pick the first candidate that is clearly the same book. */
export function bestMatch(title: string, author: string, candidates: BookMetadata[]): BookMetadata | null {
  for (const c of candidates) {
    if (!c.title) continue;
    const full = [c.title, c.subtitle].filter(Boolean).join(' ');
    const sim = Math.max(titleSimilarity(title, c.title), titleSimilarity(title, full));
    if (sim >= 0.8 && authorMatches(author, c.authors ?? [])) return c;
  }
  return null;
}

interface OLDoc {
  title?: string;
  subtitle?: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  publisher?: string[];
  first_publish_year?: number;
  language?: string[];
  number_of_pages_median?: number;
}

export function mapOLSearch(docs: OLDoc[] | undefined): BookMetadata[] {
  return (docs ?? []).map((d) => {
    const isbn13 = d.isbn?.find((i) => isValidIsbn13(i)) ?? (d.isbn?.find((i) => isValidIsbn10(i)) ? isbn10to13(d.isbn.find((i) => isValidIsbn10(i))!) : '');
    return {
      isbn13,
      title: d.title ?? '',
      subtitle: d.subtitle ?? '',
      authors: d.author_name ?? [],
      publisher: d.publisher?.[0] ?? '',
      year: d.first_publish_year ?? null,
      pages: d.number_of_pages_median ?? null,
      language: d.language?.length === 1 ? languageName(d.language[0]) : '',
      cover_url: coverUrlFromId(d.cover_i),
    };
  });
}

async function openLibrarySearch(title: string, author: string): Promise<BookMetadata[]> {
  const p = new URLSearchParams({
    title,
    limit: '5',
    fields: 'title,subtitle,author_name,isbn,cover_i,publisher,first_publish_year,language,number_of_pages_median',
  });
  if (author) p.set('author', author);
  const res = await openLibraryThrottle.fetch(`https://openlibrary.org/search.json?${p}`);
  if (!res.ok) return [];
  return mapOLSearch(((await res.json()) as { docs?: OLDoc[] }).docs);
}

async function googleSearch(title: string, author: string, apiKey: string): Promise<BookMetadata[]> {
  const q = `intitle:"${title.replace(/"/g, '')}"` + (author ? ` inauthor:"${author.replace(/"/g, '')}"` : '');
  const p = new URLSearchParams({ q, maxResults: '5' });
  if (apiKey) p.set('key', apiKey);
  const res = await googleThrottle.fetch(`https://www.googleapis.com/books/v1/volumes?${p}`);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    items?: {
      volumeInfo?: {
        title?: string;
        subtitle?: string;
        authors?: string[];
        publisher?: string;
        publishedDate?: string;
        pageCount?: number;
        language?: string;
        imageLinks?: { thumbnail?: string };
        industryIdentifiers?: { type: string; identifier: string }[];
      };
    }[];
  };
  return (json.items ?? []).map(({ volumeInfo: v = {} }) => ({
    isbn13: v.industryIdentifiers?.find((x) => x.type === 'ISBN_13')?.identifier ?? '',
    isbn10: v.industryIdentifiers?.find((x) => x.type === 'ISBN_10')?.identifier ?? '',
    title: v.title ?? '',
    subtitle: v.subtitle ?? '',
    authors: v.authors ?? [],
    publisher: v.publisher ?? '',
    year: extractYear(v.publishedDate),
    pages: v.pageCount || null,
    language: v.language ? languageName(v.language) : '',
    cover_url: (v.imageLinks?.thumbnail ?? '').replace(/^http:/, 'https:').replace(/&edge=curl/, ''),
  }));
}

export async function searchByTitle(title: string, author: string, apiKey: string): Promise<BookMetadata | null> {
  if (!title.trim()) return null;
  const fromOL = bestMatch(title, author, await openLibrarySearch(title, author).catch(() => []));
  if (fromOL?.cover_url && fromOL.isbn13) return fromOL;
  const fromGB = bestMatch(title, author, await googleSearch(title, author, apiKey).catch(() => []));
  if (fromOL && fromGB) {
    // Fill gaps in the Open Library match from Google's.
    return { ...fromGB, ...Object.fromEntries(Object.entries(fromOL).filter(([, v]) => v !== '' && v !== null && !(Array.isArray(v) && !v.length))) };
  }
  return fromOL ?? fromGB;
}
