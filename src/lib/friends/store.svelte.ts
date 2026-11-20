/** State for the Friends tab: your sharing settings, your friend list, and loaded friends' libraries. */
import { AuthRequiredError } from '../auth/google';
import { library } from '../store/library.svelte';
import { todayIso } from '../types';
import { NotSharedError, readSharedLibrary, type SharedLibrary } from './publicRead';
import {
  codeFromInput,
  isShared,
  metaValue,
  readFriends,
  readMeta,
  startSharing,
  stopSharing,
  writeFriends,
  writeMetaValue,
  type Friend,
} from './sharing';

function message(e: unknown): string {
  if (e instanceof AuthRequiredError) return 'Your Google connection timed out. Tap Reconnect at the top, then try again.';
  return (e as Error)?.message || String(e);
}

class Friends {
  loaded = $state(false);
  loading = $state(false);
  error = $state('');
  sharing = $state(false);
  displayName = $state('');
  friends = $state<Friend[]>([]);
  libraries = $state<Record<string, SharedLibrary>>({});
  libraryErrors = $state<Record<string, string>>({});
  busy = $state(false);

  get myCode() {
    return library.spreadsheetId;
  }

  async load(force = false) {
    if (!library.spreadsheetId || this.loading || (this.loaded && !force)) return;
    this.loading = true;
    this.error = '';
    try {
      const [shared, meta, friends] = await Promise.all([isShared(library.spreadsheetId), readMeta(library.spreadsheetId), readFriends(library.spreadsheetId)]);
      this.sharing = shared;
      this.displayName = metaValue(meta, 'display_name');
      this.friends = friends;
      this.loaded = true;
    } catch (e) {
      this.error = message(e);
    } finally {
      this.loading = false;
    }
  }

  private async act(fn: () => Promise<void>) {
    this.busy = true;
    this.error = '';
    try {
      await fn();
    } catch (e) {
      this.error = message(e);
    } finally {
      this.busy = false;
    }
  }

  share(name: string) {
    return this.act(async () => {
      await writeMetaValue(library.spreadsheetId, 'display_name', name.trim());
      this.displayName = name.trim();
      await startSharing(library.spreadsheetId);
      this.sharing = true;
    });
  }

  rename(name: string) {
    return this.act(async () => {
      await writeMetaValue(library.spreadsheetId, 'display_name', name.trim());
      this.displayName = name.trim();
    });
  }

  unshare() {
    return this.act(async () => {
      await stopSharing(library.spreadsheetId);
      this.sharing = false;
    });
  }

  /** Load a friend's library (API key, no sign-in needed). */
  async open(code: string, force = false): Promise<SharedLibrary | null> {
    if (!force && this.libraries[code] && Date.now() - this.libraries[code].loadedAt < 5 * 60_000) return this.libraries[code];
    try {
      const lib = await readSharedLibrary(code);
      this.libraries[code] = lib;
      delete this.libraryErrors[code];
      // Keep the saved name up to date if they renamed themselves.
      const f = this.friends.find((x) => x.code === code);
      if (f && lib.name && f.name !== lib.name) {
        f.name = lib.name;
        writeFriends(library.spreadsheetId, $state.snapshot(this.friends) as Friend[]).catch(() => {});
      }
      return lib;
    } catch (e) {
      this.libraryErrors[code] = e instanceof NotSharedError ? e.message : message(e);
      return null;
    }
  }

  /** Check a code before adding it: returns the library (for its name) or an error message. */
  async preview(input: string): Promise<{ lib?: SharedLibrary; error?: string }> {
    const code = codeFromInput(input);
    if (!code) return { error: "That doesn't look like a friend code or link." };
    if (code === library.spreadsheetId) return { error: "That's your own library." };
    const lib = await this.open(code, true);
    return lib ? { lib } : { error: this.libraryErrors[code] };
  }

  add(lib: SharedLibrary) {
    return this.act(async () => {
      if (this.friends.some((f) => f.code === lib.code)) return;
      const next = [...($state.snapshot(this.friends) as Friend[]), { code: lib.code, name: lib.name || '?', added: todayIso() }];
      await writeFriends(library.spreadsheetId, next);
      this.friends = next;
    });
  }

  remove(code: string) {
    return this.act(async () => {
      const next = ($state.snapshot(this.friends) as Friend[]).filter((f) => f.code !== code);
      await writeFriends(library.spreadsheetId, next);
      this.friends = next;
      delete this.libraries[code];
    });
  }
}

export const friends = new Friends();
