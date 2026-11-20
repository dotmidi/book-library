/** CSV import runner. Lives outside the page so it keeps going if you navigate away. */
import { parseCsvText, type CsvParseResult } from './csv';
import { fillBlanks, lookupBook, lookupByTitle, metadataToBook } from './lookup/service';
import { library } from './store/library.svelte';
import type { Book } from './types';

export interface ImportPreview extends CsvParseResult {
  duplicates: number;
  /** Rows with a title but no ISBN (can be matched by title and author). */
  withoutIsbn: number;
  fileName: string;
}

class Importer {
  preview = $state<ImportPreview | null>(null);
  running = $state(false);
  done = $state(0);
  total = $state(0);
  finished = $state(false);
  added = $state(0);
  matched = $state(0);
  /** Look up books without ISBN by title + author and fill in cover, ISBN etc. */
  matchByTitle = $state(true);
  /** Import everything into the wishlist instead of the library. */
  toWishlist = $state(false);

  async load(file: File) {
    this.finished = false;
    const text = await file.text();
    const r = parseCsvText(text);
    const seen = new Set(library.books.map((b) => b.isbn13).filter(Boolean));
    let duplicates = 0;
    const keep = (b: Book) => {
      if (!b.isbn13) return true;
      if (seen.has(b.isbn13)) {
        duplicates++;
        return false;
      }
      seen.add(b.isbn13);
      return true;
    };
    r.books = r.books.filter(keep);
    r.needLookup = r.needLookup.filter(keep);
    const withoutIsbn = r.books.filter((b) => !b.isbn13 && b.title).length;
    this.preview = { ...r, duplicates, withoutIsbn, fileName: file.name };
  }

  async run() {
    const p = this.preview;
    if (!p || this.running) return;
    this.running = true;
    this.done = 0;
    this.added = 0;
    this.matched = 0;
    this.total = p.books.length + p.needLookup.length;
    const wishlist = this.toWishlist;
    try {
      for (const original of p.books) {
        let b = original;
        if (this.matchByTitle && !b.isbn13 && b.title) {
          const meta = await lookupByTitle(b.title, b.authors[0] ?? '');
          if (meta && !(meta.isbn13 && library.findByIsbn(meta.isbn13))) {
            b = fillBlanks(b, meta);
            this.matched++;
          }
        }
        await library.add({ ...b, wishlist: wishlist || b.wishlist });
        this.done++;
        this.added++;
      }
      for (const b of p.needLookup) {
        const out = await lookupBook(b.isbn13);
        const looked = metadataToBook(out.metadata, b.isbn13, b.isbn10);
        if (out.metadata) this.matched++;
        await library.add({
          ...looked,
          location: b.location,
          category: b.category || looked.category,
          tags: b.tags,
          notes: b.notes,
          copies: b.copies,
          date_added: b.date_added,
          wishlist: wishlist || b.wishlist,
        });
        this.done++;
        this.added++;
      }
    } finally {
      this.running = false;
      this.finished = true;
      this.preview = null;
    }
  }

  reset() {
    if (this.running) return;
    this.preview = null;
    this.finished = false;
  }
}

export const importer = new Importer();
