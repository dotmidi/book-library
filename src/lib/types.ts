/** One row of the Books tab. Field names match the sheet's column headers. */
export interface Book {
  id: string;
  isbn13: string;
  isbn10: string;
  /** Barcode of a non-book item (CD, vinyl): EAN-13 / UPC-A digits. Empty for books. */
  barcode: string;
  title: string;
  subtitle: string;
  authors: string[];
  publisher: string;
  year: number | null;
  pages: number | null;
  language: string;
  cover_url: string;
  location: string;
  tags: string[];
  /** Novel, Manga, Comic, Artbook, Non-fiction, CD, Vinyl, Other, or anything typed. */
  category: string;
  notes: string;
  copies: number;
  lent_to: string;
  /** yyyy-mm-dd or '' */
  lent_since: string;
  /** yyyy-mm-dd or '' */
  date_added: string;
  needs_details: boolean;
  /** On the wishlist (not owned yet). */
  wishlist: boolean;
}

export type BookField = keyof Book;

/** Metadata a lookup provider can return. */
export interface BookMetadata {
  isbn13?: string;
  isbn10?: string;
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  year?: number | null;
  pages?: number | null;
  /** Readable language name, e.g. "Dutch". */
  language?: string;
  cover_url?: string;
  /** Category the source knows, e.g. "CD" for a music release. */
  category?: string;
  barcode?: string;
}

export function emptyBook(): Book {
  return {
    id: '',
    isbn13: '',
    isbn10: '',
    barcode: '',
    title: '',
    subtitle: '',
    authors: [],
    publisher: '',
    year: null,
    pages: null,
    language: '',
    cover_url: '',
    location: '',
    tags: [],
    category: '',
    notes: '',
    copies: 1,
    lent_to: '',
    lent_since: '',
    date_added: '',
    needs_details: false,
    wishlist: false,
  };
}

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function newId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return s;
}

export function todayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
