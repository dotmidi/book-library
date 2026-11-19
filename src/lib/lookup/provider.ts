import type { BookMetadata } from '../types';

/**
 * A source of book details. To add one (e.g. a Dutch or Turkish catalogue),
 * implement this interface and add it to `defaultProviders()` in chain.ts.
 */
export interface MetadataProvider {
  /** Stable id, e.g. "openlibrary". */
  id: string;
  /** Name shown to the user, e.g. "Open Library". */
  name: string;
  /**
   * ISBN-13 prefixes this source specialises in (e.g. ["9784"] for Japan).
   * Specialists are asked first for matching ISBNs and skipped for others.
   * Leave out for general sources, which are asked for every ISBN.
   */
  prefixes?: string[];
  /** Only ask this source when no earlier source found the book at all. */
  lastResort?: boolean;
  /**
   * Look up one ISBN-13.
   * Resolve `null` when the source has no record; throw on network/server errors.
   */
  lookup(isbn13: string, signal?: AbortSignal): Promise<BookMetadata | null>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    });
  });

/**
 * Library-catalogue name → display name.
 * "Bomsel, Olivier. Auteur du texte" → "Olivier Bomsel"
 * "夏目, 漱石, 1867-1916" (eastern) → "夏目 漱石"
 */
export function catalogueName(raw: string, eastern = false): string {
  let s = raw
    .replace(/\.\s+(Auteur|Traducteur|Illustrateur|Éditeur|Préfacier|Directeur)[^,]*$/i, '')
    .replace(/[,\s]*\(?\d{4}\s*-\s*(\d{4})?\)?\.?\s*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .replace(/[.,]$/, '');
  const parts = s.split(/\s*,\s*/).filter(Boolean);
  if (parts.length >= 2) s = eastern ? `${parts[0]} ${parts[1]}` : `${parts[1]} ${parts[0]}`;
  return s.trim();
}

/** Page count out of "1 vol. (282 p.)", "372p", "xii, 290 pages". */
export function extractPages(s: unknown): number | null {
  const m = /(\d{1,5})\s*(?:p\b|p\.|pages|ページ)/i.exec(String(s ?? ''));
  return m ? Number(m[1]) : null;
}

/** Pull a 4-digit year out of "October 1, 1988", "1988-10", "c1988"… */
export function extractYear(s: unknown): number | null {
  const m = /(1[4-9]\d\d|20\d\d)/.exec(String(s ?? ''));
  return m ? Number(m[1]) : null;
}
