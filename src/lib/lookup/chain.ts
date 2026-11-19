import type { BookMetadata } from '../types';
import type { MetadataProvider } from './provider';

export interface LookupOutcome {
  /** null when no provider knew the book. */
  metadata: BookMetadata | null;
  /** Providers that contributed fields, in order. */
  sources: string[];
  /** Providers that failed (network / server errors), with a short message. */
  errors: { provider: string; message: string }[];
}

/** Fields worth asking the next provider about if the first one left them blank. */
const FILLABLE: (keyof BookMetadata)[] = ['title', 'subtitle', 'authors', 'publisher', 'year', 'pages', 'language', 'cover_url', 'isbn10'];
const IMPORTANT: (keyof BookMetadata)[] = ['authors', 'language', 'cover_url', 'pages', 'year', 'publisher'];

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Fill blanks in `base` from `extra`. Never overwrites a value base already has. */
export function mergeMetadata(base: BookMetadata, extra: BookMetadata): BookMetadata {
  const out: BookMetadata = { ...base };
  for (const k of FILLABLE) {
    if (isBlank(out[k]) && !isBlank(extra[k])) (out as Record<string, unknown>)[k] = extra[k];
  }
  return out;
}

export function isComplete(m: BookMetadata): boolean {
  return IMPORTANT.every((k) => !isBlank(m[k]));
}

/**
 * Which providers to ask for this ISBN, in order: specialists whose prefixes
 * match (e.g. Japanese catalogues for 978-4…) first, then the general ones.
 * Specialists for other regions are skipped, so they cost nothing.
 */
export function orderProviders(isbn13: string, providers: MetadataProvider[]): MetadataProvider[] {
  const matches = (p: MetadataProvider) => p.prefixes?.some((pre) => isbn13.startsWith(pre));
  return [...providers.filter((p) => p.prefixes?.length && matches(p)), ...providers.filter((p) => !p.prefixes?.length)];
}

/**
 * Ask providers in order. The first hit becomes the result; later providers are
 * only asked to fill blanks. Errors never throw: they move on to the next provider.
 */
export async function lookupIsbn(
  isbn13: string,
  providers: MetadataProvider[],
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LookupOutcome> {
  const outcome: LookupOutcome = { metadata: null, sources: [], errors: [] };
  for (const p of orderProviders(isbn13, providers)) {
    if (outcome.metadata && isComplete(outcome.metadata)) break;
    if (opts.signal?.aborted) break;
    if (p.lastResort && outcome.metadata) continue;
    try {
      const result = await withTimeout(p.lookup(isbn13, opts.signal), opts.timeoutMs ?? 15000);
      if (!result || isBlank(result.title)) continue;
      outcome.metadata = outcome.metadata ? mergeMetadata(outcome.metadata, result) : { ...result };
      outcome.sources.push(p.name);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') break;
      outcome.errors.push({ provider: p.name, message: (e as Error)?.message ?? String(e) });
    }
  }
  return outcome;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
