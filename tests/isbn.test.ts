import { describe, expect, it } from 'vitest';
import { cleanIsbn, isbnFromCell, isBooklandEan, isbn10to13, isbn13to10, parseIsbn } from '../src/lib/isbn';

describe('parseIsbn', () => {
  it('accepts a plain ISBN-13', () => {
    expect(parseIsbn('9780140328721')).toEqual({ ok: true, value: { isbn13: '9780140328721', isbn10: '0140328726' } });
  });

  it('accepts dashes, spaces and an ISBN prefix', () => {
    for (const s of ['978-0-14-032872-1', ' 978 0140 328721 ', 'ISBN 978-0-14-032872-1', 'ISBN-13: 9780140328721', '978‐0‐14‐032872‐1']) {
      const r = parseIsbn(s);
      expect(r.ok, s).toBe(true);
      if (r.ok) expect(r.value.isbn13).toBe('9780140328721');
    }
  });

  it('converts ISBN-10 to ISBN-13', () => {
    const r = parseIsbn('0-14-032872-6');
    expect(r).toEqual({ ok: true, value: { isbn13: '9780140328721', isbn10: '0140328726' } });
  });

  it('accepts ISBN-10 with X check digit (upper or lower case)', () => {
    expect(parseIsbn('080442957X').ok).toBe(true);
    expect(parseIsbn('080442957x').ok).toBe(true);
    const r = parseIsbn('0-8044-2957-X');
    if (r.ok) expect(r.value.isbn13).toBe('9780804429573');
  });

  it('handles 979 ISBNs, which have no ISBN-10', () => {
    const r = parseIsbn('9791032305690');
    expect(r).toEqual({ ok: true, value: { isbn13: '9791032305690', isbn10: '' } });
  });

  it('accepts Dutch and Turkish ISBNs', () => {
    expect(parseIsbn('9789044649413').ok).toBe(true); // NL
    expect(parseIsbn('9789750719387').ok).toBe(true); // TR
  });

  it('rejects bad checksums', () => {
    expect(parseIsbn('9780140328722')).toEqual({ ok: false, problem: 'checksum' });
    expect(parseIsbn('0140328727')).toEqual({ ok: false, problem: 'checksum' });
  });

  it('rejects wrong lengths, characters and non-book EANs', () => {
    expect(parseIsbn('')).toEqual({ ok: false, problem: 'empty' });
    expect(parseIsbn('12345')).toEqual({ ok: false, problem: 'length' });
    expect(parseIsbn('97801403287X1')).toEqual({ ok: false, problem: 'characters' });
    expect(parseIsbn('abc')).toEqual({ ok: false, problem: 'characters' });
    expect(parseIsbn('5901234123457')).toEqual({ ok: false, problem: 'prefix' });
  });
});

describe('conversions', () => {
  it('round-trips 10 ↔ 13', () => {
    expect(isbn10to13('0140328726')).toBe('9780140328721');
    expect(isbn13to10('9780140328721')).toBe('0140328726');
    expect(isbn13to10('9791032305690')).toBe('');
  });

  it('cleanIsbn strips junk', () => {
    expect(cleanIsbn('ISBN: 978-0-14-032872-1')).toBe('9780140328721');
  });

  it('recognises Bookland EANs only', () => {
    expect(isBooklandEan('9780140328721')).toBe(true);
    expect(isBooklandEan('5901234123457')).toBe(false);
    expect(isBooklandEan('9780140328722')).toBe(false);
  });
});

describe('isbnFromCell (values read from a hand-edited sheet)', () => {
  it('turns numbers back into strings', () => {
    expect(isbnFromCell(9780140328721)).toBe('9780140328721');
  });
  it('restores a lost leading zero on ISBN-10', () => {
    expect(isbnFromCell(140328726)).toBe('0140328726');
  });
  it('cleans strings and ignores empties', () => {
    expect(isbnFromCell('978-0-14-032872-1')).toBe('9780140328721');
    expect(isbnFromCell('')).toBe('');
    expect(isbnFromCell(null)).toBe('');
  });
});
