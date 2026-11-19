/** CSV import runner. Lives outside the page so it keeps going if you navigate away. */
import { parseCsvText, type CsvParseResult } from './csv';
import { lookupBook, metadataToBook } from './lookup/service';
import { library } from './store/library.svelte';
import type { Book } from './types';

export interface ImportPreview extends CsvParseResult {
  duplicates: number;
  fileName: string;
}

class Importer {
  preview = $state<ImportPreview | null>(null);
  running = $state(false);
  done = $state(0);
  total = $state(0);
  finished = $state(false);
  added = $state(0);

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
    this.preview = { ...r, duplicates, fileName: file.name };
  }

  async run() {
    const p = this.preview;
    if (!p || this.running) return;
    this.running = true;
    this.done = 0;
    this.added = 0;
    this.total = p.books.length + p.needLookup.length;
    try {
      for (const b of p.books) {
        await library.add(b);
        this.done++;
        this.added++;
      }
      for (const b of p.needLookup) {
        const out = await lookupBook(b.isbn13);
        const looked = metadataToBook(out.metadata, b.isbn13, b.isbn10);
        await library.add({
          ...looked,
          location: b.location,
          tags: b.tags,
          notes: b.notes,
          copies: b.copies,
          date_added: b.date_added,
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
