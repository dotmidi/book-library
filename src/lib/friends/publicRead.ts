/**
 * Read a friend's shared library. Their sheet is "anyone with the link can
 * view", so it is read with the app's API key: your Google sign-in isn't used
 * and the app never gets access to anything else in their Drive.
 */
import { config } from '../config';
import { rowsToBooks, resolveColumns } from '../sheets/mapping';
import { findTab, headerAndTags } from '../sheets/backend';
import { quoteSheet } from '../sheets/schema';
import type { SheetInfo } from '../google/sheets';
import type { Book } from '../types';
import { metaValue } from './sharing';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

export class NotSharedError extends Error {
  constructor() {
    super("This library isn't shared (any more), or the code is wrong.");
    this.name = 'NotSharedError';
  }
}

export interface SharedLibrary {
  code: string;
  name: string;
  books: Book[];
  loadedAt: number;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(config.booksApiKey)}`);
  if (res.status === 403 || res.status === 404 || res.status === 400) throw new NotSharedError();
  if (!res.ok) throw new Error(`Couldn't load this library (error ${res.status}). Try again later.`);
  return (await res.json()) as T;
}

export async function readSharedLibrary(code: string): Promise<SharedLibrary> {
  const id = encodeURIComponent(code);
  const props = await get<{ sheets?: SheetInfo[] }>(
    `${SHEETS}/${id}?fields=${encodeURIComponent('sheets(properties(sheetId,title),developerMetadata(metadataKey,metadataValue))')}`,
  );
  const sheets = props.sheets ?? [];
  const booksTab = findTab(sheets, 'books');
  const metaTab = findTab(sheets, 'meta');
  if (!booksTab) throw new NotSharedError();
  const booksRange = quoteSheet(booksTab.properties.title);

  const fields =
    'sheets(properties(sheetId,title),data(startColumn,rowData(values(formattedValue)),columnMetadata(developerMetadata(metadataKey,metadataValue))))';
  const [header, values] = await Promise.all([
    get<{ sheets?: SheetInfo[] }>(`${SHEETS}/${id}?includeGridData=true&ranges=${encodeURIComponent(`${booksRange}!1:1`)}&fields=${encodeURIComponent(fields)}`),
    get<{ valueRanges?: { values?: unknown[][] }[] }>(
      `${SHEETS}/${id}/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&ranges=${encodeURIComponent(booksRange)}` +
        (metaTab ? `&ranges=${encodeURIComponent(`${quoteSheet(metaTab.properties.title)}!A1:B40`)}` : ''),
    ),
  ]);
  const info = header.sheets?.[0];
  const { header: head, tags } = info ? headerAndTags(info) : { header: [], tags: [] };
  const rows = values.valueRanges?.[0]?.values ?? [];
  const cols = resolveColumns(head.length ? head : ((rows[0] ?? []) as string[]), tags).columns;
  const books = rowsToBooks(rows.slice(1), cols, 1).books;
  const name = metaValue(values.valueRanges?.[1]?.values ?? [], 'display_name');
  return { code, name, books, loadedAt: Date.now() };
}
