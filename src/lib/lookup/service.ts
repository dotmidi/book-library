import { config } from '../config';
import { getLookup, putLookup } from '../store/db';
import { emptyBook, type Book, type BookMetadata } from '../types';
import { lookupIsbn, type LookupOutcome } from './chain';
import { GoogleBooksProvider } from './googlebooks';
import { OpenLibraryProvider } from './openlibrary';
import type { MetadataProvider } from './provider';

/** The fallback chain, in order. Add new providers here. */
export function defaultProviders(): MetadataProvider[] {
  return [new OpenLibraryProvider(), new GoogleBooksProvider(config.booksApiKey)];
}

let providers: MetadataProvider[] | null = null;
const NOT_FOUND_TTL = 24 * 60 * 60 * 1000;

export async function lookupBook(isbn13: string, opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<LookupOutcome> {
  if (!opts.force) {
    const cached = await getLookup(isbn13);
    if (cached && (cached.metadata || Date.now() - cached.at < NOT_FOUND_TTL)) {
      return { metadata: cached.metadata, sources: cached.sources, errors: [] };
    }
  }
  providers ??= defaultProviders();
  const out = await lookupIsbn(isbn13, providers, { signal: opts.signal });
  // Don't remember "not found" if it was really "couldn't reach anything".
  if (out.metadata || out.errors.length === 0) {
    await putLookup({ isbn: isbn13, metadata: out.metadata, sources: out.sources, at: Date.now() });
  }
  return out;
}

export function metadataToBook(meta: BookMetadata | null, isbn13: string, isbn10: string): Book {
  const b = emptyBook();
  b.isbn13 = isbn13;
  b.isbn10 = meta?.isbn10 || isbn10;
  if (meta) {
    b.title = meta.title ?? '';
    b.subtitle = meta.subtitle ?? '';
    b.authors = meta.authors ?? [];
    b.publisher = meta.publisher ?? '';
    b.year = meta.year ?? null;
    b.pages = meta.pages ?? null;
    b.language = meta.language ?? '';
    b.cover_url = meta.cover_url ?? '';
  }
  b.needs_details = !b.title;
  return b;
}

/** Fill a book's blank fields from metadata (used by "retry lookup"); never overwrites what the user typed. */
export function fillBlanks(book: Book, meta: BookMetadata): Book {
  const out = { ...book };
  if (!out.title && meta.title) out.title = meta.title;
  if (!out.subtitle && meta.subtitle) out.subtitle = meta.subtitle;
  if (!out.authors.length && meta.authors?.length) out.authors = meta.authors;
  if (!out.publisher && meta.publisher) out.publisher = meta.publisher;
  if (out.year === null && meta.year) out.year = meta.year;
  if (out.pages === null && meta.pages) out.pages = meta.pages;
  if (!out.language && meta.language) out.language = meta.language;
  if (!out.cover_url && meta.cover_url) out.cover_url = meta.cover_url;
  if (!out.isbn10 && meta.isbn10) out.isbn10 = meta.isbn10;
  out.needs_details = !out.title;
  return out;
}
