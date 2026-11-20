import type { BookMetadata } from '../types';
import { languageName } from '../languages';
import { catalogueName, extractPages, extractYear, type MetadataProvider } from './provider';
import { Throttle } from './throttle';
import { volumeTitle } from '../volume';
import { firstBlock, tagTexts } from './xml';

/**
 * NDL Search (National Diet Library, Japan): free, no key. Holds nearly every
 * book published in Japan. https://ndlsearch.ndl.go.jp/en/help/api
 * Its cover thumbnails can't be used from other sites, so no cover here.
 */
export function mapNdl(isbn13: string, xml: string): BookMetadata | null {
  const item = firstBlock(xml, 'item');
  if (!item) return null;
  const title = tagTexts(item, 'dc:title')[0] ?? tagTexts(item, 'title')[0] ?? '';
  if (!title) return null;
  const volume = tagTexts(item, 'dcndl:volume')[0];
  const lang = tagTexts(item, 'dc:language')[0];
  return {
    isbn13,
    title: volumeTitle(title, volume),
    subtitle: '',
    authors: tagTexts(item, 'dc:creator').map((a) => catalogueName(a, true)).filter(Boolean),
    publisher: tagTexts(item, 'dc:publisher')[0] ?? '',
    year: extractYear(tagTexts(item, 'dcterms:issued')[0] ?? tagTexts(item, 'dc:date')[0]),
    pages: extractPages(tagTexts(item, 'dcterms:extent')[0]),
    language: lang ? languageName(lang) : '',
    cover_url: '',
  };
}

export class NdlProvider implements MetadataProvider {
  id = 'ndl';
  name = 'National Diet Library';
  prefixes = ['9784'];
  private throttle = new Throttle(1000);

  async lookup(isbn13: string, signal?: AbortSignal): Promise<BookMetadata | null> {
    const res = await this.throttle.fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${isbn13}&cnt=1`, {}, signal);
    if (res.status === 404) return null;
    return mapNdl(isbn13, await res.text());
  }
}
