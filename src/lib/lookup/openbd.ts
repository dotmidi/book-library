import type { BookMetadata } from '../types';
import { languageName } from '../languages';
import { catalogueName, extractYear, type MetadataProvider } from './provider';
import { Throttle } from './throttle';
import { volumeTitle } from '../volume';

/** openBD (Japan): free, no key, covers books sold in Japan. https://openbd.jp/ */

interface OpenBDRecord {
  summary?: { title?: string; volume?: string; series?: string; publisher?: string; pubdate?: string; cover?: string; author?: string };
  onix?: {
    DescriptiveDetail?: {
      TitleDetail?: { TitleElement?: { TitleText?: { content?: string }; Subtitle?: { content?: string } } };
      Contributor?: { PersonName?: { content?: string } }[];
      Extent?: { ExtentType?: string; ExtentValue?: string }[];
      Language?: { LanguageRole?: string; LanguageCode?: string }[];
    };
  };
}

export function mapOpenBD(isbn13: string, rec: OpenBDRecord | null | undefined): BookMetadata | null {
  const s = rec?.summary;
  const d = rec?.onix?.DescriptiveDetail;
  const title = (d?.TitleDetail?.TitleElement?.TitleText?.content || s?.title || '').trim();
  if (!title) return null;
  const volume = s?.volume?.trim();
  const authors = (d?.Contributor ?? [])
    .map((c) => catalogueName(c.PersonName?.content ?? '', true))
    .filter(Boolean);
  if (!authors.length && s?.author) {
    // summary.author is "family,given,dates family,given…" — keep it simple.
    authors.push(...s.author.split(/\s+/).map((a) => catalogueName(a.replace(/,/g, ', '), true)).filter(Boolean));
  }
  // ONIX ExtentType 11 = number of pages
  const pages = Number((d?.Extent?.find((e) => e.ExtentType === '11') ?? d?.Extent?.[0])?.ExtentValue) || null;
  const lang = d?.Language?.find((l) => l.LanguageRole === '01')?.LanguageCode ?? d?.Language?.[0]?.LanguageCode;
  return {
    isbn13,
    title: volumeTitle(title, volume),
    subtitle: d?.TitleDetail?.TitleElement?.Subtitle?.content?.trim() ?? '',
    authors,
    publisher: s?.publisher?.trim() ?? '',
    year: extractYear(s?.pubdate),
    pages,
    language: lang ? languageName(lang) : '',
    cover_url: s?.cover?.replace(/^http:/, 'https:') ?? '',
  };
}

export class OpenBDProvider implements MetadataProvider {
  id = 'openbd';
  name = 'openBD';
  prefixes = ['9784'];
  private throttle = new Throttle(500);

  async lookup(isbn13: string, signal?: AbortSignal): Promise<BookMetadata | null> {
    const res = await this.throttle.fetch(`https://api.openbd.jp/v1/get?isbn=${isbn13}`, {}, signal);
    if (res.status === 404) return null;
    const json = (await res.json()) as (OpenBDRecord | null)[];
    return mapOpenBD(isbn13, json?.[0]);
  }
}
