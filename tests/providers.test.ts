import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { guessLanguage, isbnRegion } from '../src/lib/isbnRegion';
import { lookupIsbn, orderProviders } from '../src/lib/lookup/chain';
import { mapOpenBD } from '../src/lib/lookup/openbd';
import { mapNdl } from '../src/lib/lookup/ndl';
import { mapBnf } from '../src/lib/lookup/bnf';
import { mapCrossref } from '../src/lib/lookup/crossref';
import { catalogueName, extractPages, type MetadataProvider } from '../src/lib/lookup/provider';
import { decodeXml, tagTexts } from '../src/lib/lookup/xml';
import { metadataToBook } from '../src/lib/lookup/service';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('ISBN region detection', () => {
  it.each([
    ['9784101010137', 'Japan', 'Japanese'],
    ['9789044649413', 'Netherlands / Flanders', 'Dutch'],
    ['9789401234567', 'Netherlands / Flanders', 'Dutch'],
    ['9786053607892', 'Turkey', 'Turkish'],
    ['9789750719387', 'Turkey', 'Turkish'],
    ['9789944123456', 'Turkey', 'Turkish'],
    ['9788970123455', 'South Korea', 'Korean'],
    ['9791112345678', 'South Korea', 'Korean'],
    ['9787020002207', 'China', 'Chinese'],
    ['9789571234567', 'Taiwan', 'Chinese'],
    ['9783442473298', 'German-speaking countries', 'German'],
    ['9782070360246', 'French-speaking countries', 'French'],
    ['9791032305690', 'France', 'French'],
    ['9780140328721', 'English-speaking countries', 'English'],
    ['9798123456789', 'United States', 'English'],
  ])('%s → %s', (isbn, area, lang) => {
    expect(isbnRegion(isbn)).toMatchObject({ area, language: lang });
  });

  it('prefers the longest matching prefix', () => {
    expect(isbnRegion('9789944123456')!.prefix).toBe('9789944');
    expect(isbnRegion('9786053607892')!.prefix).toBe('978605');
  });

  it('gives no language for multilingual or unknown groups', () => {
    expect(guessLanguage('9788112345678')).toBe(''); // India
    expect(guessLanguage('9789621234567')).toBe(''); // Hong Kong
    expect(guessLanguage('123')).toBe('');
  });

  it('pre-fills the language of an unknown book from its ISBN', () => {
    expect(metadataToBook(null, '9786053607892', '').language).toBe('Turkish');
    expect(metadataToBook(null, '9789044649413', '').language).toBe('Dutch');
    // a source's own language always wins
    expect(metadataToBook({ title: 'x', language: 'English' }, '9789044649413', '').language).toBe('English');
  });
});

describe('provider ordering', () => {
  const p = (id: string, extra: Partial<MetadataProvider> = {}): MetadataProvider => ({ id, name: id, lookup: async () => null, ...extra });
  const all = [p('openbd', { prefixes: ['9784'] }), p('bnf', { prefixes: ['9782', '97910'] }), p('openlibrary'), p('google'), p('crossref', { lastResort: true })];
  const ids = (isbn: string) => orderProviders(isbn, all).map((x) => x.id);

  it('asks Japanese specialists first for Japanese ISBNs', () => {
    expect(ids('9784101010137')).toEqual(['openbd', 'openlibrary', 'google', 'crossref']);
  });
  it('asks the French catalogue for French ISBNs (both 978-2 and 979-10)', () => {
    expect(ids('9782070360246')[0]).toBe('bnf');
    expect(ids('9791032305690')[0]).toBe('bnf');
  });
  it('skips specialists for other regions', () => {
    expect(ids('9789044649413')).toEqual(['openlibrary', 'google', 'crossref']);
  });

  it('only asks a last-resort source when nothing else found the book', async () => {
    const cross = vi.fn(async () => ({ title: 'From Crossref' }));
    const sources = (first: () => Promise<{ title: string } | null>) => [
      p('a', { lookup: first }),
      p('crossref', { lastResort: true, lookup: cross }),
    ];
    await lookupIsbn('9780140328721', sources(async () => ({ title: 'Found' })));
    expect(cross).not.toHaveBeenCalled();
    const out = await lookupIsbn('9780140328721', sources(async () => null));
    expect(cross).toHaveBeenCalledTimes(1);
    expect(out.metadata?.title).toBe('From Crossref');
  });
});

describe('helpers', () => {
  it('turns catalogue names into display names', () => {
    expect(catalogueName('Bomsel, Olivier. Auteur du texte')).toBe('Olivier Bomsel');
    expect(catalogueName('夏目, 漱石, 1867-1916', true)).toBe('夏目 漱石');
    expect(catalogueName('井上, 真偽', true)).toBe('井上 真偽');
    expect(catalogueName('Hugo, Victor (1802-1885)')).toBe('Victor Hugo');
    expect(catalogueName('Plato')).toBe('Plato');
  });
  it('reads page counts', () => {
    expect(extractPages('1 vol. (282 p.) : couv. ill. ; 21 cm')).toBe(282);
    expect(extractPages('372p ; 16cm')).toBe(372);
    expect(extractPages('xii, 290 pages')).toBe(290);
    expect(extractPages('')).toBeNull();
  });
  it('reads XML tags and entities', () => {
    const xml = '<a><dc:title>Tom &amp; Jerry</dc:title><dc:title xml:lang="fr"><![CDATA[Le <b>chat</b>]]></dc:title></a>';
    expect(tagTexts(xml, 'dc:title')).toEqual(['Tom & Jerry', 'Le <b>chat</b>']);
    expect(decodeXml('&#26085;&#x672C;')).toBe('日本');
  });
});

describe('Japanese and French sources (real responses)', () => {
  it('maps openBD', () => {
    const m = mapOpenBD('9784101010137', JSON.parse(fixture('openbd.json'))[0]);
    expect(m).toMatchObject({ title: 'こころ', authors: ['夏目 漱石'], publisher: '新潮社', year: 2004 });
  });
  it('returns null for an openBD miss', () => {
    expect(mapOpenBD('9780140328721', null)).toBeNull();
  });

  it('maps NDL Search', () => {
    const m = mapNdl('9784062938532', fixture('ndl.xml'));
    expect(m).toMatchObject({ title: 'その可能性はすでに考えた', authors: ['井上 真偽'] });
    expect(m?.publisher).toBeTruthy();
    expect(m?.year).toBeGreaterThan(2000);
  });
  it('returns null for an NDL miss', () => {
    expect(mapNdl('9784062938532', '<rss><channel><openSearch:totalResults>0</openSearch:totalResults></channel></rss>')).toBeNull();
  });

  it('maps the BnF catalogue', () => {
    const m = mapBnf('9782070360246', fixture('bnf.xml'));
    expect(m).toMatchObject({
      title: "L'économie immatérielle",
      subtitle: "industries et marchés d'expériences",
      authors: ['Olivier Bomsel'],
      publisher: 'Gallimard',
      year: 2010,
      pages: 282,
      language: 'French',
    });
  });

  it('maps Crossref and ignores non-book records', () => {
    expect(
      mapCrossref('9780000000000', [
        { type: 'journal-article', title: ['Not a book'] },
        { type: 'monograph', title: ['Hokusai'], author: [{ given: 'Timothy', family: 'Clark' }], publisher: 'British Museum', published: { 'date-parts': [[2017]] } },
      ]),
    ).toMatchObject({ title: 'Hokusai', authors: ['Timothy Clark'], publisher: 'British Museum', year: 2017 });
    expect(mapCrossref('9780000000000', [])).toBeNull();
  });
});
