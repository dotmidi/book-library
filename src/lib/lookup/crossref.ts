import type { BookMetadata } from '../types';
import { languageName } from '../languages';
import type { MetadataProvider } from './provider';
import { Throttle } from './throttle';

/** Crossref: free, no key. Mostly academic and art/museum books with DOIs. Last resort. */

interface CrossrefItem {
  type?: string;
  title?: string[];
  subtitle?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  editor?: { given?: string; family?: string; name?: string }[];
  publisher?: string;
  published?: { 'date-parts'?: number[][] };
  language?: string;
}

const BOOK_TYPES = new Set(['book', 'monograph', 'edited-book', 'reference-book', 'book-set', 'book-series']);

export function mapCrossref(isbn13: string, items: CrossrefItem[] | undefined): BookMetadata | null {
  const it = items?.find((i) => !i.type || BOOK_TYPES.has(i.type));
  const title = it?.title?.[0]?.trim();
  if (!it || !title) return null;
  const people = (it.author?.length ? it.author : it.editor) ?? [];
  return {
    isbn13,
    title,
    subtitle: it.subtitle?.[0]?.trim() ?? '',
    authors: people.map((p) => p.name ?? [p.given, p.family].filter(Boolean).join(' ')).filter(Boolean),
    publisher: it.publisher?.trim() ?? '',
    year: it.published?.['date-parts']?.[0]?.[0] ?? null,
    pages: null,
    language: it.language ? languageName(it.language) : '',
    cover_url: '',
  };
}

export class CrossrefProvider implements MetadataProvider {
  id = 'crossref';
  name = 'Crossref';
  lastResort = true;
  private throttle = new Throttle(1000);

  async lookup(isbn13: string, signal?: AbortSignal): Promise<BookMetadata | null> {
    const res = await this.throttle.fetch(`https://api.crossref.org/works?filter=isbn:${isbn13}&rows=3`, {}, signal);
    if (res.status === 404) return null;
    const json = (await res.json()) as { message?: { items?: CrossrefItem[] } };
    return mapCrossref(isbn13, json.message?.items);
  }
}
