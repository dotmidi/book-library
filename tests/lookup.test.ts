import { describe, expect, it, vi } from 'vitest';
import { isComplete, lookupIsbn, mergeMetadata } from '../src/lib/lookup/chain';
import type { MetadataProvider } from '../src/lib/lookup/provider';
import { mapOpenLibrary } from '../src/lib/lookup/openlibrary';
import { mapGoogleBooks } from '../src/lib/lookup/googlebooks';
import { Throttle } from '../src/lib/lookup/throttle';
import type { BookMetadata } from '../src/lib/types';

const ISBN = '9780140328721';
const FULL: BookMetadata = {
  isbn13: ISBN,
  title: 'Fantastic Mr. Fox',
  authors: ['Roald Dahl'],
  publisher: 'Puffin',
  year: 1988,
  pages: 96,
  language: 'English',
  cover_url: 'https://covers.openlibrary.org/b/id/15152634-M.jpg',
};

function provider(name: string, impl: () => Promise<BookMetadata | null>): MetadataProvider & { calls: number } {
  const p = {
    id: name.toLowerCase(),
    name,
    calls: 0,
    lookup: vi.fn(async () => {
      p.calls++;
      return impl();
    }),
  };
  return p;
}

describe('lookupIsbn fallback chain', () => {
  it('stops at the first provider when it returns complete data', async () => {
    const a = provider('A', async () => FULL);
    const b = provider('B', async () => ({ title: 'other' }));
    const out = await lookupIsbn(ISBN, [a, b]);
    expect(out.metadata?.title).toBe('Fantastic Mr. Fox');
    expect(out.sources).toEqual(['A']);
    expect(b.calls).toBe(0);
  });

  it('falls through to the next provider when the first finds nothing', async () => {
    const a = provider('A', async () => null);
    const b = provider('B', async () => FULL);
    const out = await lookupIsbn(ISBN, [a, b]);
    expect(out.metadata?.title).toBe('Fantastic Mr. Fox');
    expect(out.sources).toEqual(['B']);
  });

  it('falls through on errors and reports them without throwing', async () => {
    const a = provider('A', async () => {
      throw new Error('HTTP 503');
    });
    const b = provider('B', async () => FULL);
    const out = await lookupIsbn(ISBN, [a, b]);
    expect(out.metadata?.title).toBe('Fantastic Mr. Fox');
    expect(out.errors).toEqual([{ provider: 'A', message: 'HTTP 503' }]);
  });

  it('returns null when nobody knows the book', async () => {
    const out = await lookupIsbn(ISBN, [provider('A', async () => null), provider('B', async () => null)]);
    expect(out.metadata).toBeNull();
    expect(out.errors).toEqual([]);
  });

  it('returns null with errors when everything failed', async () => {
    const fail = async () => {
      throw new Error('offline');
    };
    const out = await lookupIsbn(ISBN, [provider('A', fail), provider('B', fail)]);
    expect(out.metadata).toBeNull();
    expect(out.errors.length).toBe(2);
  });

  it('fills blanks from later providers without overwriting', async () => {
    const a = provider('A', async () => ({ title: 'De Avonden', authors: ['Gerard Reve'], cover_url: '' }));
    const b = provider('B', async () => ({ title: 'The Evenings', authors: ['G. Reve'], language: 'Dutch', pages: 320, year: 1947, publisher: 'X', cover_url: 'https://x/c.jpg' }));
    const out = await lookupIsbn(ISBN, [a, b]);
    expect(out.metadata).toMatchObject({ title: 'De Avonden', authors: ['Gerard Reve'], language: 'Dutch', pages: 320, cover_url: 'https://x/c.jpg' });
    expect(out.sources).toEqual(['A', 'B']);
  });

  it('ignores results without a title', async () => {
    const a = provider('A', async () => ({ title: '' }));
    const b = provider('B', async () => FULL);
    expect((await lookupIsbn(ISBN, [a, b])).sources).toEqual(['B']);
  });

  it('times out slow providers', async () => {
    const a = provider('A', () => new Promise(() => {}));
    const b = provider('B', async () => FULL);
    const out = await lookupIsbn(ISBN, [a, b], { timeoutMs: 20 });
    expect(out.metadata?.title).toBe(FULL.title);
    expect(out.errors[0].message).toBe('Timed out');
  });

  it('merge and completeness helpers', () => {
    expect(isComplete(FULL)).toBe(true);
    expect(isComplete({ title: 'x' })).toBe(false);
    expect(mergeMetadata({ title: 'a', authors: [] }, { title: 'b', authors: ['c'] })).toEqual({ title: 'a', authors: ['c'] });
  });
});

describe('provider response mapping', () => {
  it('maps Open Library, keeping cover-by-ID URLs and the language', () => {
    const m = mapOpenLibrary(
      ISBN,
      {
        title: 'Fantastic Mr. Fox',
        authors: [{ name: 'Roald Dahl' }],
        publishers: [{ name: 'Puffin' }],
        publish_date: 'October 1, 1988',
        number_of_pages: 96,
        cover: { medium: 'https://covers.openlibrary.org/b/id/15152634-M.jpg' },
        identifiers: { isbn_10: ['0140328726'] },
      },
      { details: { languages: [{ key: '/languages/eng' }], covers: [15152634] } },
    );
    expect(m).toEqual({ ...FULL, isbn10: '0140328726', subtitle: '' });
  });

  it('rebuilds an Open Library cover URL from the cover id if needed', () => {
    const m = mapOpenLibrary(ISBN, { title: 'x', cover: { medium: 'https://covers.openlibrary.org/b/isbn/123-M.jpg' } }, { details: { covers: [-1, 42] } });
    expect(m?.cover_url).toBe('https://covers.openlibrary.org/b/id/42-M.jpg');
  });

  it('maps Google Books and prefers the volume with the matching ISBN', () => {
    const m = mapGoogleBooks(ISBN, [
      { volumeInfo: { title: 'Wrong', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9999999999999' }] } },
      {
        volumeInfo: {
          title: 'Fantastic Mr Fox',
          authors: ['Roald Dahl'],
          publishedDate: '1988-10',
          pageCount: 96,
          language: 'en',
          imageLinks: { thumbnail: 'http://books.google.com/books/content?id=1&printsec=frontcover&img=1&zoom=1&edge=curl' },
          industryIdentifiers: [
            { type: 'ISBN_13', identifier: ISBN },
            { type: 'ISBN_10', identifier: '0140328726' },
          ],
        },
      },
    ]);
    expect(m).toMatchObject({
      title: 'Fantastic Mr Fox',
      year: 1988,
      language: 'English',
      isbn10: '0140328726',
      cover_url: 'https://books.google.com/books/content?id=1&printsec=frontcover&img=1&zoom=1',
    });
  });

  it('returns null for empty results', () => {
    expect(mapGoogleBooks(ISBN, undefined)).toBeNull();
    expect(mapOpenLibrary(ISBN, undefined)).toBeNull();
  });
});

describe('Throttle', () => {
  it('spaces requests at least intervalMs apart', async () => {
    let now = 0;
    const waits: number[] = [];
    const th = new Throttle(1000, 3, () => now, async (ms) => {
      waits.push(ms);
      now += ms;
    });
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => th.schedule(async () => starts.push(now))));
    expect(starts).toEqual([0, 1000, 2000]);
  });

  it('retries 429 with backoff and then succeeds', async () => {
    let now = 0;
    const waits: number[] = [];
    const th = new Throttle(0, 3, () => now, async (ms) => {
      waits.push(ms);
      now += ms;
    });
    const responses = [new Response('', { status: 429 }), new Response('', { status: 429, headers: { 'Retry-After': '5' } }), new Response('{}', { status: 200 })];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal('fetch', fetchMock);
    const res = await th.fetch('https://openlibrary.org/x');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(waits.filter((w) => w > 0)).toEqual([1000, 5000]);
    vi.unstubAllGlobals();
  });

  it('gives up after maxRetries', async () => {
    const th = new Throttle(0, 2, () => 0, async () => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(th.fetch('https://openlibrary.org/x')).rejects.toThrow('HTTP 503');
    vi.unstubAllGlobals();
  });
});
