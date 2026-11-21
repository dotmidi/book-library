/**
 * App state: the books, the connection to Google, and the outbox that writes
 * changes to the sheet. Every change is stored in IndexedDB *before* we try
 * to send it, so nothing is lost if the token expires, the network drops or
 * the app is closed.
 */
import {
  AuthCancelledError,
  AuthRequiredError,
  getValidToken,
  hasSignedInBefore,
  onTokenChange,
  requestToken,
  setLoginHint,
  signOut as authSignOut,
  tokenExpiresAt,
} from '../auth/google';
import { ApiError, OfflineError } from '../google/api';
import { getDriveUser } from '../google/drive';
import { connectSpreadsheet, LayoutChangedError, loadLibrary, rememberBooksSheet, writePlan } from '../sheets/backend';
import { changedFields } from '../sheets/mapping';
import { sameBarcode } from '../barcode';
import { groupSeries, parseVolume, sameVolumeTitle, seriesKey } from '../series';
import { formatVolume } from '../volume';
import { needsTranslation, sourceLanguage, splitParallelTitle, translateTitle } from '../translate';
import { findCover } from '../lookup/covers';
import { newId, todayIso, type Book } from '../types';
import * as db from './db';
import { applyOps, coalesce, type Op } from './ops';

export type Phase = 'starting' | 'welcome' | 'connecting' | 'ready';

const FLUSH_DEBOUNCE = 1500;
const MIN_FLUSH_INTERVAL = 3000;
const STALE_AFTER = 5 * 60 * 1000;

function errorMessage(e: unknown): string {
  if (e instanceof OfflineError || e instanceof AuthRequiredError || e instanceof AuthCancelledError) return e.message;
  if (e instanceof ApiError) {
    if (e.status === 403) return "Google refused access to your sheet. Try signing out and in again.";
    if (e.status === 404) return "Your sheet couldn't be found. It may have been deleted.";
    return e.message;
  }
  return (e as Error)?.message || String(e);
}

class Library {
  books = $state<Book[]>([]);
  phase = $state<Phase>('starting');
  /** Loading from the sheet in the background. */
  refreshing = $state(false);
  /** The Google token has expired: a tap on "Reconnect" is needed. */
  needsAuth = $state(false);
  authError = $state('');
  connectError = $state('');
  pending = $state(0);
  saving = $state(false);
  syncError = $state('');
  warnings = $state<string[]>([]);
  spreadsheetId = $state('');
  user = $state<{ email: string; name: string } | null>(null);
  online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  lastSync = $state(0);
  justCreated = $state(false);

  private booksSheetId: number | undefined;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private flushing = false;
  private lastFlush = 0;
  private retryDelay = 0;
  private hardErrors = 0;
  private cacheTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private translating = false;
  private translateTried = new Set<string>();
  private coversTried = new Set<string>();
  private fillingCovers = false;

  /** @param redirectError message from handleRedirectReturn(), which main.ts runs first */
  async start(redirectError?: string) {
    if (this.started) return;
    this.started = true;
    addEventListener('online', () => {
      this.online = true;
      this.scheduleFlush(0);
    });
    addEventListener('offline', () => (this.online = false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      this.checkToken();
      if (this.phase === 'ready' && getValidToken() && Date.now() - this.lastSync > STALE_AFTER) this.refresh();
      this.scheduleFlush(0);
    });
    onTokenChange(() => this.checkToken());
    setInterval(() => this.checkToken(), 30_000);

    if (redirectError) this.authError = redirectError;

    const cached = await db.getLibrary();
    if (cached) {
      this.books = cached.books;
      this.spreadsheetId = cached.spreadsheetId;
      this.booksSheetId = cached.booksSheetId;
      this.warnings = cached.warnings ?? [];
      this.lastSync = cached.savedAt;
      if (cached.email) this.user = { email: cached.email, name: '' };
    }
    await this.updatePending();

    if (getValidToken()) {
      await this.connectAndLoad();
    } else if (cached) {
      this.phase = 'ready';
      this.needsAuth = true;
    } else {
      this.phase = 'welcome';
    }
  }

  get hasSignedInBefore() {
    return hasSignedInBefore();
  }

  private checkToken() {
    if (this.phase !== 'ready') return;
    const valid = getValidToken() !== null;
    if (valid && this.needsAuth) {
      this.needsAuth = false;
      this.scheduleFlush(0);
    } else if (!valid && !this.needsAuth) {
      this.needsAuth = true;
    }
  }

  /** Seconds until the Google connection expires (for the UI). */
  get tokenSecondsLeft() {
    return Math.max(0, Math.round((tokenExpiresAt() - Date.now()) / 1000));
  }

  /** Must be called from a tap/click handler. */
  async signIn(switchAccount = false) {
    this.authError = '';
    try {
      await requestToken({ switchAccount });
      this.needsAuth = false;
      await this.connectAndLoad();
    } catch (e) {
      this.authError = errorMessage(e);
    }
  }

  /** Renew the Google token after it expired. Must be called from a tap. */
  async reconnect() {
    this.authError = '';
    try {
      await requestToken();
      this.needsAuth = false;
      if (!this.spreadsheetId) await this.connectAndLoad();
      else {
        this.scheduleFlush(0);
        if (Date.now() - this.lastSync > STALE_AFTER) this.refresh();
      }
    } catch (e) {
      this.authError = errorMessage(e);
    }
  }

  private async connectAndLoad() {
    this.connectError = '';
    if (this.phase !== 'ready') this.phase = 'connecting';
    try {
      const user = await getDriveUser();
      if (user) {
        if (this.user?.email && user.email && this.user.email !== user.email) {
          // A different Google account on this device: don't show the previous person's books.
          this.books = [];
          this.spreadsheetId = '';
          this.booksSheetId = undefined;
          await db.clearLibrary();
        }
        this.user = user;
        if (user.email) setLoginHint(user.email);
      }
      const conn = await connectSpreadsheet();
      this.justCreated = conn.created;
      if (conn.spreadsheetId !== this.spreadsheetId) this.booksSheetId = conn.booksSheetId;
      this.spreadsheetId = conn.spreadsheetId;
      await this.reload();
      this.phase = 'ready';
      await this.updatePending();
      this.scheduleFlush(0);
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        this.needsAuth = true;
        if (this.phase !== 'ready') this.phase = this.books.length ? 'ready' : 'welcome';
        return;
      }
      this.connectError = errorMessage(e);
      if (this.books.length) this.phase = 'ready';
    }
  }

  private async reload() {
    const res = await loadLibrary(this.spreadsheetId, this.booksSheetId);
    if (res.booksSheetId !== this.booksSheetId) {
      this.booksSheetId = res.booksSheetId;
      rememberBooksSheet(this.spreadsheetId, res.booksSheetId).catch(() => {});
    }
    const ops = (await db.getOps(this.spreadsheetId)).map((q) => q.op);
    this.books = applyOps(res.books, ops);
    this.warnings = res.warnings;
    this.lastSync = Date.now();
    await this.saveCacheNow();
    void this.translateMissing();
    void this.fillMissingCovers();
  }

  /** Reload everything from the sheet (pull to refresh / "Refresh" button). */
  async refresh() {
    if (this.refreshing || !this.spreadsheetId) return;
    if (!getValidToken()) {
      this.needsAuth = true;
      return;
    }
    this.refreshing = true;
    this.connectError = '';
    try {
      await this.flush();
      await this.reload();
    } catch (e) {
      if (e instanceof AuthRequiredError) this.needsAuth = true;
      else if (e instanceof LayoutChangedError) {
        this.booksSheetId = undefined;
        try {
          await this.reload();
        } catch (e2) {
          this.connectError = errorMessage(e2);
        }
      } else this.connectError = errorMessage(e);
    } finally {
      this.refreshing = false;
    }
  }

  // ---------- queries ----------

  findByIsbn(isbn13: string): Book | undefined {
    if (!isbn13) return undefined;
    return this.books.find((b) => b.isbn13 === isbn13);
  }

  findByBarcode(barcode: string): Book | undefined {
    if (!barcode) return undefined;
    return this.books.find((b) => sameBarcode(b.barcode, barcode));
  }

  /** A wishlist entry with the same title (e.g. "Series, Vol. 4" added from the series shelf). */
  findWishlistByTitle(title: string): Book | undefined {
    if (!title.trim()) return undefined;
    return this.books.find((b) => b.wishlist && b.title && sameVolumeTitle(b.title, title));
  }

  get(id: string): Book | undefined {
    return this.books.find((b) => b.id === id);
  }

  // ---------- changes ----------

  async add(book: Book): Promise<Book> {
    const b: Book = { ...$state.snapshot(book) as Book };
    b.id ||= newId();
    b.date_added ||= todayIso();
    b.needs_details = b.needs_details || !b.title;
    Object.assign(b, this.tidyTitle(b));
    // Appended like in the sheet, so "recently added" sorting matches after a reload.
    this.books = [...this.books, b];
    await this.enqueue({ kind: 'add', book: b });
    void this.translateMissing();
    return b;
  }

  /**
   * A new book's title in the library's own style:
   *  - "X = Y" parallel titles keep only X (the English title is translated from it);
   *  - a volume of a series you already have gets that series' name: "Quintessential
   *    Quintuplets 7" next to "The Quintessential Quintuplets, Vol. 1" becomes
   *    "The Quintessential Quintuplets, Vol. 7".
   */
  tidyTitle(b: Pick<Book, 'title' | 'title_en'>): Pick<Book, 'title' | 'title_en'> {
    // The English half of a parallel title is often incomplete, so it's translated properly instead.
    let title = splitParallelTitle(b.title).title;
    const title_en = b.title_en;
    const p = parseVolume(title);
    if (p && !p.to) {
      const groups = groupSeries(this.books);
      const key = seriesKey(p.base);
      // Same name, or your series' name plus an edition subtitle
      // ("Horimiya - Horisan ile Miyamurakun 2. Cilt" joins "Horimiya").
      const group =
        groups.get(key) ??
        [...groups.values()].filter((g) => g.confirmed && key.startsWith(`${g.key} `)).sort((a, b) => b.key.length - a.key.length)[0];
      if (group) title = formatVolume(group.name, p.volume);
    }
    return { title, title_en };
  }

  /** Books without a cover: look for one once per session, in the background, and save it to the sheet. */
  async fillMissingCovers() {
    if (this.fillingCovers) return;
    this.fillingCovers = true;
    try {
      for (;;) {
        const b = this.books.find((x) => !x.cover_url && (x.isbn13 || (x.title && !x.barcode)) && !this.coversTried.has(x.id));
        if (!b) break;
        this.coversTried.add(b.id);
        const cover = await findCover({ isbn13: b.isbn13, isbn10: b.isbn10, title: b.title, authors: b.authors });
        if (cover) await this.update(b.id, { cover_url: cover });
      }
    } finally {
      this.fillingCovers = false;
    }
  }

  /** Fill in English titles for books in other languages, one at a time in the background. */
  async translateMissing(retry = false) {
    if (retry) this.translateTried.clear();
    if (this.translating) return;
    this.translating = true;
    try {
      for (;;) {
        const b = this.books.find((x) => needsTranslation(x) && !this.translateTried.has(x.id));
        if (!b) break;
        this.translateTried.add(b.id);
        try {
          const en = await translateTitle(b.title, sourceLanguage(b.title, b.language)!);
          if (en) await this.update(b.id, { title_en: en });
        } catch {
          break; // offline or today's quota used up: the rest are done another time
        }
      }
    } finally {
      this.translating = false;
    }
  }

  async update(id: string, patch: Partial<Book>): Promise<void> {
    const i = this.books.findIndex((b) => b.id === id);
    if (i < 0) return;
    const before = $state.snapshot(this.books[i]) as Book;
    const after: Book = { ...before, ...($state.snapshot(patch) as Partial<Book>), id };
    if (after.title && after.needs_details && patch.needs_details === undefined && !before.title) after.needs_details = false;
    const fields = changedFields(before, after);
    if (!fields.length) return;
    this.books[i] = after;
    await this.enqueue({ kind: 'update', id, fields, book: after });
  }

  async remove(id: string): Promise<void> {
    if (!this.books.some((b) => b.id === id)) return;
    this.books = this.books.filter((b) => b.id !== id);
    await this.enqueue({ kind: 'delete', id });
  }

  async addCopy(id: string): Promise<void> {
    const b = this.get(id);
    if (b) await this.update(id, { copies: (b.copies || 1) + 1 });
  }

  private async enqueue(op: Op) {
    await db.addOp({ spreadsheetId: this.spreadsheetId, op, at: Date.now() });
    this.pending++;
    this.saveCacheSoon();
    this.scheduleFlush(FLUSH_DEBOUNCE);
  }

  private async updatePending() {
    this.pending = (await db.getOps(this.spreadsheetId || undefined)).length;
  }

  private saveCacheSoon() {
    clearTimeout(this.cacheTimer);
    this.cacheTimer = setTimeout(() => this.saveCacheNow(), 400);
  }

  private async saveCacheNow() {
    if (!this.spreadsheetId) return;
    await db.putLibrary({
      spreadsheetId: this.spreadsheetId,
      booksSheetId: this.booksSheetId,
      email: this.user?.email,
      books: $state.snapshot(this.books) as Book[],
      warnings: $state.snapshot(this.warnings) as string[],
      savedAt: this.lastSync || Date.now(),
    });
  }

  // ---------- outbox ----------

  scheduleFlush(delay: number) {
    clearTimeout(this.flushTimer);
    const wait = Math.max(delay, this.lastFlush + MIN_FLUSH_INTERVAL - Date.now(), this.retryDelay);
    this.flushTimer = setTimeout(() => this.flush(), Math.max(0, wait));
  }

  /** Retry after an error the user has seen. */
  retryNow() {
    this.hardErrors = 0;
    this.retryDelay = 0;
    this.syncError = '';
    this.scheduleFlush(0);
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.spreadsheetId || this.needsAuth || !this.online) return;
    if (this.booksSheetId === undefined) return;
    const run = async () => {
      this.flushing = true;
      try {
        const queued = await db.getOps(this.spreadsheetId);
        if (!queued.length) return;
        this.saving = true;
        const plan = coalesce(queued.map((q) => q.op));
        try {
          await writePlan(this.spreadsheetId, this.booksSheetId!, plan);
        } catch (e) {
          if (!(e instanceof LayoutChangedError)) throw e;
          // The Books tab was deleted or replaced: find/repair it, then try once more.
          const res = await loadLibrary(this.spreadsheetId);
          this.booksSheetId = res.booksSheetId;
          await writePlan(this.spreadsheetId, this.booksSheetId, plan);
        }
        await db.removeOps(queued.map((q) => q.seq!));
        this.lastFlush = Date.now();
        this.retryDelay = 0;
        this.hardErrors = 0;
        this.syncError = '';
        this.lastSync = Date.now();
        this.saveCacheSoon();
        await this.updatePending();
        if (this.pending) this.scheduleFlush(MIN_FLUSH_INTERVAL);
      } catch (e) {
        this.lastFlush = Date.now();
        if (e instanceof AuthRequiredError) {
          this.needsAuth = true;
        } else if (e instanceof OfflineError) {
          this.online = navigator.onLine;
          this.retryDelay = Math.min(60_000, Math.max(5000, this.retryDelay * 2));
          this.scheduleFlush(this.retryDelay);
        } else if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
          this.hardErrors++;
          this.syncError = `Couldn't save to your sheet: ${errorMessage(e)}`;
          // Try once more after a pause, then wait for the user to tap "Try again".
          if (this.hardErrors < 2) {
            this.retryDelay = 30_000;
            this.scheduleFlush(this.retryDelay);
          }
        } else {
          this.syncError = `Couldn't save yet, retrying… (${errorMessage(e)})`;
          this.retryDelay = Math.min(60_000, Math.max(2000, this.retryDelay * 2));
          this.scheduleFlush(this.retryDelay);
        }
      } finally {
        this.flushing = false;
        this.saving = false;
      }
    };
    // Only one tab at a time may write, or two tabs could append the same book twice.
    if (navigator.locks) await navigator.locks.request('book-library-flush', run);
    else await run();
  }

  async signOut() {
    authSignOut();
    await db.clearLibrary();
    this.books = [];
    this.spreadsheetId = '';
    this.booksSheetId = undefined;
    this.user = null;
    this.warnings = [];
    this.needsAuth = false;
    this.phase = 'welcome';
  }

  dismissWarnings() {
    this.warnings = [];
    this.saveCacheSoon();
  }
}

export const library = new Library();
