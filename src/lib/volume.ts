/**
 * Volume numbers in one consistent place and style: "Royal Tailor, Vol. 2".
 * Sources disagree: some put "vol. 2" in the subtitle, some write "Royal
 * Tailor 2巻", "Royal Tailor (Volume 2)" or "Royal Tailor Vol.2".
 */
import type { BookMetadata } from './types';

const KEYWORD = String.raw`(?:vol(?:ume)?s?\.?|v\.|tome|tomo|deel|dl\.|cilt|band|bd\.|book|livre|libro|nr\.?|no\.?|#)`;

/** Subtitle that is nothing but a volume: "Vol. 2", "2", "Volume 2", "第2巻", "2巻", "Cilt 2". */
const SUBTITLE_ONLY = new RegExp(String.raw`^\s*(?:${KEYWORD}\s*)?(?:第\s*)?(\d{1,4})\s*(?:巻|권|集)?\s*\.?\s*$`, 'i');
/** Subtitle starting with a volume: "Vol. 2: The Hidden Thread" → number + rest. */
const SUBTITLE_LEADING = new RegExp(String.raw`^\s*${KEYWORD}\s*(\d{1,4})\s*[:.\-–—]\s*(.+)$`, 'i');
/** Title ending with a volume, with an explicit keyword or Japanese counter. */
const TITLE_TRAILING = new RegExp(
  String.raw`^(.*?\S)[\s,:;.\-–—]*(?:[(\[]\s*)?(?:${KEYWORD}\s*(\d{1,4})|第?\s*(\d{1,4})\s*(?:巻|권))(?:\s*[)\]])?\s*$`,
  'i',
);

export function formatVolume(title: string, n: number | string): string {
  return `${title.replace(/[\s,:;.\-–—]+$/, '')}, Vol. ${Number(n)}`;
}

export function normalizeVolume<T extends BookMetadata>(m: T): T {
  if (!m.title) return m;
  const out = { ...m };
  let title = out.title!.trim();
  let subtitle = (out.subtitle ?? '').trim();

  const t = TITLE_TRAILING.exec(title);
  if (t && !/, Vol\. \d+$/.test(title)) title = formatVolume(t[1], t[2] ?? t[3]);

  const only = SUBTITLE_ONLY.exec(subtitle);
  if (only && !/, Vol\. \d+$/.test(title)) {
    title = formatVolume(title, only[1]);
    subtitle = '';
  } else if (only) {
    subtitle = '';
  } else {
    const lead = SUBTITLE_LEADING.exec(subtitle);
    if (lead && !/, Vol\. \d+$/.test(title)) {
      title = formatVolume(title, lead[1]);
      subtitle = lead[2].trim();
    }
  }
  out.title = title;
  out.subtitle = subtitle;
  return out;
}

/** Title plus a catalogue's separate volume field ("2", "第2巻", "上"). */
export function volumeTitle(title: string, volume: string | undefined): string {
  const v = (volume ?? '').trim();
  if (!v) return title;
  const n = /(\d{1,4})/.exec(v);
  return n ? formatVolume(title, n[1]) : `${title} ${v}`;
}
