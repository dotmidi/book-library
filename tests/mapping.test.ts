import { describe, expect, it } from 'vitest';
import {
  bookToRow,
  changedFields,
  coverPreviewFormula,
  fieldCell,
  isoToSerial,
  parseDate,
  resolveColumns,
  rowsToBooks,
  rowToBook,
  serialToIso,
  type ColumnMap,
} from '../src/lib/sheets/mapping';
import { FIELDS, columnLetter, matchHeader, normalizeHeader, quoteSheet } from '../src/lib/sheets/schema';
import { emptyBook, type Book } from '../src/lib/types';

const STANDARD_HEADER: string[] = FIELDS.map((f) => f.key);

function colsFor(header: string[]): ColumnMap {
  return resolveColumns(header, []).columns;
}

function rowFor(header: string[], values: Record<string, unknown>): unknown[] {
  return header.map((h) => values[h] ?? '');
}

describe('header matching', () => {
  it('normalises headers', () => {
    expect(normalizeHeader('ISBN-13')).toBe('isbn 13');
    expect(normalizeHeader('  Lent_To ')).toBe('lent to');
    expect(normalizeHeader('Başlık')).toBe('baslik');
  });
  it('matches field names, case-insensitively, and common aliases', () => {
    expect(matchHeader('Title')).toBe('title');
    expect(matchHeader('ISBN')).toBe('isbn13');
    expect(matchHeader('ISBN-10')).toBe('isbn10');
    expect(matchHeader('Author')).toBe('authors');
    expect(matchHeader('Titel')).toBe('title');
    expect(matchHeader('Yazar')).toBe('authors');
    expect(matchHeader('lent to')).toBe('lent_to');
    expect(matchHeader('My own column')).toBeNull();
  });
  it('builds A1 helpers', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(701)).toBe('ZZ');
    expect(quoteSheet("Bob's books")).toBe("'Bob''s books'");
  });
});

describe('resolveColumns', () => {
  it('maps the standard layout', () => {
    const r = resolveColumns(STANDARD_HEADER, []);
    expect(r.created).toEqual([]);
    expect(r.columns.title).toBe(3);
    expect(r.untagged.length).toBe(FIELDS.length);
  });

  it('survives reordered columns', () => {
    const header = [...STANDARD_HEADER].reverse();
    const r = resolveColumns(header, []);
    expect(r.columns.id).toBe(header.length - 1);
    expect(r.columns.title).toBe(header.indexOf('title'));
    expect(r.created).toEqual([]);
  });

  it('prefers metadata tags over header text (renamed columns)', () => {
    const header = [...STANDARD_HEADER];
    header[3] = 'Name of the book'; // user renamed "title"
    const tags = [{ field: 'title', columnIndex: 3 }];
    const r = resolveColumns(header, tags);
    expect(r.columns.title).toBe(3);
    expect(r.created).toEqual([]);
    expect(r.untagged.find((u) => u.field === 'title')).toBeUndefined();
  });

  it('follows a tag to a moved, renamed column even if another column now has the old header', () => {
    const header = ['title', 'id', 'Boektitel'];
    const r = resolveColumns(header, [{ field: 'title', columnIndex: 2 }]);
    expect(r.columns.title).toBe(2);
  });

  it('recreates missing columns after the last used column, ignoring unknown ones', () => {
    const header = ['id', 'title', 'My notes', 'isbn13'];
    const r = resolveColumns(header, []);
    expect(r.columns.title).toBe(1);
    expect(r.columns.isbn13).toBe(3);
    const created = r.created.map((c) => c.index);
    expect(Math.min(...created)).toBe(4);
    expect(new Set(created).size).toBe(created.length);
    // unknown column 2 is never claimed
    expect(Object.values(r.columns)).not.toContain(2);
  });

  it('ignores tags for unknown fields and duplicate tags', () => {
    const r = resolveColumns(STANDARD_HEADER, [
      { field: 'title', columnIndex: 3 },
      { field: 'title', columnIndex: 5 },
      { field: 'nonsense', columnIndex: 6 },
    ]);
    expect(r.columns.title).toBe(3);
    expect(r.ignoredTags.length).toBe(2);
  });
});

describe('rowToBook / rowsToBooks', () => {
  const cols = colsFor(STANDARD_HEADER);

  it('reads a well-formed row', () => {
    const row = rowFor(STANDARD_HEADER, {
      id: 'abc12345',
      isbn13: '9780140328721',
      isbn10: '0140328726',
      title: 'Fantastic Mr. Fox',
      authors: 'Roald Dahl; Quentin Blake',
      year: 1988,
      pages: 96,
      language: 'eng',
      tags: 'children, favourite',
      copies: 2,
      lent_to: 'Ayşe',
      lent_since: isoToSerial('2026-11-01'),
      date_added: isoToSerial('2026-10-15'),
      needs_details: false,
    });
    const r = rowToBook(row, cols);
    expect(r.book).toMatchObject({
      id: 'abc12345',
      title: 'Fantastic Mr. Fox',
      authors: ['Roald Dahl', 'Quentin Blake'],
      year: 1988,
      pages: 96,
      language: 'English',
      tags: ['children', 'favourite'],
      copies: 2,
      lent_to: 'Ayşe',
      lent_since: '2026-11-01',
      date_added: '2026-10-15',
      needs_details: false,
    });
    expect(r.assignedId).toBe(false);
  });

  it('copes with hand-typed values', () => {
    const row = rowFor(STANDARD_HEADER, {
      isbn13: 9780140328721, // typed as a number
      title: '  De Avonden ',
      year: 'maart 1947',
      pages: '1.024 blz',
      copies: 'twee',
      date_added: '19-11-2026',
      needs_details: 'yes',
    });
    const b = rowToBook(row, cols).book!;
    expect(b.isbn13).toBe('9780140328721');
    expect(b.isbn10).toBe('0140328726');
    expect(b.title).toBe('De Avonden');
    expect(b.year).toBe(1947);
    expect(b.pages).toBe(1024);
    expect(b.copies).toBe(1);
    expect(b.date_added).toBe('2026-11-19');
    expect(b.needs_details).toBe(true);
  });

  it('ignores the old "status" column in sheets made before it was removed', () => {
    const header = ['id', 'title', 'status', 'lent_to'];
    const r = resolveColumns(header, [{ field: 'status', columnIndex: 2 }]);
    expect(Object.values(r.columns)).not.toContain(2);
    expect(r.ignoredTags).toEqual([{ field: 'status', columnIndex: 2 }]);
    const b = rowToBook(['x1', 'Dune', 'lent', 'Ayşe'], r.columns).book!;
    expect(b).toMatchObject({ title: 'Dune', lent_to: 'Ayşe' });
    expect('status' in b).toBe(false);
  });

  it('moves an ISBN-10 typed into the isbn13 column', () => {
    const b = rowToBook(rowFor(STANDARD_HEADER, { isbn13: '0140328726' }), cols).book!;
    expect(b.isbn13).toBe('9780140328721');
    expect(b.isbn10).toBe('0140328726');
  });

  it('assigns ids to rows without one, and to duplicate ids', () => {
    const rows = [
      rowFor(STANDARD_HEADER, { title: 'A' }),
      rowFor(STANDARD_HEADER, { id: 'same', title: 'B' }),
      rowFor(STANDARD_HEADER, { id: 'same', title: 'C' }),
    ];
    const r = rowsToBooks(rows, cols, 1);
    expect(r.books.length).toBe(3);
    expect(r.idFixes.map((f) => f.rowIndex)).toEqual([1, 3]);
    expect(new Set(r.books.map((b) => b.id)).size).toBe(3);
    expect(r.rowIndex.get('same')).toBe(2);
  });

  it('skips empty rows silently and malformed rows with a warning', () => {
    const rows = [
      rowFor(STANDARD_HEADER, { title: 'Good' }),
      [],
      rowFor(STANDARD_HEADER, {}),
      rowFor(STANDARD_HEADER, { notes: 'just a note, no title or isbn' }),
      'not even an array' as unknown as unknown[],
      rowFor(STANDARD_HEADER, { isbn13: '9789750719387' }),
    ];
    const r = rowsToBooks(rows, cols, 1);
    expect(r.books.map((b) => b.title || b.isbn13)).toEqual(['Good', '9789750719387']);
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain('Row 5');
  });

  it('ignores data in unknown columns', () => {
    const header = ['title', 'Purchase price', 'authors'];
    const c = colsFor(header);
    const b = rowToBook(['Dune', '€12', 'Frank Herbert'], c).book!;
    expect(b.title).toBe('Dune');
    expect(b.authors).toEqual(['Frank Herbert']);
  });

  it('works with a short row (trailing cells trimmed by the API)', () => {
    const b = rowToBook(['id1', '', '', 'Short'], cols).book!;
    expect(b.title).toBe('Short');
    expect(b.tags).toEqual([]);
  });
});

describe('writing', () => {
  const cols = colsFor(STANDARD_HEADER);
  const book: Book = {
    ...emptyBook(),
    id: 'k3f9x2qa',
    isbn13: '9780140328721',
    isbn10: '0140328726',
    title: '=HYPERLINK("evil")',
    authors: ['Roald Dahl', 'Quentin Blake'],
    year: 1988,
    tags: ['a', 'b'],
    date_added: '2026-11-19',
    needs_details: false,
  };

  it('writes ISBNs as text and strings never as formulas', () => {
    expect(fieldCell('isbn13', book, cols)).toEqual({
      userEnteredValue: { stringValue: '9780140328721' },
      userEnteredFormat: { numberFormat: { type: 'TEXT' } },
    });
    expect(fieldCell('title', book, cols).userEnteredValue).toEqual({ stringValue: '=HYPERLINK("evil")' });
  });

  it('writes lists, numbers, dates and checkboxes', () => {
    expect(fieldCell('authors', book, cols).userEnteredValue).toEqual({ stringValue: 'Roald Dahl; Quentin Blake' });
    expect(fieldCell('tags', book, cols).userEnteredValue).toEqual({ stringValue: 'a, b' });
    expect(fieldCell('year', book, cols).userEnteredValue).toEqual({ numberValue: 1988 });
    expect(fieldCell('pages', book, cols)).toEqual({});
    const d = fieldCell('date_added', book, cols);
    expect(serialToIso(d.userEnteredValue!.numberValue!)).toBe('2026-11-19');
    expect(fieldCell('needs_details', book, cols)).toEqual({
      userEnteredValue: { boolValue: false },
      dataValidation: { condition: { type: 'BOOLEAN' } },
    });
  });

  it('builds the cover preview formula from the cover_url column', () => {
    expect(fieldCell('cover_preview', book, cols).userEnteredValue).toEqual({ formulaValue: coverPreviewFormula(cols.cover_url!) });
    expect(coverPreviewFormula(10)).toBe('=IFERROR(IMAGE(INDEX(K:K,ROW())),"")');
  });

  it('places every field in its column, even when columns are shuffled', () => {
    const header = ['My stuff', ...[...STANDARD_HEADER].reverse()];
    const c = colsFor(header);
    const row = bookToRow(book, c);
    expect(row.length).toBe(header.length);
    expect(row[0]).toEqual({});
    expect(row[header.indexOf('id')].userEnteredValue).toEqual({ stringValue: 'k3f9x2qa' });
    // round trip: read back what we wrote
    const values = row.map((cell) => {
      const v = cell.userEnteredValue;
      return v?.stringValue ?? v?.numberValue ?? v?.boolValue ?? '';
    });
    const back = rowToBook(values, c).book!;
    expect(back).toEqual({ ...book, language: '' });
  });

  it('lists changed fields only', () => {
    const after = { ...book, title: 'New', tags: ['a', 'b'] };
    expect(changedFields(book, after)).toEqual(['title']);
  });
});

describe('dates', () => {
  it('converts serials both ways', () => {
    expect(serialToIso(46345)).toBe('2026-11-19');
    expect(isoToSerial('2026-11-19')).toBe(46345);
  });
  it('parses common typed formats', () => {
    expect(parseDate('2026-1-5')).toBe('2026-01-05');
    expect(parseDate('5/1/2026')).toBe('2026-01-05');
    expect(parseDate('')).toBe('');
    expect(parseDate('sometime')).toBe('sometime');
  });
});
