import type { Book, BookField } from '../types';

/** A change waiting to be written to the sheet. */
export type Op =
  | { kind: 'add'; book: Book }
  | { kind: 'update'; id: string; fields: BookField[]; book: Book }
  | { kind: 'delete'; id: string };

export interface WritePlan {
  adds: Book[];
  updates: { id: string; fields: BookField[]; book: Book }[];
  deletes: string[];
}

/**
 * Collapse a queue of ops into the minimum writes:
 * add+update → add (latest values), update+update → one update (union of fields),
 * add+delete → nothing, update+delete → delete.
 */
export function coalesce(ops: Op[]): WritePlan {
  type Entry = { added?: Book; fields?: Set<BookField>; book?: Book; deleted?: boolean };
  const byId = new Map<string, Entry>();
  const order: string[] = [];
  const entry = (id: string) => {
    let e = byId.get(id);
    if (!e) {
      e = {};
      byId.set(id, e);
      order.push(id);
    }
    return e;
  };

  for (const op of ops) {
    if (op.kind === 'add') {
      const e = entry(op.book.id);
      e.added = op.book;
      e.deleted = false;
    } else if (op.kind === 'update') {
      const e = entry(op.id);
      if (e.deleted) continue;
      if (e.added) e.added = op.book;
      else {
        e.fields ??= new Set();
        op.fields.forEach((f) => e.fields!.add(f));
        e.book = op.book;
      }
    } else {
      const e = entry(op.id);
      if (e.added) {
        byId.delete(op.id);
        order.splice(order.indexOf(op.id), 1);
      } else {
        e.deleted = true;
        e.fields = undefined;
        e.book = undefined;
      }
    }
  }

  const plan: WritePlan = { adds: [], updates: [], deletes: [] };
  for (const id of order) {
    const e = byId.get(id)!;
    if (e.added) plan.adds.push(e.added);
    else if (e.deleted) plan.deletes.push(id);
    else if (e.book && e.fields?.size) plan.updates.push({ id, fields: [...e.fields], book: e.book });
  }
  return plan;
}

/** Apply pending ops on top of books loaded from the sheet, so unsaved changes stay visible. */
export function applyOps(books: Book[], ops: Op[]): Book[] {
  const out = [...books];
  const index = () => new Map(out.map((b, i) => [b.id, i]));
  for (const op of ops) {
    const idx = index();
    if (op.kind === 'add') {
      if (!idx.has(op.book.id)) out.push(op.book);
    } else if (op.kind === 'update') {
      const i = idx.get(op.id);
      if (i === undefined) out.push(op.book);
      else out[i] = op.book;
    } else {
      const i = idx.get(op.id);
      if (i !== undefined) out.splice(i, 1);
    }
  }
  return out;
}
