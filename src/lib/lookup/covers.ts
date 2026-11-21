/**
 * Cover images.
 *  - `sharpCover`: Google's cover links default to a 128-px-wide thumbnail and
 *    Open Library's to 180 px; this asks for a larger version of the same image
 *    (used when showing a cover, so nothing in the sheet changes).
 *  - `findCover`: one cover lookup for every place a book has no cover (your
 *    books, friends' books, new scans, series shelf tiles), tried in order:
 *      1. Amazon by ISBN-10 (978- ISBNs). A missing cover comes back as a 1×1
 *         pixel image, so the image is loaded and measured first.
 *      2. Google Books by title: "Name, Vol. N" for a volume of a series (the
 *         same volume number is required), else the title and the author's
 *         surname (the title found has to match). This finds another edition
 *         of the same book, e.g. the ebook, which usually has a cover.
 *    Results are remembered on this device per book.
 */
import { config } from '../config';
import { isbn13to10 } from '../isbn';
import { parseVolume, seriesKey } from '../series';
import { getLookup, putLookup } from '../store/db';
import { Throttle } from './throttle';

export function sharpCover(url: string): string {
  // Open Library: the large size instead of the 180-px medium one.
  if (/^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-M\.jpg$/.test(url)) return url.replace(/-M\.jpg$/, '-L.jpg');
  if (!/^https:\/\/books\.google\.com\/books\/content\?/.test(url) || /[?&]fife=/.test(url)) return url;
  return `${url}&fife=w400-h600`;
}

export function amazonCoverUrl(isbn10: string): string {
  return `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`;
}

function imageSize(url: string): Promise<{ w: number; h: number } | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => resolve(null), 10000);
    img.onload = () => {
      clearTimeout(timer);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

/** Amazon's cover for a book ('' when there is none). Only 978- ISBNs have an ISBN-10 to look up. */
export async function amazonCover(isbn13: string, isbn10 = ''): Promise<string> {
  const i10 = isbn10 || (isbn13.startsWith('978') ? isbn13to10(isbn13) : '');
  if (!i10) return '';
  const url = amazonCoverUrl(i10);
  const size = await imageSize(url);
  return size && size.w > 10 && size.h > 10 ? url : '';
}

interface GBCoverItem {
  volumeInfo?: { title?: string; subtitle?: string; imageLinks?: { thumbnail?: string } };
}

const google = new Throttle(400);

const letters = (s: string) => seriesKey(s).replace(/ /g, '');

/** Which Google query to run for a book, and how to recognise the right result. */
export function googleCoverQuery(title: string, author = ''): { q: string; matches: (found: string) => boolean } | null {
  const clean = title.replace(/\s*[(\[][^)\]]*[)\]]\s*/g, ' ').trim();
  if (!clean) return null;
  const p = parseVolume(clean);
  if (p) {
    const key = seriesKey(p.base);
    return {
      q: `"${p.base.replace(/"/g, '')}, Vol. ${p.volume}"`,
      // "Royal Tailor: Clothier to the Crown Vol. 2" is Royal Tailor Vol. 2.
      matches: (found) => {
        const f = parseVolume(found.replace(/\s*[(\[][^)\]]*[)\]]\s*/g, ' '));
        return !!f && f.volume === p.volume && (seriesKey(f.base) === key || seriesKey(f.base).startsWith(`${key} `));
      },
    };
  }
  const surname = author.trim().split(/\s+/).pop() ?? '';
  const want = letters(clean);
  if (want.length < 3) return null;
  return {
    q: `intitle:"${clean.replace(/"/g, '')}"${surname ? ` inauthor:"${surname.replace(/"/g, '')}"` : ''}`,
    matches: (found) => letters(found).startsWith(want.slice(0, 24)),
  };
}

async function googleCover(title: string, author: string): Promise<string> {
  const query = googleCoverQuery(title, author);
  if (!query) return '';
  const params = new URLSearchParams({ q: query.q, maxResults: '10', printType: 'books' });
  if (config.booksApiKey) params.set('key', config.booksApiKey);
  const res = await google.fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!res.ok) return '';
  const items = ((await res.json()) as { items?: GBCoverItem[] }).items ?? [];
  const hit = items.find((i) => i.volumeInfo?.imageLinks?.thumbnail && query.matches([i.volumeInfo.title, i.volumeInfo.subtitle].filter(Boolean).join(' ')));
  return (hit?.volumeInfo?.imageLinks?.thumbnail ?? '').replace(/^http:/, 'https:').replace(/&edge=curl/, '');
}

const DAY = 24 * 3600 * 1000;
const inFlight = new Map<string, Promise<string>>();

export interface CoverQuery {
  isbn13?: string;
  isbn10?: string;
  title?: string;
  authors?: string[];
}

/** A cover for a book that has none ('' when no source has one). Cached per book on this device. */
export function findCover(b: CoverQuery): Promise<string> {
  const key = `cover1:${b.isbn13 || seriesKey(b.title ?? '')}`;
  if (key === 'cover1:') return Promise.resolve('');
  let p = inFlight.get(key);
  if (!p) {
    p = (async () => {
      const cached = (await getLookup(key)) as unknown as { cover?: string; at?: number } | undefined;
      // Found covers are kept for a month; "none" is asked again after three days.
      if (cached?.at && Date.now() - cached.at < (cached.cover ? 30 : 3) * DAY) return cached.cover ?? '';
      let cover = '';
      try {
        if (b.isbn13) cover = await amazonCover(b.isbn13, b.isbn10);
        if (!cover && b.title) cover = await googleCover(b.title, b.authors?.[0] ?? '');
      } catch {
        return ''; // offline: try again another time
      }
      await putLookup({ isbn: key, metadata: null, sources: [], at: Date.now(), cover } as never);
      return cover;
    })();
    inFlight.set(key, p);
  }
  return p;
}
