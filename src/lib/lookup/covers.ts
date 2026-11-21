/**
 * Cover images:
 *  - Google's cover links default to a 128-px-wide thumbnail and Open Library's to 180 px; `sharpCover` asks
 *    for a larger version of the same image (used when showing a cover, so
 *    nothing in the sheet changes).
 *  - Amazon has covers for many books the other sources lack (Japanese art
 *    books, the newest manga volumes), keyed by ISBN-10. A missing cover comes
 *    back as a 1×1 pixel image, so the image is loaded and measured first.
 */
import { isbn13to10 } from '../isbn';

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
