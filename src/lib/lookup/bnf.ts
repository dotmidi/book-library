import type { BookMetadata } from '../types';
import { languageName } from '../languages';
import { catalogueName, extractPages, extractYear, type MetadataProvider } from './provider';
import { Throttle } from './throttle';
import { firstBlock, tagTexts } from './xml';

/**
 * BnF (Bibliothèque nationale de France) SRU catalogue: free, no key.
 * Strong for French-language books. https://api.bnf.fr/
 */
export function mapBnf(isbn13: string, xml: string): BookMetadata | null {
  const rec = firstBlock(xml, 'srw:recordData');
  if (!rec) return null;
  const rawTitle = tagTexts(rec, 'dc:title')[0] ?? '';
  // "Titre : sous-titre / Auteur" → title, subtitle
  const [main] = rawTitle.split(/\s+\/\s+/);
  const [title, ...rest] = main.split(/\s+:\s+/);
  if (!title?.trim()) return null;
  const lang = tagTexts(rec, 'dc:language')[0];
  const publisher = (tagTexts(rec, 'dc:publisher')[0] ?? '').replace(/\s*\([^)]*\)\s*$/, '');
  return {
    isbn13,
    title: title.trim(),
    subtitle: rest.join(' : ').trim(),
    authors: tagTexts(rec, 'dc:creator').map((a) => catalogueName(a)).filter(Boolean),
    publisher,
    year: extractYear(tagTexts(rec, 'dc:date')[0]),
    pages: extractPages(tagTexts(rec, 'dc:format')[0]),
    language: lang ? languageName(lang) : '',
    cover_url: '',
  };
}

export class BnfProvider implements MetadataProvider {
  id = 'bnf';
  name = 'BnF';
  prefixes = ['9782', '97910'];
  private throttle = new Throttle(1000);

  async lookup(isbn13: string, signal?: AbortSignal): Promise<BookMetadata | null> {
    const q = encodeURIComponent(`bib.isbn all "${isbn13}"`);
    const url = `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${q}&recordSchema=dublincore&maximumRecords=1`;
    const res = await this.throttle.fetch(url, {}, signal);
    if (res.status === 404) return null;
    return mapBnf(isbn13, await res.text());
  }
}
