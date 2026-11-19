/**
 * The list of result cards on the Add page. Kept outside the component so the
 * cards survive navigating to a book and back.
 */
import { parseIsbn } from '../isbn';
import { lookupBook, metadataToBook } from '../lookup/service';
import { library } from '../store/library.svelte';
import type { Book } from '../types';
import { scanFeedback } from './feedback';

export type CardState = 'looking' | 'found' | 'notfound' | 'error' | 'duplicate' | 'saved' | 'copyAdded' | 'editing' | 'skipped';

export interface ScanCard {
  key: number;
  isbn13: string;
  isbn10: string;
  state: CardState;
  draft: Book;
  sources: string[];
  /** Book id once saved, or the existing book for duplicates. */
  bookId?: string;
  /** For "Undo" after a copy was added. */
  copiesBefore?: number;
}

const AUTO_KEY = 'bl.autoSave';

class ScanSession {
  cards = $state<ScanCard[]>([]);
  autoSave = $state(readAuto());
  private nextKey = 1;

  setAutoSave(on: boolean) {
    this.autoSave = on;
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  card(key: number): ScanCard | undefined {
    return this.cards.find((c) => c.key === key);
  }

  /** Returns an error message for invalid input, or '' on success. */
  submit(input: string, source: 'camera' | 'typed'): string {
    const p = parseIsbn(input);
    if (!p.ok) {
      if (source === 'camera') return '';
      scanFeedback('error');
      return p.problem;
    }
    const { isbn13, isbn10 } = p.value;
    // The same book scanned again while its card is still open: just move it to the top.
    const open = this.cards.find((c) => c.isbn13 === isbn13 && ['looking', 'found', 'notfound', 'error', 'editing', 'duplicate'].includes(c.state));
    if (open) {
      this.cards = [open, ...this.cards.filter((c) => c !== open)];
      return '';
    }
    const existing = library.findByIsbn(isbn13);
    const card: ScanCard = {
      key: this.nextKey++,
      isbn13,
      isbn10,
      state: existing ? 'duplicate' : 'looking',
      draft: metadataToBook(null, isbn13, isbn10),
      sources: [],
      bookId: existing?.id,
    };
    this.cards = [card, ...this.cards].slice(0, 30);
    scanFeedback(existing ? 'duplicate' : 'ok');
    if (!existing) this.lookup(card.key, false);
    return '';
  }

  async lookup(key: number, force: boolean) {
    const c = this.card(key);
    if (!c) return;
    c.state = 'looking';
    const out = await lookupBook(c.isbn13, { force });
    const card = this.card(key);
    if (!card || card.state !== 'looking') return;
    card.sources = out.sources;
    if (out.metadata) {
      card.draft = metadataToBook(out.metadata, card.isbn13, card.isbn10);
      card.state = 'found';
      if (this.autoSave) await this.save(key);
    } else {
      card.state = out.errors.length ? 'error' : 'notfound';
    }
  }

  async save(key: number, book?: Book) {
    const c = this.card(key);
    if (!c) return;
    const saved = await library.add(book ?? c.draft);
    c.bookId = saved.id;
    c.draft = saved;
    c.state = 'saved';
  }

  async addCopy(key: number) {
    const c = this.card(key);
    if (!c?.bookId) return;
    const b = library.get(c.bookId);
    c.copiesBefore = b?.copies ?? 1;
    await library.addCopy(c.bookId);
    c.state = 'copyAdded';
  }

  async undo(key: number) {
    const c = this.card(key);
    if (!c?.bookId) return;
    if (c.state === 'saved') {
      await library.remove(c.bookId);
      c.bookId = undefined;
      c.state = 'found';
    } else if (c.state === 'copyAdded') {
      await library.update(c.bookId, { copies: c.copiesBefore ?? 1 });
      c.state = 'duplicate';
    }
  }

  dismiss(key: number) {
    this.cards = this.cards.filter((c) => c.key !== key);
  }

  clearDone() {
    this.cards = this.cards.filter((c) => !['saved', 'copyAdded', 'skipped'].includes(c.state));
  }
}

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

export const scanSession = new ScanSession();
