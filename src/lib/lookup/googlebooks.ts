import type { BookMetadata } from '../types';
import { languageName } from '../languages';
import { extractYear, type MetadataProvider } from './provider';
import { Throttle } from './throttle';

interface GBVolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  language?: string;
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  industryIdentifiers?: { type: string; identifier: string }[];
}

export function mapGoogleBooks(isbn13: string, items: { volumeInfo?: GBVolumeInfo }[] | undefined): BookMetadata | null {
  if (!items?.length) return null;
  // Prefer the volume that really carries this ISBN.
  const match =
    items.find((i) => i.volumeInfo?.industryIdentifiers?.some((x) => x.identifier.replace(/-/g, '') === isbn13)) ?? items[0];
  const v = match.volumeInfo;
  if (!v?.title) return null;
  const thumb = (v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? '')
    .replace(/^http:/, 'https:')
    .replace(/&edge=curl/, '');
  return {
    isbn13,
    isbn10: v.industryIdentifiers?.find((x) => x.type === 'ISBN_10')?.identifier ?? '',
    title: v.title.trim(),
    subtitle: v.subtitle?.trim() ?? '',
    authors: (v.authors ?? []).map((a) => a.trim()).filter(Boolean),
    publisher: v.publisher?.trim() ?? '',
    year: extractYear(v.publishedDate),
    pages: v.pageCount || null,
    language: v.language ? languageName(v.language) : '',
    cover_url: thumb,
  };
}

export class GoogleBooksProvider implements MetadataProvider {
  id = 'googlebooks';
  name = 'Google Books';
  private throttle = new Throttle(250);
  constructor(private apiKey: string) {}

  async lookup(isbn13: string, signal?: AbortSignal): Promise<BookMetadata | null> {
    const params = new URLSearchParams({ q: `isbn:${isbn13}`, maxResults: '5' });
    if (this.apiKey) params.set('key', this.apiKey);
    const res = await this.throttle.fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, {}, signal);
    if (res.status === 404) return null;
    const json = (await res.json()) as { items?: { volumeInfo?: GBVolumeInfo }[] };
    return mapGoogleBooks(isbn13, json.items);
  }
}
