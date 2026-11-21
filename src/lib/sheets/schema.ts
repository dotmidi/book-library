import type { BookField } from '../types';

export const SCHEMA_VERSION = 3;
export const SPREADSHEET_TITLE = 'Book Library';
export const BOOKS_TAB = 'Books';
export const META_TAB = '_meta';
export const FRIENDS_TAB = '_friends';

/** Developer-metadata keys. Tags on columns survive renames and moves. */
export const MD_FIELD = 'bl.field';
export const MD_TAB = 'bl.tab';

/** Drive appProperties marker on the spreadsheet file. */
export const APP_PROPERTY = 'bookLibrary';

export type FieldKey = BookField | 'cover_preview';

export type FieldKind = 'text' | 'isbn' | 'code' | 'list' | 'int' | 'date' | 'bool' | 'formula';

export interface FieldDef {
  key: FieldKey;
  kind: FieldKind;
  /** Alternative header names people might type (normalised before matching). */
  aliases: string[];
  /** Separator for list fields. */
  sep?: string;
  /** Column width in pixels for a new sheet. */
  width?: number;
  /** Schema version that introduced the field (missing newer columns are added silently). */
  since?: number;
}

/** Column order for a brand-new sheet. Existing sheets may be in any order. */
export const FIELDS: FieldDef[] = [
  { key: 'id', kind: 'text', aliases: ['bookid', 'book id'], width: 90 },
  { key: 'isbn13', kind: 'isbn', aliases: ['isbn', 'isbn 13', 'ean'], width: 120 },
  { key: 'isbn10', kind: 'isbn', aliases: ['isbn 10'], width: 100 },
  { key: 'barcode', kind: 'code', aliases: ['upc', 'ean 13', 'streepjescode', 'barkod'], width: 120, since: 2 },
  { key: 'title', kind: 'text', aliases: ['titel', 'baslik', 'kitap', 'book', 'name', 'naam'], width: 240 },
  { key: 'subtitle', kind: 'text', aliases: ['ondertitel', 'alt baslik', 'altbaslik'], width: 160 },
  { key: 'title_en', kind: 'text', aliases: ['english title', 'title english', 'engelse titel', 'ingilizce baslik', 'translation'], width: 200, since: 3 },
  { key: 'authors', kind: 'list', sep: '; ', aliases: ['author', 'auteur', 'auteurs', 'schrijver', 'yazar', 'yazarlar', 'writer', 'by'], width: 180 },
  { key: 'publisher', kind: 'text', aliases: ['uitgever', 'yayinevi', 'yayinci'], width: 140 },
  { key: 'year', kind: 'int', aliases: ['jaar', 'yil', 'published', 'publication year', 'year published'], width: 60 },
  { key: 'pages', kind: 'int', aliases: ["pagina's", 'paginas', 'sayfa', 'page count', 'number of pages'], width: 60 },
  { key: 'language', kind: 'text', aliases: ['taal', 'dil', 'lang'], width: 90 },
  { key: 'cover_url', kind: 'text', aliases: ['cover', 'cover url', 'image', 'image url', 'kapak'], width: 120 },
  { key: 'cover_preview', kind: 'formula', aliases: ['preview', 'cover image'], width: 70 },
  { key: 'location', kind: 'text', aliases: ['locatie', 'plaats', 'kast', 'shelf', 'konum', 'yer', 'raf'], width: 120 },
  { key: 'tags', kind: 'list', sep: ', ', aliases: ['tag', 'labels', 'etiketten', 'etiket', 'genre'], width: 140 },
  { key: 'category', kind: 'text', aliases: ['categories', 'categorie', 'kategori', 'type', 'format', 'soort', 'tur'], width: 100, since: 2 },
  { key: 'notes', kind: 'text', aliases: ['note', 'notities', 'opmerkingen', 'notlar', 'not', 'comments'], width: 200 },
  { key: 'copies', kind: 'int', aliases: ['copy', 'aantal', 'exemplaren', 'adet', 'quantity', 'qty'], width: 60 },
  { key: 'lent_to', kind: 'text', aliases: ['lent', 'uitgeleend aan', 'borrower', 'odunc'], width: 110 },
  { key: 'lent_since', kind: 'date', aliases: ['uitgeleend sinds', 'lent on', 'lent date'], width: 100 },
  { key: 'date_added', kind: 'date', aliases: ['added', 'toegevoegd', 'eklenme tarihi', 'date'], width: 100 },
  { key: 'needs_details', kind: 'bool', aliases: ['needs info', 'incomplete'], width: 90 },
  { key: 'wishlist', kind: 'bool', aliases: ['wish list', 'wish', 'verlanglijst', 'istek listesi'], width: 80, since: 2 },
];

export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** Lowercase, strip accents and punctuation, collapse spaces. "ISBN-13" → "isbn 13". */
export function normalizeHeader(s: unknown): string {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[_\-./:()#]+/g, ' ')
    .replace(/[^a-z0-9' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADER_INDEX = new Map<string, FieldKey>();
for (const f of FIELDS) {
  HEADER_INDEX.set(normalizeHeader(f.key), f.key);
  HEADER_INDEX.set(normalizeHeader(f.key).replace(/ /g, ''), f.key);
}
for (const f of FIELDS) {
  for (const a of f.aliases) {
    const n = normalizeHeader(a);
    if (!HEADER_INDEX.has(n)) HEADER_INDEX.set(n, f.key);
    const compact = n.replace(/ /g, '');
    if (!HEADER_INDEX.has(compact)) HEADER_INDEX.set(compact, f.key);
  }
}

/** Which field (if any) a header text refers to. */
export function matchHeader(header: unknown): FieldKey | null {
  const n = normalizeHeader(header);
  if (!n) return null;
  return HEADER_INDEX.get(n) ?? HEADER_INDEX.get(n.replace(/ /g, '')) ?? null;
}

/** 0 → A, 25 → Z, 26 → AA */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Quote a sheet title for A1 notation: Books → 'Books', O'Neil → 'O''Neil'. */
export function quoteSheet(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}
