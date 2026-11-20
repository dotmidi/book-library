import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barcodeVariants, gtinCheckDigit, isValidGtin, parseCode, sameBarcode } from '../src/lib/barcode';
import { formatVolume, normalizeVolume, volumeTitle } from '../src/lib/volume';
import { mapMusicBrainz, musicCategory } from '../src/lib/lookup/musicbrainz';
import { authorMatches, bestMatch, mapOLSearch, titleSimilarity } from '../src/lib/lookup/titleSearch';
import { countryCode, flagEmoji, locationFlag, suggestLocations } from '../src/lib/countries';
import { codeFromInput, metaValue, parseFriends } from '../src/lib/friends/sharing';
import { bookToRow, resolveColumns, rowToBook } from '../src/lib/sheets/mapping';
import { FIELDS } from '../src/lib/sheets/schema';
import { emptyBook, type Book } from '../src/lib/types';
import { metadataToBook } from '../src/lib/lookup/service';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('barcodes (CDs, vinyl)', () => {
  it('validates GTIN check digits', () => {
    expect(gtinCheckDigit('07777464462')).toBe('4');
    expect(isValidGtin('077774644624')).toBe(true); // UPC-A
    expect(isValidGtin('0077774644624')).toBe(true); // same as EAN-13
    expect(isValidGtin('5099902987026')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true); // EAN-8
    expect(isValidGtin('077774644625')).toBe(false);
  });

  it('sends Bookland codes to the ISBN parser and everything else to barcode', () => {
    expect(parseCode('9780140328721')).toEqual({ ok: true, value: { kind: 'isbn', isbn13: '9780140328721', isbn10: '0140328726' } });
    expect(parseCode('0-14-032872-6')).toMatchObject({ ok: true, value: { kind: 'isbn', isbn13: '9780140328721' } });
    expect(parseCode('077774644624')).toEqual({ ok: true, value: { kind: 'barcode', barcode: '077774644624' } });
    expect(parseCode('9780140328722')).toEqual({ ok: false, problem: 'checksum' });
    expect(parseCode('077774644625')).toEqual({ ok: false, problem: 'checksum' });
    expect(parseCode('12345')).toEqual({ ok: false, problem: 'length' });
    expect(parseCode('')).toEqual({ ok: false, problem: 'empty' });
  });

  it('treats 12- and 13-digit spellings of a UPC as the same product', () => {
    expect(barcodeVariants('077774644624')).toEqual(['077774644624', '0077774644624']);
    expect(sameBarcode('0077774644624', '077774644624')).toBe(true);
    expect(sameBarcode('5099902987026', '077774644624')).toBe(false);
    expect(sameBarcode('', '077774644624')).toBe(false);
  });
});

describe('MusicBrainz', () => {
  it('maps the release that carries the scanned barcode', () => {
    const m = mapMusicBrainz('077774644624', JSON.parse(fixture('musicbrainz.json')).releases);
    expect(m).toMatchObject({
      barcode: '077774644624',
      title: 'Abbey Road',
      authors: ['The Beatles'],
      publisher: 'Parlophone',
      year: 1987,
      language: 'English',
      category: 'CD',
      cover_url: 'https://coverartarchive.org/release/02fb1dd7-4256-40a8-a0a8-551314a0b5d4/front-250',
    });
  });
  it('matches the 13-digit spelling too, and returns null when nothing matches', () => {
    const rel = JSON.parse(fixture('musicbrainz.json')).releases;
    expect(mapMusicBrainz('0077774644624', rel)?.title).toBe('Abbey Road');
    expect(mapMusicBrainz('4006381333931', rel)).toBeNull();
    expect(mapMusicBrainz('4006381333931', [])).toBeNull();
  });
  it('turns formats into categories', () => {
    expect(musicCategory('CD')).toBe('CD');
    expect(musicCategory('12" Vinyl')).toBe('Vinyl');
    expect(musicCategory('7"')).toBe('Vinyl');
    expect(musicCategory('Cassette')).toBe('Cassette');
    expect(musicCategory(undefined)).toBe('Music');
  });
  it('fills a music item: barcode kept, no ISBN, category set', () => {
    const b = metadataToBook({ title: 'Abbey Road', category: 'CD', authors: ['The Beatles'] }, '', '', '077774644624');
    expect(b).toMatchObject({ barcode: '077774644624', isbn13: '', category: 'CD', language: '' });
  });
});

describe('volume numbers in titles', () => {
  const v = (title: string, subtitle = '') => {
    const r = normalizeVolume({ title, subtitle });
    return [r.title, r.subtitle];
  };
  it('moves a volume-only subtitle into the title', () => {
    expect(v('Royal Tailor', 'Vol. 2')).toEqual(['Royal Tailor, Vol. 2', '']);
    expect(v('Royal Tailor', 'vol 2')).toEqual(['Royal Tailor, Vol. 2', '']);
    expect(v('Royal Tailor', 'Volume 2')).toEqual(['Royal Tailor, Vol. 2', '']);
    expect(v('Royal Tailor', '2')).toEqual(['Royal Tailor, Vol. 2', '']);
    expect(v('ロイヤルテーラー', '第2巻')).toEqual(['ロイヤルテーラー, Vol. 2', '']);
    expect(v('Kuroko', 'Cilt 3')).toEqual(['Kuroko, Vol. 3', '']);
  });
  it('keeps a real subtitle after a leading volume', () => {
    expect(v('Royal Tailor', 'Vol. 2: The Hidden Thread')).toEqual(['Royal Tailor, Vol. 2', 'The Hidden Thread']);
  });
  it('normalises volumes written into the title', () => {
    expect(v('Royal Tailor vol 2')).toEqual(['Royal Tailor, Vol. 2', '']);
    expect(v('Royal Tailor Vol.2')).toEqual(['Royal Tailor, Vol. 2', '']);
    expect(v('Royal Tailor (Volume 02)')).toEqual(['Royal Tailor, Vol. 2', '']);
    expect(v('Shounen Note 5巻')).toEqual(['Shounen Note, Vol. 5', '']);
    expect(v('Royal Tailor, Vol. 2', 'Vol. 2')).toEqual(['Royal Tailor, Vol. 2', '']);
  });
  it('leaves titles that merely end in a number alone', () => {
    expect(v('Fahrenheit 451')).toEqual(['Fahrenheit 451', '']);
    expect(v('1984')).toEqual(['1984', '']);
    expect(v('Catch-22', 'A Novel')).toEqual(['Catch-22', 'A Novel']);
  });
  it('formats catalogue volume fields', () => {
    expect(formatVolume('Title', '02')).toBe('Title, Vol. 2');
    expect(volumeTitle('こころ', '')).toBe('こころ');
    expect(volumeTitle('進撃の巨人', '3')).toBe('進撃の巨人, Vol. 3');
    expect(volumeTitle('平家物語', '上')).toBe('平家物語 上');
  });
});

describe('title matching for imports without ISBN', () => {
  it('scores title similarity, ignoring case, accents and small words', () => {
    expect(titleSimilarity('De Avonden', 'de avonden')).toBe(1);
    expect(titleSimilarity('Çalıkuşu', 'Calikusu')).toBe(1);
    expect(titleSimilarity('The Hobbit', 'The Hobbit, or There and Back Again')).toBeLessThan(0.8);
    expect(titleSimilarity('Dune', 'Dune Messiah')).toBeLessThan(0.8);
  });
  it('checks the author when one is given', () => {
    expect(authorMatches('Gerard Reve', ['Reve, Gerard'])).toBe(true);
    expect(authorMatches('Reve', ['Harry Mulisch'])).toBe(false);
    expect(authorMatches('', ['Anyone'])).toBe(true);
  });
  it('picks only a clear match', () => {
    const candidates = [
      { title: 'Dune Messiah', authors: ['Frank Herbert'] },
      { title: 'Dune', authors: ['Frank Herbert'], isbn13: '9780441013593' },
    ];
    expect(bestMatch('Dune', 'Frank Herbert', candidates)?.isbn13).toBe('9780441013593');
    expect(bestMatch('Dune', 'Somebody Else', candidates)).toBeNull();
    expect(bestMatch('Something Unrelated', '', candidates)).toBeNull();
  });
  it('maps Open Library search results', () => {
    const [m] = mapOLSearch([{ title: 'De avonden', author_name: ['Gerard Reve'], isbn: ['0000000000', '9789023466048'], cover_i: 12, language: ['dut'], first_publish_year: 1947 }]);
    expect(m).toMatchObject({ title: 'De avonden', isbn13: '9789023466048', language: 'Dutch', year: 1947, cover_url: 'https://covers.openlibrary.org/b/id/12-M.jpg' });
  });
});

describe('countries and flags', () => {
  it('builds flag emoji', () => {
    expect(flagEmoji('TR')).toBe('🇹🇷');
    expect(flagEmoji('NL')).toBe('🇳🇱');
    expect(flagEmoji('xx')).toBe('');
  });
  it('recognises country names in many spellings', () => {
    for (const s of ['Turkey', 'Türkiye', 'turkije', 'TÜRKİYE']) expect(countryCode(s), s).toBe('TR');
    for (const s of ['Netherlands', 'Nederland', 'Holland', 'the netherlands']) expect(countryCode(s), s).toBe('NL');
    expect(countryCode('Japan')).toBe('JP');
    expect(countryCode('Living room')).toBe('');
    expect(locationFlag('Germany')).toBe('🇩🇪');
    expect(locationFlag('Shelf 2')).toBe('');
  });
  it('suggests used locations first, then countries', () => {
    const s = suggestLocations('tur', ['Turkey', 'Living room']);
    expect(s[0]).toMatchObject({ value: 'Turkey', flag: '🇹🇷' });
    expect(suggestLocations('liv', ['Living room'])[0]).toMatchObject({ value: 'Living room', flag: '' });
    expect(suggestLocations('neth', []).some((x) => x.flag === '🇳🇱')).toBe(true);
  });
});

describe('friends: codes and the _friends tab', () => {
  const id = '1tRV4RWfJz7ahh4XPBa9mr0Tpossr03HSuAeKO_rca74';
  it('accepts a code, an app link or a Google Sheets link', () => {
    expect(codeFromInput(id)).toBe(id);
    expect(codeFromInput(`https://dotmidi.github.io/book-library/#/friends?add=${id}`)).toBe(id);
    expect(codeFromInput(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
    expect(codeFromInput('hello')).toBe('');
  });
  it('reads the friend list and meta values', () => {
    expect(parseFriends([['code', 'name', 'added'], [id, 'Max', '2026-11-21'], ['bad', 'x', '']])).toEqual([{ code: id, name: 'Max', added: '2026-11-21' }]);
    expect(metaValue([['schema_version', 2], ['display_name', ' Izzet ']], 'display_name')).toBe('Izzet');
    expect(metaValue([], 'display_name')).toBe('');
  });
});

describe('schema v2 columns', () => {
  it('round-trips barcode, category and wishlist', () => {
    const header = FIELDS.map((f) => f.key as string);
    const cols = resolveColumns(header, []).columns;
    const book: Book = { ...emptyBook(), id: 'cd1', title: 'Abbey Road', barcode: '077774644624', category: 'CD', wishlist: true };
    const row = bookToRow(book, cols).map((c) => {
      const v = c.userEnteredValue;
      return v?.stringValue ?? v?.numberValue ?? v?.boolValue ?? '';
    });
    expect(rowToBook(row, cols).book).toMatchObject({ barcode: '077774644624', category: 'CD', wishlist: true, isbn13: '' });
  });
  it('keeps a hand-typed numeric barcode with its leading digits', () => {
    const cols = resolveColumns(['title', 'barcode'], []).columns;
    expect(rowToBook(['X', 5099902987026], cols).book?.barcode).toBe('5099902987026');
  });
  it('accepts a row that only has a barcode', () => {
    const cols = resolveColumns(['title', 'barcode'], []).columns;
    expect(rowToBook(['', '077774644624'], cols).book?.barcode).toBe('077774644624');
  });
  it('maps old sheets without the new columns (they are created at the end)', () => {
    const old = ['id', 'isbn13', 'title', 'location'];
    const r = resolveColumns(old, []);
    expect(r.created.map((c) => c.field)).toEqual(expect.arrayContaining(['barcode', 'category', 'wishlist']));
    expect(Math.min(...r.created.map((c) => c.index))).toBe(4);
  });
});
