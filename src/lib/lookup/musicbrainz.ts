/**
 * MusicBrainz: free music catalogue, looked up by the barcode on a CD or record.
 * Covers come from the Cover Art Archive. Both allow browser requests.
 * MusicBrainz asks for at most 1 request per second.
 */
import type { BookMetadata } from '../types';
import { languageName } from '../languages';
import { barcodeVariants } from '../barcode';
import { extractYear } from './provider';
import { Throttle } from './throttle';

const throttle = new Throttle(1100);

interface MBRelease {
  id: string;
  title?: string;
  date?: string;
  barcode?: string;
  score?: number;
  'artist-credit'?: { name?: string; artist?: { name?: string } }[];
  'label-info'?: { label?: { name?: string } }[];
  media?: { format?: string }[];
  'text-representation'?: { language?: string };
}

/** CD, Vinyl, Cassette… from the release's medium format. */
export function musicCategory(format: string | undefined): string {
  const f = (format ?? '').toLowerCase();
  if (f.includes('vinyl') || /^\d+"/.test(f)) return 'Vinyl';
  if (f.includes('cassette')) return 'Cassette';
  if (f.includes('dvd') || f.includes('blu-ray')) return 'DVD';
  if (f.includes('cd')) return 'CD';
  return 'Music';
}

export function mapMusicBrainz(barcode: string, releases: MBRelease[] | undefined): BookMetadata | null {
  const variants = barcodeVariants(barcode);
  const r = releases?.find((x) => x.barcode && variants.includes(x.barcode)) ?? null;
  if (!r?.title) return null;
  const lang = r['text-representation']?.language;
  return {
    barcode,
    title: r.title.trim(),
    subtitle: '',
    authors: (r['artist-credit'] ?? []).map((a) => (a.name ?? a.artist?.name ?? '').trim()).filter(Boolean),
    publisher: r['label-info']?.find((l) => l.label?.name)?.label?.name?.trim() ?? '',
    year: extractYear(r.date),
    pages: null,
    language: lang && lang !== 'zxx' && lang !== 'mul' ? languageName(lang) : '',
    cover_url: `https://coverartarchive.org/release/${r.id}/front-250`,
    category: musicCategory(r.media?.[0]?.format),
  };
}

export async function lookupMusic(barcode: string, signal?: AbortSignal): Promise<BookMetadata | null> {
  const q = barcodeVariants(barcode)
    .map((b) => `barcode:${b}`)
    .join(' OR ');
  const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
  const res = await throttle.fetch(url, { headers: { Accept: 'application/json' } }, signal);
  if (res.status === 404) return null;
  const json = (await res.json()) as { releases?: MBRelease[] };
  return mapMusicBrainz(barcode, json.releases);
}
