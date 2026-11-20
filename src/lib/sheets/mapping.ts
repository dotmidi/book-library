/**
 * Pure functions that translate between sheet rows and Book objects.
 * No network here, so all of it is unit-tested.
 */
import { isbnFromCell, isValidIsbn10, isValidIsbn13, isbn10to13, isbn13to10 } from '../isbn';
import { emptyBook, newId, type Book, type BookField } from '../types';
import { languageName } from '../languages';
import { FIELDS, FIELD_BY_KEY, columnLetter, matchHeader, type FieldDef, type FieldKey } from './schema';

export type ColumnMap = Partial<Record<FieldKey, number>>;

export interface ColumnTag {
  field: string;
  columnIndex: number;
  metadataId?: number;
}

export interface ColumnResolution {
  columns: Record<FieldKey, number>;
  /** Fields matched by header text only: they need a metadata tag added. */
  untagged: { field: FieldKey; index: number }[];
  /** Fields with no column at all: create a column at `index`. */
  created: { field: FieldKey; index: number }[];
  /** Tags pointing at a field we no longer know, or duplicates: safe to ignore. */
  ignoredTags: ColumnTag[];
}

/**
 * Decide which column holds which field.
 * Order of trust: metadata tag on the column → header text → create new column.
 */
export function resolveColumns(headerRow: unknown[], tags: ColumnTag[]): ColumnResolution {
  const columns: ColumnMap = {};
  const claimed = new Set<number>();
  const untagged: ColumnResolution['untagged'] = [];
  const ignoredTags: ColumnTag[] = [];

  for (const tag of [...tags].sort((a, b) => a.columnIndex - b.columnIndex)) {
    const key = tag.field as FieldKey;
    if (!FIELD_BY_KEY.has(key) || columns[key] !== undefined || claimed.has(tag.columnIndex)) {
      ignoredTags.push(tag);
      continue;
    }
    columns[key] = tag.columnIndex;
    claimed.add(tag.columnIndex);
  }

  headerRow.forEach((header, index) => {
    if (claimed.has(index)) return;
    const key = matchHeader(header);
    if (!key || columns[key] !== undefined) return;
    columns[key] = index;
    claimed.add(index);
    untagged.push({ field: key, index });
  });

  let next = Math.max(headerRow.length, claimed.size ? Math.max(...claimed) + 1 : 0);
  // Skip over any trailing header cells that have unknown text.
  const created: ColumnResolution['created'] = [];
  for (const f of FIELDS) {
    if (columns[f.key] === undefined) {
      columns[f.key] = next;
      created.push({ field: f.key, index: next });
      next++;
    }
  }
  return { columns: columns as Record<FieldKey, number>, untagged, created, ignoredTags };
}

// ---------- reading ----------

/** Google Sheets date serial (days since 1899-12-30) → yyyy-mm-dd */
export function serialToIso(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

export function isoToSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
}

/** Parse a hand-typed date. European day-first order for ambiguous dates. */
export function parseDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return serialToIso(value);
  const s = String(value).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function parseText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).trim();
}

function parseInt0(v: unknown, field: FieldKey): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const s = parseText(v);
  if (!s) return null;
  if (field === 'year') {
    const m = /(\d{4})/.exec(s);
    return m ? Number(m[1]) : null;
  }
  const m = /-?\d+/.exec(s.replace(/[.,\s](?=\d{3}\b)/g, ''));
  return m ? Number(m[0]) : null;
}

function parseBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return /^(true|yes|y|1|x|ja|evet|waar|✓|✔)$/i.test(parseText(v));
}

function parseList(v: unknown, def: FieldDef): string[] {
  const s = parseText(v);
  if (!s) return [];
  const sep = def.key === 'authors' ? /\s*[;|]\s*/ : /\s*[,;|]\s*/;
  return s.split(sep).map((x) => x.trim()).filter(Boolean);
}

export interface ParsedRow {
  book?: Book;
  /** The row had no id (or a duplicate) and we generated one: write it back. */
  assignedId?: boolean;
  /** Human-readable reason the row was skipped. */
  skipped?: string;
  /** Row is completely empty: ignore silently. */
  empty?: boolean;
}

function cell(row: unknown[], cols: ColumnMap, key: FieldKey): unknown {
  const i = cols[key];
  return i === undefined ? undefined : row[i];
}

export function rowToBook(row: unknown[], cols: ColumnMap): ParsedRow {
  const known = new Set(Object.values(cols));
  const hasAny = row.some((v, i) => known.has(i) && v !== '' && v !== null && v !== undefined);
  if (!hasAny) return { empty: true };

  const book = emptyBook();
  for (const def of FIELDS) {
    if (def.key === 'cover_preview') continue;
    const v = cell(row, cols, def.key);
    const key = def.key as BookField;
    switch (def.kind) {
      case 'text':
        (book[key] as string) = parseText(v);
        break;
      case 'isbn':
        (book[key] as string) = isbnFromCell(v);
        break;
      case 'code':
        // Barcodes typed by hand may arrive as numbers; keep digits only.
        (book[key] as string) = typeof v === 'number' ? Math.round(v).toString() : parseText(v).replace(/\D/g, '');
        break;
      case 'list':
        (book[key] as string[]) = parseList(v, def);
        break;
      case 'int':
        (book[key] as number | null) = parseInt0(v, def.key);
        break;
      case 'date':
        (book[key] as string) = parseDate(v);
        break;
      case 'bool':
        (book[key] as boolean) = parseBool(v);
        break;
    }
  }

  // Fill in the missing ISBN form when one is valid.
  if (!book.isbn13 && isValidIsbn10(book.isbn10)) book.isbn13 = isbn10to13(book.isbn10);
  if (book.isbn13.length === 10 && isValidIsbn10(book.isbn13)) {
    // Someone typed an ISBN-10 into the isbn13 column.
    book.isbn10 = book.isbn13;
    book.isbn13 = isbn10to13(book.isbn10);
  }
  if (!book.isbn10 && isValidIsbn13(book.isbn13)) book.isbn10 = isbn13to10(book.isbn13);

  book.language = languageName(book.language);
  if (book.copies === null || !Number.isFinite(book.copies) || book.copies < 1) book.copies = 1;

  if (!book.title && !book.isbn13 && !book.isbn10 && !book.barcode) {
    return { skipped: 'it has no title and no ISBN' };
  }

  let assignedId = false;
  if (!book.id) {
    book.id = newId();
    assignedId = true;
  }
  return { book, assignedId };
}

export interface RowsResult {
  books: Book[];
  /** id → 0-based sheet row index */
  rowIndex: Map<string, number>;
  /** Rows whose id must be written back (missing or duplicate). */
  idFixes: { rowIndex: number; id: string }[];
  warnings: string[];
}

/**
 * @param rows data rows (header excluded)
 * @param firstRowIndex 0-based sheet row index of rows[0] (normally 1)
 */
export function rowsToBooks(rows: unknown[][], cols: ColumnMap, firstRowIndex = 1): RowsResult {
  const books: Book[] = [];
  const rowIndex = new Map<string, number>();
  const idFixes: RowsResult['idFixes'] = [];
  const warnings: string[] = [];

  rows.forEach((row, i) => {
    const sheetRow = firstRowIndex + i;
    let parsed: ParsedRow;
    try {
      parsed = rowToBook(Array.isArray(row) ? row : [], cols);
    } catch (e) {
      warnings.push(`Row ${sheetRow + 1} couldn't be read, so it was skipped.`);
      return;
    }
    if (parsed.empty) return;
    if (!parsed.book) {
      warnings.push(`Row ${sheetRow + 1} was skipped because ${parsed.skipped}.`);
      return;
    }
    const book = parsed.book;
    if (rowIndex.has(book.id)) {
      book.id = newId();
      parsed.assignedId = true;
    }
    if (parsed.assignedId) idFixes.push({ rowIndex: sheetRow, id: book.id });
    rowIndex.set(book.id, sheetRow);
    books.push(book);
  });
  return { books, rowIndex, idFixes, warnings };
}

// ---------- writing ----------

export interface CellData {
  userEnteredValue?: { stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string };
  userEnteredFormat?: { numberFormat: { type: string; pattern?: string } };
  dataValidation?: { condition: { type: string } };
}

/** Field mask for every cell write, so formats/validation are set or cleared consistently. */
export const CELL_FIELDS = 'userEnteredValue,userEnteredFormat.numberFormat,dataValidation';

const TEXT_FORMAT = { numberFormat: { type: 'TEXT' } };
const DATE_FORMAT = { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } };

export function coverPreviewFormula(coverColumnIndex: number): string {
  const L = columnLetter(coverColumnIndex);
  return `=IFERROR(IMAGE(INDEX(${L}:${L},ROW())),"")`;
}

/** Cell for one field. Strings are always stringValue, so text starting with "=" never becomes a formula. */
export function fieldCell(key: FieldKey, book: Book, cols: ColumnMap): CellData {
  const def = FIELD_BY_KEY.get(key)!;
  if (def.kind === 'formula') {
    const ci = cols.cover_url;
    return ci === undefined ? {} : { userEnteredValue: { formulaValue: coverPreviewFormula(ci) } };
  }
  const v = book[key as BookField];
  switch (def.kind) {
    case 'isbn':
    case 'code':
      return v ? { userEnteredValue: { stringValue: String(v) }, userEnteredFormat: TEXT_FORMAT } : { userEnteredFormat: TEXT_FORMAT };
    case 'list': {
      const s = (v as string[]).join(def.sep ?? ', ');
      return s ? { userEnteredValue: { stringValue: s } } : {};
    }
    case 'int':
      return typeof v === 'number' && Number.isFinite(v) ? { userEnteredValue: { numberValue: v } } : {};
    case 'date': {
      const serial = isoToSerial(String(v ?? ''));
      if (serial !== null) return { userEnteredValue: { numberValue: serial }, userEnteredFormat: DATE_FORMAT };
      return v ? { userEnteredValue: { stringValue: String(v) } } : {};
    }
    case 'bool':
      return { userEnteredValue: { boolValue: Boolean(v) }, dataValidation: { condition: { type: 'BOOLEAN' } } };
    case 'text':
    default:
      return v ? { userEnteredValue: { stringValue: String(v) } } : {};
  }
}

/** A full row for appending. Columns the app doesn't know are left empty. */
export function bookToRow(book: Book, cols: ColumnMap): CellData[] {
  const width = Math.max(...Object.values(cols).map((n) => n ?? 0)) + 1;
  const row: CellData[] = Array.from({ length: width }, () => ({}));
  for (const f of FIELDS) {
    const i = cols[f.key];
    if (i !== undefined) row[i] = fieldCell(f.key, book, cols);
  }
  return row;
}

/** Fields whose values differ between two books (for writing only changed cells). */
export function changedFields(before: Book, after: Book): BookField[] {
  const out: BookField[] = [];
  for (const f of FIELDS) {
    if (f.key === 'cover_preview') continue;
    const k = f.key as BookField;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out.push(k);
  }
  return out;
}
