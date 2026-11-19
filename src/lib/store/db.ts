/** IndexedDB: library cache, outbox of unsaved changes, lookup cache. */
import { openDB, type IDBPDatabase } from 'idb';
import type { Book, BookMetadata } from '../types';
import type { Op } from './ops';

export interface CachedLibrary {
  spreadsheetId: string;
  booksSheetId?: number;
  email?: string;
  books: Book[];
  warnings: string[];
  savedAt: number;
}

export interface QueuedOp {
  seq?: number;
  spreadsheetId: string;
  op: Op;
  at: number;
}

export interface CachedLookup {
  isbn: string;
  metadata: BookMetadata | null;
  sources: string[];
  at: number;
}

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('book-library', 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      d.createObjectStore('lookups', { keyPath: 'isbn' });
    },
  });
  return dbp;
}

/** IndexedDB can be unavailable (private mode, storage cleared). The app keeps working without it. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn('IndexedDB unavailable', e);
    return fallback;
  }
}

export const getLibrary = () => safe(async () => (await db()).get('kv', 'library') as Promise<CachedLibrary | undefined>, undefined);
export const putLibrary = (lib: CachedLibrary) => safe(async () => void (await (await db()).put('kv', lib, 'library')), undefined);
export const clearLibrary = () => safe(async () => void (await (await db()).delete('kv', 'library')), undefined);

// The outbox is the one thing that must not silently fail, so it falls back to memory.
const memoryOutbox: QueuedOp[] = [];
let memorySeq = 1;
let useMemory = false;

export async function addOp(q: QueuedOp): Promise<void> {
  if (!useMemory) {
    try {
      await (await db()).add('outbox', q);
      return;
    } catch (e) {
      console.warn('Outbox falling back to memory', e);
      useMemory = true;
    }
  }
  memoryOutbox.push({ ...q, seq: memorySeq++ });
}

export async function getOps(spreadsheetId?: string): Promise<QueuedOp[]> {
  let all: QueuedOp[] = [];
  if (!useMemory) {
    try {
      all = (await (await db()).getAll('outbox')) as QueuedOp[];
    } catch {
      useMemory = true;
    }
  }
  all = all.concat(memoryOutbox);
  return spreadsheetId ? all.filter((q) => q.spreadsheetId === spreadsheetId) : all;
}

export async function removeOps(seqs: number[]): Promise<void> {
  const set = new Set(seqs);
  for (let i = memoryOutbox.length - 1; i >= 0; i--) if (set.has(memoryOutbox[i].seq!)) memoryOutbox.splice(i, 1);
  if (useMemory) return;
  try {
    const tx = (await db()).transaction('outbox', 'readwrite');
    await Promise.all([...seqs.map((s) => tx.store.delete(s)), tx.done]);
  } catch (e) {
    console.warn(e);
  }
}

export const getLookup = (isbn: string) =>
  safe(async () => (await db()).get('lookups', isbn) as Promise<CachedLookup | undefined>, undefined);
export const putLookup = (l: CachedLookup) => safe(async () => void (await (await db()).put('lookups', l)), undefined);
