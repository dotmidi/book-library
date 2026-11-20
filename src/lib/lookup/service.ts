import { config } from '../config';
import { getLookup, putLookup } from '../store/db';
import { emptyBook, type Book, type BookMetadata } from '../types';
import { lookupIsbn, type LookupOutcome } from './chain';
import { GoogleBooksProvider } from './googlebooks';
import { OpenLibraryProvider } from './openlibrary';
import type { MetadataProvider } from './provider';
import { OpenBDProvider } from './openbd';
import { NdlProvider } from './ndl';
import { BnfProvider } from './bnf';
import { CrossrefProvider } from './crossref';
import { lookupMusic } from './musicbrainz';
import { searchByTitle } from './titleSearch';
import { guessLanguage } from '../isbnRegion';
import { normalizeVolume } from '../volume';

/**
 * Every source, in order. Region specialists (with `prefixes`) are moved to the
 * front for matching ISBNs and skipped for others; see orderProviders().
 * Add new providers here.
 */
export function defaultProviders(): MetadataProvider[] {
  return [
    // Japan (978-4…)
    new OpenBDProvider(),
    new NdlProvider(),
    // French (978-2…, 979-10…)
    new BnfProvider(),
    // Everything
    new OpenLibraryProvider(),
    new GoogleBooksProvider(config.booksApiKey),
    new CrossrefProvider(),
  ];
}

let providers: MetadataProvider[] | null = null;
const NOT_FOUND_TTL = 24 * 60 * 60 * 1000;

async function cached(key: string, force: boolean | undefined, run: () => Promise<LookupOutcome>): Promise<LookupOutcome> {
  if (!force) {
    const c = await getLookup(key);
    if (c && (c.metadata || Date.now() - c.at < NOT_FOUND_TTL)) return { metadata: c.metadata, sources: c.sources, errors: [] };
  }
  const out = await run();
  // Don't remember "not found" if it was really "couldn't reach anything".
  if (out.metadata || out.errors.length === 0) {
    await putLookup({ isbn: key, metadata: out.metadata, sources: out.sources, at: Date.now() });
  }
  return out;
}

export async function lookupBook(isbn13: string, opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<LookupOutcome> {
  return cached(isbn13, opts.force, async () => {
    providers ??= defaultProviders();
    const out = await lookupIsbn(isbn13, providers, { signal: opts.signal });
    if (out.metadata) out.metadata = normalizeVolume(out.metadata);
    return out;
  });
}

/** CDs, vinyl and other music by their product barcode (MusicBrainz). */
export async function lookupBarcode(barcode: string, opts: { force?: boolean; signal?: AbortSignal } = {}): Promise<LookupOutcome> {
  return cached(`ean:${barcode}`, opts.force, async () => {
    try {
      const metadata = await lookupMusic(barcode, opts.signal);
      return { metadata, sources: metadata ? ['MusicBrainz'] : [], errors: [] };
    } catch (e) {
      return { metadata: null, sources: [], errors: [{ provider: 'MusicBrainz', message: (e as Error).message }] };
    }
  });
}

/** Find a book by title (and author), for imports without ISBNs. Only confident matches. */
export async function lookupByTitle(title: string, author: string): Promise<BookMetadata | null> {
  try {
    const m = await searchByTitle(title, author, config.booksApiKey);
    return m ? normalizeVolume(m) : null;
  } catch {
    return null;
  }
}

export function metadataToBook(meta: BookMetadata | null, isbn13: string, isbn10: string, barcode = ''): Book {
  const b = emptyBook();
  b.isbn13 = isbn13;
  b.isbn10 = meta?.isbn10 || isbn10;
  b.barcode = barcode;
  if (meta) {
    b.title = meta.title ?? '';
    b.subtitle = meta.subtitle ?? '';
    b.authors = meta.authors ?? [];
    b.publisher = meta.publisher ?? '';
    b.year = meta.year ?? null;
    b.pages = meta.pages ?? null;
    b.language = meta.language ?? '';
    b.cover_url = meta.cover_url ?? '';
    b.category = meta.category ?? '';
  }
  // No source gave a language (or none knew the book): guess it from the ISBN's
  // country group, e.g. 978-90… → Dutch, 978-605… → Turkish, 978-4… → Japanese.
  if (!b.language && isbn13) b.language = guessLanguage(isbn13);
  b.needs_details = !b.title;
  return b;
}

/** Fill a book's blank fields from metadata (used by "retry lookup" and imports); never overwrites what the user typed. */
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
  if (!out.isbn13 && meta.isbn13) out.isbn13 = meta.isbn13;
  if (!out.isbn10 && meta.isbn10) out.isbn10 = meta.isbn10;
  if (!out.category && meta.category) out.category = meta.category;
  out.needs_details = !out.title;
  return out;
}
