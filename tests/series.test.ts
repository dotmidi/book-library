import { describe, expect, it } from 'vitest';
import { groupSeries, isNovel, parseVolume, sameVolumeTitle, seriesKey, seriesOf } from '../src/lib/series';
import { mapAniList, mapVolumes, pickCandidate, samePerson, volumeQueries } from '../src/lib/lookup/seriesInfo';
import { emptyBook, type Book } from '../src/lib/types';

const book = (title: string, extra: Partial<Book> = {}): Book => ({ ...emptyBook(), id: title, title, ...extra });

describe('parseVolume', () => {
  it('reads volume keywords', () => {
    expect(parseVolume("Let's Do It Already!, Vol. 5")).toEqual({ base: "Let's Do It Already!", volume: 5, strong: true });
    expect(parseVolume('Royal Tailor Volume 2')).toMatchObject({ base: 'Royal Tailor', volume: 2, strong: true });
    expect(parseVolume('Astérix tome 12')).toMatchObject({ base: 'Astérix', volume: 12, strong: true });
    expect(parseVolume('進撃の巨人 3巻')).toMatchObject({ base: '進撃の巨人', volume: 3, strong: true });
  });
  it('allows a subtitle after the volume number', () => {
    expect(parseVolume('Absolute Batman Vol. 2: Abomination')).toMatchObject({ base: 'Absolute Batman', volume: 2, strong: true });
    expect(parseVolume('Toradora Volume 3 Toradora')).toMatchObject({ base: 'Toradora', volume: 3 });
    expect(parseVolume('D. Gray-Man, Vol. 25')).toMatchObject({ base: 'D. Gray-Man', volume: 25 });
    expect(parseVolume('Band of Brothers')).toBeNull();
    expect(parseVolume('Snotgirl #8')).toBeNull();
    expect(parseVolume('Ojojojo Vol. 1-2')).toEqual({ base: 'Ojojojo', volume: 1, to: 2, strong: true });
    expect(parseVolume('Ojojojo Omnibus 3-4')).toMatchObject({ volume: 3, to: 4 });
    expect(parseVolume('The Obsessed Mage (Manga) Vol. 2')).toMatchObject({ base: 'The Obsessed Mage', volume: 2 });
    expect(parseVolume('BAKEMONOGATARI (manga), Vol. 3')).toMatchObject({ base: 'BAKEMONOGATARI', volume: 3 });
  });
  it('reads a bare trailing number as a weak hint', () => {
    expect(parseVolume('Bless 3')).toEqual({ base: 'Bless', volume: 3, strong: false });
    expect(parseVolume('The Ice Guy and the Cool Girl 03')).toMatchObject({ volume: 3, strong: false });
    expect(parseVolume('Bless 3 (Manga)')).toMatchObject({ base: 'Bless', volume: 3 });
  });
  it('leaves years and plain titles alone', () => {
    expect(parseVolume('1984')).toBeNull();
    expect(parseVolume('Fahrenheit 451')).toBeNull();
    expect(parseVolume('Dune')).toBeNull();
  });
});

describe('groupSeries', () => {
  it('groups volumes and ignores a lone weak number', () => {
    const g = groupSeries([
      book("Let's Do It Already!, Vol. 1"),
      book('Let’s Do It Already! Vol 3'),
      book('Bless 3'),
      book('Royal Tailor, Vol. 1'),
      book('Dune'),
    ]);
    expect([...g.values()].filter((x) => x.confirmed).map((x) => x.key).sort()).toEqual(['lets do it already', 'royal tailor']);
    expect(g.get('bless')?.confirmed).toBe(false);
    expect([...g.get('lets do it already')!.volumes.keys()].sort()).toEqual([1, 3]);
  });
  it('counts an omnibus for each volume in it', () => {
    const g = groupSeries([book('Ojojojo Vol. 1-2')]);
    expect([...g.get('ojojojo')!.volumes.keys()]).toEqual([1, 2]);
  });
  it('counts two weak volumes as a series', () => {
    const g = groupSeries([book('Bless 1'), book('Bless 3')]);
    expect(g.get('bless')?.volumes.size).toBe(2);
    expect(g.get('bless')?.confirmed).toBe(true);
  });
  it('finds the series of a book', () => {
    const books = [book('Royal Tailor, Vol. 1'), book('Royal Tailor, Vol. 2', { wishlist: true })];
    expect(seriesOf(books[0], books)?.volume).toBe(1);
    expect(seriesOf(book('Dune'), books)).toBeNull();
  });
});

describe('sameVolumeTitle', () => {
  it('matches spellings of the same volume', () => {
    expect(sameVolumeTitle("Let's Do It Already!, Vol. 4", 'Let’s Do It Already! Vol 4')).toBe(true);
    expect(sameVolumeTitle('The Royal Tailor, Vol. 2', 'Royal Tailor Volume 2')).toBe(true);
    expect(sameVolumeTitle('Royal Tailor, Vol. 2', 'Royal Tailor, Vol. 3')).toBe(false);
  });
  it('folds case and accents in keys', () => {
    expect(seriesKey('Astérix')).toBe(seriesKey('ASTERIX'));
  });
});

describe('AniList', () => {
  const cands = mapAniList([
    { id: 1, title: { english: 'Royal Tailor', romaji: 'Ousama no Tailor' }, format: 'MANGA', status: 'RELEASING', volumes: null },
    { id: 2, title: { english: null, romaji: 'Royal Tailor' }, format: 'NOVEL', status: 'FINISHED', volumes: 7 },
    { id: 3, title: { english: 'Something Else' }, format: 'MANGA', status: 'FINISHED', volumes: 3 },
  ]);
  it('maps titles and counts', () => {
    expect(cands[1]).toEqual({ id: 2, title: 'Royal Tailor', format: 'NOVEL', status: 'FINISHED', volumes: 7, staff: [] });
  });
  it('prefers manga, or novels for novel-like books', () => {
    expect(pickCandidate(cands, 'Royal Tailor', false)?.id).toBe(1);
    expect(pickCandidate(cands, 'Royal Tailor', true)?.id).toBe(2);
    expect(pickCandidate([], 'Royal Tailor', false)).toBeNull();
  });
  it('picks the same-name series by the same author', () => {
    const bless = mapAniList([
      { id: 118117, title: { romaji: 'Bless' }, format: 'MANGA', status: 'FINISHED', staff: { nodes: [{ name: { full: 'Jun Yoon' } }] } },
      { id: 143817, title: { romaji: 'Bless' }, format: 'MANGA', status: 'RELEASING', staff: { nodes: [{ name: { full: 'Yukino Sonoyama' } }] } },
    ]);
    expect(pickCandidate(bless, 'Bless', false, 'Yukino Sonoyama')?.id).toBe(143817);
    expect(pickCandidate(bless, 'Bless', false, 'Sonoyama Yukino')?.id).toBe(143817);
    expect(pickCandidate(bless, 'Bless', false, 'Someone Else')?.id).toBe(118117);
  });
  it('prefers the exact name over a spin-off, and the novel for novels', () => {
    const c86 = mapAniList([
      { id: 162703, title: { english: '86—EIGHTY-SIX Alter' }, format: 'NOVEL', status: 'RELEASING' },
      { id: 101606, title: { english: '86―EIGHTY-SIX' }, format: 'MANGA', status: 'CANCELLED', volumes: 3 },
      { id: 98610, title: { english: '86―EIGHTY-SIX' }, format: 'NOVEL', status: 'RELEASING' },
    ]);
    expect(pickCandidate(c86, '86—EIGHTY-SIX', true)?.id).toBe(98610);
    expect(pickCandidate(c86, '86—EIGHTY-SIX', false)?.id).toBe(101606);
  });
  it('matches names in either order', () => {
    expect(samePerson('Yukino Sonoyama', 'SONOYAMA Yukino')).toBe(true);
    expect(samePerson('Yukino Sonoyama', 'Yukino')).toBe(false);
  });
});

describe('volumeQueries', () => {
  it('tries author, then name, then words when the name has dashes', () => {
    expect(volumeQueries('Bless', 'Yukino Sonoyama')).toEqual(['intitle:"Bless" inauthor:"Yukino Sonoyama"', 'intitle:"Bless"']);
    expect(volumeQueries("Let's Do It Already!")).toEqual([`intitle:"Let's Do It Already!"`]);
    expect(volumeQueries('86—EIGHTY-SIX')).toEqual(['intitle:"86—EIGHTY-SIX"', 'intitle:86 intitle:EIGHTY intitle:SIX']);
  });
});

describe('isNovel', () => {
  const b = (title: string, category = '', publisher = '') => ({ title, category, publisher });
  it('reads category, imprint and title notes', () => {
    expect(isNovel(b('86—EIGHTY-SIX, Vol. 1', '', 'Yen On'))).toBe(true);
    expect(isNovel(b('Spy x Family, Vol. 1', '', 'Yen Press'))).toBe(false);
    expect(isNovel(b('Some Story, Vol. 2', 'Light Novel'))).toBe(true);
    expect(isNovel(b('Absolute Batman Vol. 1', 'Comics & Graphic Novels'))).toBe(false);
    expect(isNovel(b('Villainess, Vol. 6 (Light Novel)', 'Comics'))).toBe(true);
    expect(isNovel(b('Villainess, Vol. 2 (Manga)', 'Light Novel'))).toBe(false);
  });
});

describe('mapVolumes', () => {
  it('uses an omnibus for both volumes unless a single one is listed', () => {
    const m = mapVolumes('Ojojojo', [
      { volumeInfo: { title: 'Ojojojo Vol. 3-4', imageLinks: { thumbnail: 'https://x/34' } } },
      { volumeInfo: { title: 'Ojojojo Vol. 4', imageLinks: { thumbnail: 'https://x/4' } } },
    ]);
    expect(m.get(3)?.cover).toBe('https://x/34');
    expect(m.get(4)?.cover).toBe('https://x/4');
  });
  it('keeps manga covers off a light novel shelf', () => {
    const items = [
      { volumeInfo: { title: 'If the Villainess Fell in Love, Vol. 6 (light novel)' } },
      { volumeInfo: { title: 'If the Villainess Fell in Love, Vol. 2 (manga)' } },
      { volumeInfo: { title: 'If the Villainess Fell in Love, Vol. 3' } },
    ];
    expect([...mapVolumes('If the Villainess Fell in Love', items, '', 'novel').keys()].sort()).toEqual([3, 6]);
    expect([...mapVolumes('If the Villainess Fell in Love', items, '', 'manga').keys()].sort()).toEqual([2, 3]);
  });
  it('skips editions in other languages', () => {
    const m = mapVolumes('Bless', [
      { volumeInfo: { title: 'Bless 4', language: 'en' } },
      { volumeInfo: { title: 'Bless, Band 05', language: 'de' } },
      { volumeInfo: { title: 'Bless tom 7', language: 'pl' } },
    ], 'en');
    expect([...m.keys()]).toEqual([4]);
  });
  it('keeps volumes of this series, preferring entries with covers', () => {
    const m = mapVolumes("Let's Do It Already!", [
      { volumeInfo: { title: "Let's Do It Already!, Vol. 4", industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781975360000' }] } },
      { volumeInfo: { title: "Let's Do It Already!, Vol. 4", imageLinks: { thumbnail: 'http://books.google.com/x?id=a&edge=curl' } } },
      { volumeInfo: { title: "Let's Do It Already!", subtitle: 'Vol. 9' } },
      { volumeInfo: { title: 'Other Series, Vol. 2' } },
    ]);
    expect([...m.keys()].sort()).toEqual([4, 9]);
    expect(m.get(4)?.cover).toBe('https://books.google.com/x?id=a');
  });
});


describe('Open Library series', () => {
  it('lists whole-numbered books in order, one per position', async () => {
    const { mapSeriesDocs } = await import('../src/lib/lookup/bookSeries');
    const books = mapSeriesDocs('OL334583L', [
      { title: 'House of Flame and Shadow', series_key: ['OL334583L'], series_position: ['3'], cover_i: 13525139 },
      { title: 'House of Earth and Blood', series_key: ['OL334583L'], series_position: ['1'], cover_i: 9289603, isbn: ['9781526663559', '1526663554'] },
      { title: 'House of Sky and Breath', series_key: ['OL334583L'], series_position: ['2'] },
      { title: 'A Novella', series_key: ['OL334583L'], series_position: ['1.5'] },
    ]);
    expect(books.map((b) => [b.position, b.title])).toEqual([
      [1, 'House of Earth and Blood'],
      [2, 'House of Sky and Breath'],
      [3, 'House of Flame and Shadow'],
    ]);
    expect(books[0].cover).toBe('https://covers.openlibrary.org/b/id/9289603-M.jpg');
    expect(books[0].isbns).toEqual(['9781526663559']);
  });
});
