/**
 * Everything that talks to the user's spreadsheet: find or create it, make
 * sure the layout is sane, load all books, and write batched changes.
 *
 * API budget (Sheets allows 60 reads + 60 writes per minute per user):
 *   load  = 3 reads (+1 write only if the sheet needed repairs)
 *   flush = 1 read (+1 more if it updates/deletes) + 1 write
 */
import { checkFile, createSpreadsheetFile, findAppSpreadsheets, readAppConfig, writeAppConfig } from '../google/drive';
import { batchGetValues, batchUpdate, getHeaderBySheetId, getSheets, type Request, type SheetInfo } from '../google/sheets';
import { bookToRow, CELL_FIELDS, coverPreviewFormula, fieldCell, resolveColumns, rowsToBooks, type ColumnTag } from './mapping';
import {
  BOOKS_TAB,
  FIELDS,
  FIELD_BY_KEY,
  META_TAB,
  FRIENDS_TAB,
  MD_FIELD,
  MD_TAB,
  SCHEMA_VERSION,
  columnLetter,
  quoteSheet,
  type FieldKey,
} from './schema';
import type { Book } from '../types';
import type { WritePlan } from '../store/ops';

export class LayoutChangedError extends Error {
  constructor() {
    super('The Books tab could not be found');
    this.name = 'LayoutChangedError';
  }
}

export interface Connection {
  spreadsheetId: string;
  booksSheetId?: number;
  created: boolean;
}

// ---------- find or create ----------

/**
 * 1. config.json in the hidden app-data folder
 * 2. any spreadsheet this app created (tagged with appProperties)
 * 3. create a new one
 */
export async function connectSpreadsheet(): Promise<Connection> {
  const cfg = await readAppConfig();
  if (cfg?.config.spreadsheetId) {
    const f = await checkFile(cfg.config.spreadsheetId);
    if (f) return { spreadsheetId: f.id, booksSheetId: cfg.config.booksSheetId, created: false };
  }
  const found = await findAppSpreadsheets();
  if (found.length) {
    const id = found[0].id;
    await writeAppConfig({ spreadsheetId: id, schemaVersion: SCHEMA_VERSION }, cfg?.fileId);
    return { spreadsheetId: id, created: false };
  }
  const id = await createSpreadsheetFile();
  const booksSheetId = await setupNewSpreadsheet(id);
  await writeAppConfig({ spreadsheetId: id, booksSheetId, schemaVersion: SCHEMA_VERSION }, cfg?.fileId);
  return { spreadsheetId: id, booksSheetId, created: true };
}

export async function rememberBooksSheet(spreadsheetId: string, booksSheetId: number) {
  const cfg = await readAppConfig();
  if (cfg?.config.spreadsheetId === spreadsheetId && cfg.config.booksSheetId === booksSheetId) return;
  await writeAppConfig({ spreadsheetId, booksSheetId, schemaVersion: SCHEMA_VERSION }, cfg?.fileId);
}

const META_SHEET_ID = 900001;
const HEADER_FORMAT = {
  textFormat: { bold: true },
  backgroundColor: { red: 0.9, green: 0.94, blue: 0.91 },
};

function headerCellRequest(sheetId: number, index: number, key: FieldKey): Request {
  return {
    updateCells: {
      start: { sheetId, rowIndex: 0, columnIndex: index },
      rows: [{ values: [{ userEnteredValue: { stringValue: key }, userEnteredFormat: HEADER_FORMAT }] }],
      fields: 'userEnteredValue,userEnteredFormat(textFormat,backgroundColor)',
    },
  };
}

function columnTagRequest(sheetId: number, index: number, key: FieldKey): Request {
  return {
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: MD_FIELD,
        metadataValue: key,
        visibility: 'DOCUMENT',
        location: { dimensionRange: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 } },
      },
    },
  };
}

export function sheetTagRequest(sheetId: number, value: 'books' | 'meta' | 'friends'): Request {
  return {
    createDeveloperMetadata: {
      developerMetadata: { metadataKey: MD_TAB, metadataValue: value, visibility: 'DOCUMENT', location: { sheetId } },
    },
  };
}

function widthRequest(sheetId: number, index: number, key: FieldKey): Request | null {
  const w = FIELD_BY_KEY.get(key)?.width;
  if (!w) return null;
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
      properties: { pixelSize: w },
      fields: 'pixelSize',
    },
  };
}

/** Set the column format so hand-typed ISBNs stay text and dates look like dates. */
function columnFormatRequest(sheetId: number, index: number, key: FieldKey, rowCount: number): Request | null {
  const kind = FIELD_BY_KEY.get(key)?.kind;
  const numberFormat =
    kind === 'isbn' ? { type: 'TEXT' } : kind === 'date' ? { type: 'DATE', pattern: 'yyyy-mm-dd' } : null;
  if (!numberFormat) return null;
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: rowCount, startColumnIndex: index, endColumnIndex: index + 1 },
      cell: { userEnteredFormat: { numberFormat } },
      fields: 'userEnteredFormat.numberFormat',
    },
  };
}

function metaRequests(appUrl: string, booksSheetId: number, metaSheetId = META_SHEET_ID): Request[] {
  const row = (a: string, b: string | number) => ({
    values: [{ userEnteredValue: { stringValue: a } }, typeof b === 'number' ? { userEnteredValue: { numberValue: b } } : { userEnteredValue: { stringValue: b } }],
  });
  return [
    {
      addSheet: {
        properties: { sheetId: metaSheetId, title: META_TAB, hidden: true, gridProperties: { rowCount: 20, columnCount: 3 } },
      },
    },
    {
      updateCells: {
        start: { sheetId: metaSheetId, rowIndex: 0, columnIndex: 0 },
        rows: [
          { values: [{ userEnteredValue: { stringValue: "⚠ Used by the Book Library app. Please don't edit this tab." } }] },
          { values: [] },
          row('schema_version', SCHEMA_VERSION),
          row('created_at', new Date().toISOString()),
          row('app_url', appUrl),
          row('books_sheet_id', booksSheetId),
        ],
        fields: 'userEnteredValue',
      },
    },
    sheetTagRequest(metaSheetId, 'meta'),
    {
      addProtectedRange: {
        protectedRange: { range: { sheetId: metaSheetId }, warningOnly: true, description: 'Used by the Book Library app' },
      },
    },
  ];
}

/** Turn a fresh spreadsheet into the Book Library layout. Returns the Books sheetId. */
export async function setupNewSpreadsheet(spreadsheetId: string): Promise<number> {
  const { sheets } = await getSheets(spreadsheetId);
  const first = sheets[0].properties;
  const sheetId = first.sheetId;
  const rowCount = first.gridProperties?.rowCount ?? 1000;
  const requests: Request[] = [
    {
      updateSheetProperties: {
        properties: { sheetId, title: BOOKS_TAB, gridProperties: { frozenRowCount: 1 } },
        fields: 'title,gridProperties.frozenRowCount',
      },
    },
    sheetTagRequest(sheetId, 'books'),
    {
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [{ values: FIELDS.map((f) => ({ userEnteredValue: { stringValue: f.key }, userEnteredFormat: HEADER_FORMAT })) }],
        fields: 'userEnteredValue,userEnteredFormat(textFormat,backgroundColor)',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: rowCount },
        properties: { pixelSize: 48 },
        fields: 'pixelSize',
      },
    },
  ];
  FIELDS.forEach((f, i) => {
    requests.push(columnTagRequest(sheetId, i, f.key));
    const w = widthRequest(sheetId, i, f.key);
    if (w) requests.push(w);
    const fmt = columnFormatRequest(sheetId, i, f.key, rowCount);
    if (fmt) requests.push(fmt);
  });
  requests.push(...metaRequests(appUrl(), sheetId));
  await batchUpdate(spreadsheetId, requests);
  return sheetId;
}

function appUrl(): string {
  return location.origin + location.pathname;
}

// ---------- layout ----------

export function findTab(sheets: SheetInfo[], tag: 'books' | 'meta' | 'friends', hintSheetId?: number): SheetInfo | undefined {
  const byTag = sheets.find((s) => s.developerMetadata?.some((m) => m.metadataKey === MD_TAB && m.metadataValue === tag));
  if (byTag) return byTag;
  if (tag === 'books' && hintSheetId !== undefined) {
    const byId = sheets.find((s) => s.properties.sheetId === hintSheetId);
    if (byId) return byId;
  }
  const title = tag === 'books' ? BOOKS_TAB : tag === 'meta' ? META_TAB : FRIENDS_TAB;
  return sheets.find((s) => s.properties.title.trim().toLowerCase() === title.toLowerCase());
}

interface LayoutPlan {
  columns: Record<FieldKey, number>;
  title: string;
  /** Repairs to run before anything else in the same batchUpdate. */
  requests: Request[];
  createdFields: FieldKey[];
}

/** Read header text + column tags from a getByDataFilter result. */
export function headerAndTags(info: SheetInfo): { header: string[]; tags: ColumnTag[] } {
  const data = info.data?.[0];
  const start = data?.startColumn ?? 0;
  const header: string[] = [];
  (data?.rowData?.[0]?.values ?? []).forEach((v, i) => (header[start + i] = v.formattedValue ?? ''));
  for (let i = 0; i < header.length; i++) header[i] ??= '';
  const tags: ColumnTag[] = [];
  (data?.columnMetadata ?? []).forEach((c, i) => {
    for (const m of c.developerMetadata ?? []) {
      if (m.metadataKey === MD_FIELD && m.metadataValue) tags.push({ field: m.metadataValue, columnIndex: start + i, metadataId: m.metadataId });
    }
  });
  return { header, tags };
}

/**
 * Work out the column layout and the requests needed to repair it:
 * tag columns found by header name, recreate missing columns at the end.
 * @param dataRowCount rows with data (to fill a recreated cover_preview column), or 0
 */
function planLayout(info: SheetInfo, dataRowCount: number): LayoutPlan {
  const sheetId = info.properties.sheetId;
  const { header, tags } = headerAndTags(info);
  const res = resolveColumns(header, tags);
  const requests: Request[] = [];
  const columnCount = info.properties.gridProperties?.columnCount ?? 26;

  if (!info.developerMetadata?.some((m) => m.metadataKey === MD_TAB && m.metadataValue === 'books')) {
    requests.push(sheetTagRequest(sheetId, 'books'));
  }
  if (res.created.length) {
    const needed = Math.max(...res.created.map((c) => c.index)) + 1;
    if (needed > columnCount) {
      requests.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: needed - columnCount } });
    }
    for (const c of res.created) {
      requests.push(headerCellRequest(sheetId, c.index, c.field));
      requests.push(columnTagRequest(sheetId, c.index, c.field));
      const w = widthRequest(sheetId, c.index, c.field);
      if (w) requests.push(w);
      if (c.field === 'cover_preview' && dataRowCount > 0) {
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1 + dataRowCount, startColumnIndex: c.index, endColumnIndex: c.index + 1 },
            cell: { userEnteredValue: { formulaValue: coverPreviewFormula(res.columns.cover_url) } },
            fields: 'userEnteredValue',
          },
        });
      }
    }
  }
  for (const u of res.untagged) requests.push(columnTagRequest(sheetId, u.index, u.field));
  return { columns: res.columns, title: info.properties.title, requests, createdFields: res.created.map((c) => c.field) };
}

// ---------- load ----------

export interface LoadResult {
  booksSheetId: number;
  books: Book[];
  warnings: string[];
  repaired: boolean;
}

export async function loadLibrary(spreadsheetId: string, hintSheetId?: number, depth = 0): Promise<LoadResult> {
  const { sheets } = await getSheets(spreadsheetId);
  let books = findTab(sheets, 'books', hintSheetId);
  const meta = findTab(sheets, 'meta');
  const warnings: string[] = [];

  if (!books) {
    if (depth > 0) throw new Error("Couldn't create the Books tab in your sheet.");
    // The Books tab was deleted: make a fresh one and start over.
    const sheetId = Math.floor(100000 + Math.random() * 800000);
    await batchUpdate(spreadsheetId, [
      { addSheet: { properties: { sheetId, title: uniqueTitle(sheets, BOOKS_TAB), index: 0, gridProperties: { frozenRowCount: 1 } } } },
      sheetTagRequest(sheetId, 'books'),
    ]);
    const r = await loadLibrary(spreadsheetId, sheetId, depth + 1);
    r.warnings.unshift('The Books tab was missing from your sheet, so a new empty one was created.');
    return r;
  }

  const sheetId = books.properties.sheetId;
  const ranges = [quoteSheet(books.properties.title)];
  if (meta) ranges.push(`${quoteSheet(meta.properties.title)}!A1:B40`);
  const [headerInfo, values] = await Promise.all([getHeaderBySheetId(spreadsheetId, sheetId), batchGetValues(spreadsheetId, ranges)]);
  if (!headerInfo) throw new LayoutChangedError();

  const rows = values[0] ?? [];
  const dataRows = rows.slice(1);
  const layout = planLayout(headerInfo, dataRows.length);
  const parsed = rowsToBooks(dataRows, layout.columns, 1);
  warnings.push(...parsed.warnings);

  const requests = [...layout.requests];
  for (const fix of parsed.idFixes) {
    requests.push({
      updateCells: {
        start: { sheetId, rowIndex: fix.rowIndex, columnIndex: layout.columns.id },
        rows: [{ values: [{ userEnteredValue: { stringValue: fix.id } }] }],
        fields: 'userEnteredValue',
      },
    });
  }
  if (!meta) {
    const used = new Set(sheets.map((s) => s.properties.sheetId));
    let metaId = META_SHEET_ID;
    while (used.has(metaId)) metaId++;
    requests.push(...metaRequests(appUrl(), sheetId, metaId));
  }
  const metaRows = values[1] ?? [];
  const version = meta ? readSchemaVersion(metaRows) : SCHEMA_VERSION;
  if (version > SCHEMA_VERSION) {
    warnings.push('Your sheet was updated by a newer version of the app. Please reload the page to get the latest version.');
  }
  if (meta && version < SCHEMA_VERSION) {
    // Migration: columns introduced since `version` were just added by planLayout; record the new version.
    const row = metaRows.findIndex((r) => String(r?.[0] ?? '').trim() === 'schema_version');
    requests.push({
      updateCells: {
        start: { sheetId: meta.properties.sheetId, rowIndex: row >= 0 ? row : Math.max(metaRows.length, 2), columnIndex: 0 },
        rows: [{ values: [{ userEnteredValue: { stringValue: 'schema_version' } }, { userEnteredValue: { numberValue: SCHEMA_VERSION } }] }],
        fields: 'userEnteredValue',
      },
    });
  }
  // Columns that are new in this version are added quietly; only warn about ones the user removed.
  const reallyMissing = layout.createdFields.filter((f) => (FIELD_BY_KEY.get(f)?.since ?? 1) <= version);
  if (reallyMissing.length) {
    warnings.push(`These columns were missing and have been added back at the end of your sheet: ${reallyMissing.join(', ')}.`);
  }
  if (requests.length) await batchUpdate(spreadsheetId, requests);
  return { booksSheetId: sheetId, books: parsed.books, warnings, repaired: requests.length > 0 };
}

function uniqueTitle(sheets: SheetInfo[], base: string): string {
  const titles = new Set(sheets.map((s) => s.properties.title));
  if (!titles.has(base)) return base;
  for (let i = 2; ; i++) if (!titles.has(`${base} ${i}`)) return `${base} ${i}`;
}

export function readSchemaVersion(rows: unknown[][]): number {
  for (const r of rows) if (String(r?.[0] ?? '').trim() === 'schema_version') return Number(r[1]) || 0;
  return 0;
}

// ---------- write ----------

/**
 * Write a coalesced plan in one batchUpdate. Re-reads the header (columns may
 * have moved) and, for updates/deletes, the id column (rows may have been sorted).
 */
export async function writePlan(spreadsheetId: string, booksSheetId: number, plan: WritePlan): Promise<void> {
  if (!plan.adds.length && !plan.updates.length && !plan.deletes.length) return;
  const info = await getHeaderBySheetId(spreadsheetId, booksSheetId);
  if (!info) throw new LayoutChangedError();
  const layout = planLayout(info, 0);
  const cols = layout.columns;
  const requests: Request[] = [...layout.requests];

  const rowById = new Map<string, number>();
  if ((plan.updates.length || plan.deletes.length) && !layout.createdFields.includes('id')) {
    const L = columnLetter(cols.id);
    const [idRows] = await batchGetValues(spreadsheetId, [`${quoteSheet(layout.title)}!${L}:${L}`]);
    (idRows ?? []).forEach((r, i) => {
      const id = String(r?.[0] ?? '').trim();
      if (i > 0 && id && !rowById.has(id)) rowById.set(id, i);
    });
  }

  const adds: Book[] = [...plan.adds];
  for (const u of plan.updates) {
    const row = rowById.get(u.id);
    if (row === undefined) {
      // Row was removed in the sheet while the app had an edit pending: keep the book.
      adds.push(u.book);
      continue;
    }
    for (const f of u.fields) {
      const ci = cols[f];
      if (ci === undefined) continue;
      requests.push({
        updateCells: {
          start: { sheetId: booksSheetId, rowIndex: row, columnIndex: ci },
          rows: [{ values: [fieldCell(f, u.book, cols)] }],
          fields: CELL_FIELDS,
        },
      });
    }
  }

  const deleteRows = plan.deletes
    .map((id) => rowById.get(id))
    .filter((r): r is number => r !== undefined)
    .sort((a, b) => b - a);
  for (const r of deleteRows) {
    requests.push({ deleteDimension: { range: { sheetId: booksSheetId, dimension: 'ROWS', startIndex: r, endIndex: r + 1 } } });
  }

  if (adds.length) {
    requests.push({
      appendCells: {
        sheetId: booksSheetId,
        rows: adds.map((b) => ({ values: bookToRow(b, cols) })),
        fields: CELL_FIELDS,
      },
    });
  }
  await batchUpdate(spreadsheetId, requests);
}
