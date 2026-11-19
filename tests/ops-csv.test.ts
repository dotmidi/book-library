import { describe, expect, it } from 'vitest';
import { applyOps, coalesce, type Op } from '../src/lib/store/ops';
import { parseCsvText } from '../src/lib/csv';
import { languageName } from '../src/lib/languages';
import { emptyBook, type Book } from '../src/lib/types';

const book = (id: string, title = id): Book => ({ ...emptyBook(), id, title });

describe('outbox coalescing', () => {
  it('merges add + update into one add with the latest values', () => {
    const ops: Op[] = [
      { kind: 'add', book: book('a', 'v1') },
      { kind: 'update', id: 'a', fields: ['title'], book: book('a', 'v2') },
    ];
    expect(coalesce(ops)).toEqual({ adds: [book('a', 'v2')], updates: [], deletes: [] });
  });

  it('drops add + delete entirely', () => {
    expect(coalesce([{ kind: 'add', book: book('a') }, { kind: 'delete', id: 'a' }])).toEqual({ adds: [], updates: [], deletes: [] });
  });

  it('unions the fields of several updates', () => {
    const p = coalesce([
      { kind: 'update', id: 'a', fields: ['title'], book: book('a', 'x') },
      { kind: 'update', id: 'a', fields: ['notes'], book: { ...book('a', 'x'), notes: 'n' } },
    ]);
    expect(p.updates).toEqual([{ id: 'a', fields: ['title', 'notes'], book: { ...book('a', 'x'), notes: 'n' } }]);
  });

  it('turns update + delete into a delete', () => {
    const p = coalesce([
      { kind: 'update', id: 'a', fields: ['title'], book: book('a') },
      { kind: 'delete', id: 'a' },
    ]);
    expect(p).toEqual({ adds: [], updates: [], deletes: ['a'] });
  });

  it('keeps add order', () => {
    const p = coalesce([1, 2, 3].map((i) => ({ kind: 'add', book: book(`b${i}`) }) as Op));
    expect(p.adds.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('applies pending ops over loaded books', () => {
    const loaded = [book('a'), book('b')];
    const out = applyOps(loaded, [
      { kind: 'update', id: 'a', fields: ['title'], book: book('a', 'A!') },
      { kind: 'delete', id: 'b' },
      { kind: 'add', book: book('c') },
      { kind: 'add', book: book('c') },
    ]);
    expect(out.map((b) => b.title)).toEqual(['A!', 'c']);
  });
});

describe('CSV import parsing', () => {
  it('maps headers by name and splits books from ISBN-only rows', () => {
    const csv = 'Title,Author,ISBN,Shelf,Price\nDe Avonden,Gerard Reve,,Woonkamer,10\n,,9789750719387,Zolder,\n,,,,5\n';
    const r = parseCsvText(csv);
    expect(r.books.map((b) => [b.title, b.authors[0], b.location])).toEqual([['De Avonden', 'Gerard Reve', 'Woonkamer']]);
    expect(r.needLookup.map((b) => [b.isbn13, b.location])).toEqual([['9789750719387', 'Zolder']]);
    expect(r.unknownHeaders).toEqual(['Price']);
    expect(r.skipped.length).toBe(0); // a row with data only in unknown columns is ignored
  });

  it('accepts a bare list of ISBNs without a header', () => {
    const r = parseCsvText('9780140328721\n978-90-446-4941-3\nnot an isbn\n');
    expect(r.needLookup.map((b) => b.isbn13)).toEqual(['9780140328721', '9789044649413']);
    expect(r.skipped.length).toBe(1);
  });

  it('handles a UTF-8 BOM and semicolon-free quoting', () => {
    const r = parseCsvText('﻿"title","authors"\n"Çalıkuşu","Reşat Nuri Güntekin"\n');
    expect(r.books[0]).toMatchObject({ title: 'Çalıkuşu', authors: ['Reşat Nuri Güntekin'] });
  });
});

describe('languageName', () => {
  it('normalises codes and names', () => {
    expect(languageName('dut')).toBe('Dutch');
    expect(languageName('/languages/tur')).toBe('Turkish');
    expect(languageName('nl-NL')).toBe('Dutch');
    expect(languageName('Nederlands')).toBe('Dutch');
    expect(languageName('Türkçe')).toBe('Turkish');
    expect(languageName('klingon')).toBe('Klingon');
    expect(languageName('')).toBe('');
  });
});
