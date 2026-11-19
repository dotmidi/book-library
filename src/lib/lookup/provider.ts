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

/** Pull a 4-digit year out of "October 1, 1988", "1988-10", "c1988"… */
export function extractYear(s: unknown): number | null {
  const m = /(1[4-9]\d\d|20\d\d)/.exec(String(s ?? ''));
  return m ? Number(m[1]) : null;
}
