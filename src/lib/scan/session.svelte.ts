/**
 * The list of result cards on the Add page. Kept outside the component so the
 * cards survive navigating to a book and back.
 */
import { parseCode } from '../barcode';
import { lookupBarcode, lookupBook, metadataToBook } from '../lookup/service';
import { library } from '../store/library.svelte';
import { emptyBook, type Book } from '../types';
import type { SeriesGroup } from '../series';
import { formatVolume } from '../volume';
import { guessLanguage } from '../isbnRegion';
import { amazonCover } from '../lookup/covers';
import { scanFeedback } from './feedback';

export type CardState =
  | 'looking'
  | 'found'
  | 'notfound'
  | 'error'
  | 'duplicate'
  | 'onWishlist'
  | 'notbook'
  | 'saved'
  | 'copyAdded'
  | 'bought'
  | 'editing'
  | 'skipped';

export interface ScanCard {
  key: number;
  /** 'isbn' for books, 'barcode' for CDs, vinyl and other products. */
  kind: 'isbn' | 'barcode';
  /** ISBN-13 or barcode digits: what identifies this card. */
  code: string;
  isbn13: string;
  isbn10: string;
  state: CardState;
  draft: Book;
  sources: string[];
  /** Book id once saved, or the existing book for duplicates. */
  bookId?: string;
  /** For "Undo" after a copy was added. */
  copiesBefore?: number;
  /** A wishlist entry matched by title: how it was before "Bought it" filled in this scan's details. */
  wishBefore?: Book;
}

const AUTO_KEY = 'bl.autoSave';
const WISH_KEY = 'bl.wishlistMode';
const OPEN_STATES: CardState[] = ['looking', 'found', 'notfound', 'error', 'editing', 'duplicate', 'onWishlist', 'notbook'];

class ScanSession {
  cards = $state<ScanCard[]>([]);
  autoSave = $state(readFlag(AUTO_KEY));
  /** New items go to the wishlist instead of the library. */
  wishlistMode = $state(readFlag(WISH_KEY));
  private nextKey = 1;

  setAutoSave(on: boolean) {
    this.autoSave = on;
    writeFlag(AUTO_KEY, on);
  }

  setWishlistMode(on: boolean) {
    this.wishlistMode = on;
    writeFlag(WISH_KEY, on);
  }

  card(key: number): ScanCard | undefined {
    return this.cards.find((c) => c.key === key);
  }

  /** Returns an error code for invalid typed input, or '' on success. */
  submit(input: string, source: 'camera' | 'typed'): string {
    const p = parseCode(input);
    if (!p.ok) {
      if (source === 'camera') return '';
      scanFeedback('error');
      return p.problem;
    }
    const v = p.value;
    const code = v.kind === 'isbn' ? v.isbn13 : v.barcode;
    // The same item scanned again while its card is still open: just move it to the top.
    const open = this.cards.find((c) => c.code === code && OPEN_STATES.includes(c.state));
    if (open) {
      this.cards = [open, ...this.cards.filter((c) => c !== open)];
      return '';
    }
    const existing = v.kind === 'isbn' ? library.findByIsbn(v.isbn13) : library.findByBarcode(v.barcode);
    const draft = v.kind === 'isbn' ? metadataToBook(null, v.isbn13, v.isbn10) : metadataToBook(null, '', '', v.barcode);
    const card: ScanCard = {
      key: this.nextKey++,
      kind: v.kind,
      code,
      isbn13: v.kind === 'isbn' ? v.isbn13 : '',
      isbn10: v.kind === 'isbn' ? v.isbn10 : '',
      state: existing ? (existing.wishlist && !this.wishlistMode ? 'onWishlist' : 'duplicate') : 'looking',
      draft,
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
    const out = c.kind === 'isbn' ? await lookupBook(c.isbn13, { force }) : await lookupBarcode(c.code, { force });
    const card = this.card(key);
    if (!card || card.state !== 'looking') return;
    card.sources = out.sources;
    if (out.metadata) {
      card.draft = metadataToBook(out.metadata, card.isbn13, card.isbn10, card.kind === 'barcode' ? card.code : '');
      // Already on the wishlist under its title (no ISBN yet, or another edition's): offer "Bought it".
      const wished = this.wishlistMode ? undefined : library.findWishlistByTitle(card.draft.title);
      if (wished) {
        card.bookId = wished.id;
        card.wishBefore = $state.snapshot(wished) as Book;
        card.state = 'onWishlist';
        return;
      }
      card.state = 'found';
      if (this.autoSave) await this.save(key);
    } else if (out.errors.length) {
      card.state = 'error';
    } else {
      // A product barcode that isn't a known CD/record: not something the app can look up.
      card.state = card.kind === 'barcode' ? 'notbook' : 'notfound';
    }
  }

  async save(key: number, book?: Book) {
    const c = this.card(key);
    if (!c) return;
    const saved = await library.add({ ...(book ?? c.draft), wishlist: this.wishlistMode });
    c.bookId = saved.id;
    c.draft = saved;
    c.state = 'saved';
  }

  /**
   * An ISBN no source knows (often a translated edition, e.g. a Turkish manga
   * volume), saved as a volume of a series you already have: the title and
   * author come from the series, the language from the ISBN, the cover from
   * Amazon when it has one. A wishlist entry for that volume is completed instead.
   */
  async saveAsVolume(key: number, group: SeriesGroup, volume: number) {
    const c = this.card(key);
    if (!c || c.kind !== 'isbn') return;
    // The author spelling most volumes share (one odd "Hero (Manga author)" shouldn't win).
    const all = [...group.volumes.values()].flat();
    const counts = new Map<string, number>();
    for (const b of all) if (b.authors.length) counts.set(b.authors.join('; '), (counts.get(b.authors.join('; ')) ?? 0) + 1);
    const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const sample = all.find((b) => b.authors.join('; ') === common) ?? all[0];
    const title = formatVolume(group.name, volume);
    const language = guessLanguage(c.isbn13) || sample?.language || '';
    const cover_url = await amazonCover(c.isbn13, c.isbn10);
    const wished = library.findWishlistByTitle(title);
    if (wished && !this.wishlistMode) {
      c.bookId = wished.id;
      c.wishBefore = $state.snapshot(wished) as Book;
      await library.update(wished.id, { isbn13: c.isbn13, isbn10: c.isbn10, language, cover_url: cover_url || wished.cover_url, wishlist: false, needs_details: false });
      c.state = 'bought';
      return;
    }
    const book: Book = {
      ...emptyBook(),
      isbn13: c.isbn13,
      isbn10: c.isbn10,
      title,
      authors: sample?.authors ?? [],
      category: sample?.category ?? '',
      language,
      cover_url,
    };
    await this.save(key, book);
  }

  async addCopy(key: number) {
    const c = this.card(key);
    if (!c?.bookId) return;
    const b = library.get(c.bookId);
    c.copiesBefore = b?.copies ?? 1;
    await library.addCopy(c.bookId);
    c.state = 'copyAdded';
  }

  /** A wishlist item was bought: move it into the library. */
  async markBought(key: number) {
    const c = this.card(key);
    if (!c?.bookId) return;
    if (c.wishBefore) {
      // Take the scanned copy's ISBN and cover, and fill in whatever else was blank.
      const d = c.draft;
      const scanned: Partial<Book> = { wishlist: false, needs_details: false };
      if (d.isbn13) scanned.isbn13 = d.isbn13;
      if (d.isbn10) scanned.isbn10 = d.isbn10;
      if (d.barcode) scanned.barcode = d.barcode;
      if (d.cover_url) scanned.cover_url = d.cover_url;
      for (const k of ['subtitle', 'publisher', 'language', 'category'] as const) if (!c.wishBefore[k] && d[k]) scanned[k] = d[k];
      for (const k of ['year', 'pages'] as const) if (c.wishBefore[k] === null && d[k] !== null) scanned[k] = d[k];
      if (!c.wishBefore.authors.length && d.authors.length) scanned.authors = d.authors;
      await library.update(c.bookId, scanned);
    } else await library.update(c.bookId, { wishlist: false });
    c.state = 'bought';
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
    } else if (c.state === 'bought') {
      const w = c.wishBefore;
      await library.update(
        c.bookId,
        w
          ? { wishlist: true, isbn13: w.isbn13, isbn10: w.isbn10, barcode: w.barcode, cover_url: w.cover_url, subtitle: w.subtitle, publisher: w.publisher, language: w.language, category: w.category, year: w.year, pages: w.pages, authors: w.authors, needs_details: w.needs_details }
          : { wishlist: true },
      );
      c.state = 'onWishlist';
    }
  }

  dismiss(key: number) {
    this.cards = this.cards.filter((c) => c.key !== key);
  }

  clearDone() {
    this.cards = this.cards.filter((c) => !['saved', 'copyAdded', 'bought', 'skipped'].includes(c.state));
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export const scanSession = new ScanSession();
