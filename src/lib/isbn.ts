/**
 * ISBN normalisation and validation.
 * Accepts ISBN-10 and ISBN-13, with or without dashes/spaces, and the
 * "ISBN" / "ISBN-13:" prefixes people copy from websites.
 */

export interface ParsedIsbn {
  isbn13: string;
  /** Empty for 979- ISBNs, which have no ISBN-10 form. */
  isbn10: string;
}

export type IsbnProblem = 'empty' | 'length' | 'characters' | 'checksum' | 'prefix';

export type IsbnResult = { ok: true; value: ParsedIsbn } | { ok: false; problem: IsbnProblem };

/** Strip everything that isn't a digit or X; uppercase the X. */
export function cleanIsbn(input: string): string {
  return String(input ?? '')
    .toUpperCase()
    .replace(/^\s*ISBN(?:-1[03])?:?/, '')
    .replace(/[\s\-‐-―_.]/g, '');
}

export function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(first9[i]);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? 'X' : String(check);
}

export function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function isValidIsbn10(s: string): boolean {
  return /^\d{9}[\dX]$/.test(s) && isbn10CheckDigit(s.slice(0, 9)) === s[9];
}

export function isValidIsbn13(s: string): boolean {
  return /^97[89]\d{10}$/.test(s) && isbn13CheckDigit(s.slice(0, 12)) === s[12];
}

export function isbn10to13(isbn10: string): string {
  const core = '978' + isbn10.slice(0, 9);
  return core + isbn13CheckDigit(core);
}

export function isbn13to10(isbn13: string): string {
  if (!isbn13.startsWith('978')) return '';
  const core = isbn13.slice(3, 12);
  return core + isbn10CheckDigit(core);
}

export function parseIsbn(input: string): IsbnResult {
  const s = cleanIsbn(input);
  if (!s) return { ok: false, problem: 'empty' };
  if (!/^[\dX]+$/.test(s) || (s.includes('X') && !/^\d{9}X$/.test(s))) return { ok: false, problem: 'characters' };
  if (s.length === 10) {
    if (!isValidIsbn10(s)) return { ok: false, problem: 'checksum' };
    return { ok: true, value: { isbn13: isbn10to13(s), isbn10: s } };
  }
  if (s.length === 13) {
    if (!/^97[89]/.test(s)) return { ok: false, problem: 'prefix' };
    if (!isValidIsbn13(s)) return { ok: false, problem: 'checksum' };
    return { ok: true, value: { isbn13: s, isbn10: isbn13to10(s) } };
  }
  return { ok: false, problem: 'length' };
}

/**
 * Turn a value read from a spreadsheet cell into an ISBN string. Hand-typed
 * ISBNs can arrive as numbers (9780140328721) and ISBN-10s can lose a leading
 * zero (140328726 → 0140328726).
 */
export function isbnFromCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    let s = Math.round(value).toString();
    if (s.length < 10) {
      const padded = s.padStart(10, '0');
      if (isValidIsbn10(padded)) s = padded;
    }
    return s;
  }
  return cleanIsbn(String(value));
}

/**
 * ISBN for display. Correct hyphenation depends on per-country range tables,
 * so show the plain 13 digits rather than wrongly placed dashes.
 */
export function formatIsbn13(isbn13: string): string {
  return isbn13;
}

/** True for barcodes that are book ISBNs (EAN-13 in the Bookland 978/979 range). */
export function isBooklandEan(code: string): boolean {
  return /^97[89]\d{10}$/.test(code) && isValidIsbn13(code);
}
