import Papa from 'papaparse';
import { rowToBook, type ColumnMap } from './sheets/mapping';
import { matchHeader } from './sheets/schema';
import type { Book } from './types';

export interface CsvParseResult {
  books: Book[];
  /** Books that only have an ISBN: look them up before adding. */
  needLookup: Book[];
  skipped: string[];
  /** Header names that didn't match any field (ignored). */
  unknownHeaders: string[];
  matchedHeaders: string[];
}

/** Map CSV headers to fields. A file with no recognisable header is treated as a plain list of ISBNs. */
export function parseCsvText(text: string): CsvParseResult {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const rows = parsed.data.filter((r) => Array.isArray(r));
  const result: CsvParseResult = { books: [], needLookup: [], skipped: [], unknownHeaders: [], matchedHeaders: [] };
  if (!rows.length) return result;

  const header = rows[0];
  const cols: ColumnMap = {};
  header.forEach((h, i) => {
    const key = matchHeader(h);
    if (key && cols[key] === undefined) {
      cols[key] = i;
      result.matchedHeaders.push(String(h).trim());
    } else if (String(h).trim()) result.unknownHeaders.push(String(h).trim());
  });

  let dataRows = rows.slice(1);
  if (cols.title === undefined && cols.isbn13 === undefined && cols.isbn10 === undefined) {
    // No header row: assume the first column holds ISBNs.
    cols.isbn13 = 0;
    dataRows = rows;
    result.unknownHeaders = [];
    result.matchedHeaders = [];
  }

  dataRows.forEach((row, i) => {
    const lineNo = (dataRows === rows ? 1 : 2) + i;
    const r = rowToBook(row, cols);
    if (r.empty) return;
    if (!r.book) {
      result.skipped.push(`Line ${lineNo}: ${r.skipped}`);
      return;
    }
    const b = r.book;
    if (b.isbn13 && b.isbn13.length !== 13) {
      if (!b.title) {
        result.skipped.push(`Line ${lineNo}: "${b.isbn13}" is not a valid ISBN`);
        return;
      }
      b.isbn13 = '';
    }
    if (cols.status === undefined) b.status = 'owned';
    if (!b.title) result.needLookup.push(b);
    else result.books.push(b);
  });
  return result;
}
