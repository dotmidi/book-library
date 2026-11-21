import type { Book } from './types';

/** Accent- and case-insensitive text for searching ("Çalıkuşu" matches "calikusu"). */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .toLowerCase();
}

export function searchText(b: Book): string {
  return fold([b.title, b.title_en, b.subtitle, b.authors.join(' '), b.publisher, b.isbn13, b.isbn10, b.tags.join(' '), b.location, b.lent_to].join(' '));
}

export function matchesQuery(b: Book, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  const digits = q.replace(/[\s-]/g, '');
  const text = searchText(b);
  if (/^\d{4,}x?$/.test(digits) && (b.isbn13.includes(digits) || b.isbn10.toLowerCase().includes(digits))) return true;
  return q.split(/\s+/).every((word) => text.includes(word));
}

export function uniqueSorted(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const s = v.trim();
    if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** The title as written on the book (shown on the book's own page). */
export function originalTitle(b: Book, fallback: string): string {
  return b.title || (b.isbn13 ? `${fallback} (${b.isbn13})` : fallback);
}

/** The title shown in the library: the English translation when there is one. */
export function displayTitle(b: Book, fallback: string): string {
  return b.title_en || originalTitle(b, fallback);
}

const ARTICLE = /^(?:the|a|an|de|het|een|le|la|les|der|die|das)\s+|^l'/;

/** A–Z key: the shown title without a leading article ("The Quintessential Quintuplets" sorts under Q). */
export function titleSortKey(b: Book): string {
  return fold(b.title_en || b.title).replace(/^[^\p{L}\p{N}]+/u, '').replace(ARTICLE, '');
}

export function sortKeyAuthor(b: Book): string {
  const a = b.authors[0] ?? '';
  // Sort by last name: "Roald Dahl" → "dahl roald"
  const parts = a.split(/\s+/);
  return fold(parts.length > 1 ? `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}` : a);
}
