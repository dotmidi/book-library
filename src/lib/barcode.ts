/**
 * Anything scanned or typed on the Add page: a book ISBN, or another product
 * barcode (EAN-13 / UPC-A / EAN-8) such as a CD or vinyl record.
 */
import { cleanIsbn, parseIsbn, type IsbnProblem, type ParsedIsbn } from './isbn';

export type ParsedCode = ({ kind: 'isbn' } & ParsedIsbn) | { kind: 'barcode'; barcode: string };

export type CodeResult = { ok: true; value: ParsedCode } | { ok: false; problem: IsbnProblem };

/** GS1 check digit for EAN-8, UPC-A (12) and EAN-13: weights 3,1,3,1… from the right. */
export function gtinCheckDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const fromRight = body.length - i;
    sum += Number(body[i]) * (fromRight % 2 === 1 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidGtin(code: string): boolean {
  return /^(\d{8}|\d{12}|\d{13})$/.test(code) && gtinCheckDigit(code.slice(0, -1)) === code[code.length - 1];
}

export function parseCode(input: string): CodeResult {
  const s = cleanIsbn(input);
  // Books: ISBN-10, or EAN-13 in the 978/979 "Bookland" range.
  if (s.length === 10 || /^97[89]/.test(s)) {
    const r = parseIsbn(s);
    return r.ok ? { ok: true, value: { kind: 'isbn', ...r.value } } : r;
  }
  if (!s) return { ok: false, problem: 'empty' };
  if (!/^\d+$/.test(s)) return { ok: false, problem: 'characters' };
  if (![8, 12, 13].includes(s.length)) return { ok: false, problem: 'length' };
  if (!isValidGtin(s)) return { ok: false, problem: 'checksum' };
  return { ok: true, value: { kind: 'barcode', barcode: s } };
}

/** Both spellings of a UPC-A code: "720642442524" ⇄ "0720642442524". */
export function barcodeVariants(code: string): string[] {
  if (code.length === 12) return [code, '0' + code];
  if (code.length === 13 && code.startsWith('0')) return [code, code.slice(1)];
  return [code];
}

/** Same product, whichever spelling (12 or 13 digits) was saved. */
export function sameBarcode(a: string, b: string): boolean {
  if (!a || !b) return false;
  return barcodeVariants(a).includes(b);
}
