/**
 * Google sign-in with the Google Identity Services *token model*.
 *
 * - No refresh tokens exist in this model; an access token lives ~1 hour.
 * - The token is kept in localStorage until it expires so reopening the app
 *   within the hour doesn't need a tap. It only grants access to files this
 *   app created, and the app loads no third-party scripts besides Google's.
 * - Renewing needs a user tap (browsers block popups otherwise). Because the
 *   user already consented, Google usually closes the popup by itself.
 * - iPhone Home Screen apps handle popups badly, so there we use a full-page
 *   redirect instead (OAuth implicit flow, the same thing GIS does inside its popup).
 */
import { config, SCOPES } from '../config';

const TOKEN_KEY = 'bl.token';
const HINT_KEY = 'bl.loginHint';
const MODE_KEY = 'bl.authMode';
const REDIRECT_STATE_KEY = 'bl.oauthState';
const RETURN_ROUTE_KEY = 'bl.returnRoute';

export type AuthMode = 'popup' | 'redirect';

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

export class AuthRequiredError extends Error {
  constructor(message = 'Please reconnect to Google') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export class AuthCancelledError extends Error {
  constructor(message = 'Sign-in was cancelled') {
    super(message);
    this.name = 'AuthCancelledError';
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: fine, we just keep it in memory */
  }
}

let memoryToken: StoredToken | null = (() => {
  try {
    const raw = safeGet(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
})();

const listeners = new Set<() => void>();
export function onTokenChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setToken(t: StoredToken | null) {
  memoryToken = t;
  safeSet(TOKEN_KEY, t ? JSON.stringify(t) : null);
  listeners.forEach((fn) => fn());
}

/** A token valid for at least `minValidityMs`, or null. */
export function getValidToken(minValidityMs = 60_000): string | null {
  if (!memoryToken) return null;
  if (memoryToken.expiresAt - Date.now() < minValidityMs) return null;
  return memoryToken.accessToken;
}

export function tokenExpiresAt(): number {
  return memoryToken?.expiresAt ?? 0;
}

/** Called by the API layer on a 401. */
export function invalidateToken() {
  setToken(null);
}

export function hasSignedInBefore(): boolean {
  return safeGet(HINT_KEY) !== null;
}

export function setLoginHint(email: string) {
  safeSet(HINT_KEY, email || '');
}

export function isIosStandalone(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  return ios && standalone;
}

export function getAuthMode(): AuthMode {
  const m = safeGet(MODE_KEY);
  if (m === 'popup' || m === 'redirect') return m;
  return isIosStandalone() ? 'redirect' : 'popup';
}

export function setAuthMode(mode: AuthMode | null) {
  safeSet(MODE_KEY, mode);
}

// ---------- popup (GIS) ----------

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (typeof google !== 'undefined' && google.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error("Couldn't reach Google. Check your internet connection."));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

/** Load GIS early so the sign-in tap can open the popup synchronously. */
export function preloadAuth() {
  if (getAuthMode() === 'popup' && config.clientId) loadGis().catch(() => {});
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

function grantedAll(scope: string): boolean {
  const granted = new Set(scope.split(/\s+/));
  return SCOPES.every((s) => granted.has(s));
}

function ensureTokenClient(): google.accounts.oauth2.TokenClient {
  if (tokenClient) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: config.clientId,
    scope: SCOPES.join(' '),
    include_granted_scopes: true,
    callback: (resp) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (resp.error) return p.reject(new AuthCancelledError(resp.error_description || resp.error));
      if (!grantedAll(resp.scope)) {
        return p.reject(
          new AuthCancelledError('Please tick both boxes on the Google screen, so the app can keep your library in your own Google Drive.'),
        );
      }
      setToken({ accessToken: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in) * 1000 });
      p.resolve(resp.access_token);
    },
    error_callback: (err) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (err.type === 'popup_failed_to_open') {
        p.reject(new AuthCancelledError('Your browser blocked the Google window. Allow pop-ups for this site and try again.'));
      } else if (err.type === 'popup_closed') {
        p.reject(new AuthCancelledError('The Google window was closed before sign-in finished.'));
      } else {
        p.reject(new AuthCancelledError(err.message || 'Sign-in failed.'));
      }
    },
  });
  return tokenClient;
}

/**
 * Get a fresh token. MUST be called from a tap/click handler.
 * In redirect mode this navigates away and the promise never resolves.
 */
export async function requestToken(opts: { switchAccount?: boolean } = {}): Promise<string> {
  if (!config.clientId) throw new Error('The app has no Google client ID yet (see docs/google-setup.md).');
  if (getAuthMode() === 'redirect') {
    startRedirect(opts.switchAccount ? 'select_account' : undefined);
    return new Promise<string>(() => {});
  }
  await loadGis();
  const client = ensureTokenClient();
  pending?.reject(new AuthCancelledError('Replaced by a newer sign-in'));
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    const hint = safeGet(HINT_KEY) || undefined;
    client.requestAccessToken({
      prompt: opts.switchAccount ? 'select_account' : '',
      login_hint: opts.switchAccount ? undefined : hint,
    });
  });
}

// ---------- redirect ----------

function redirectUri(): string {
  return location.origin + location.pathname;
}

function startRedirect(prompt?: string) {
  const state = crypto.getRandomValues(new Uint32Array(4)).join('-');
  safeSet(REDIRECT_STATE_KEY, state);
  safeSet(RETURN_ROUTE_KEY, location.hash || '#/');
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
  });
  const hint = safeGet(HINT_KEY);
  if (prompt) params.set('prompt', prompt);
  else if (hint) params.set('login_hint', hint);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/**
 * Call once at startup, before the router reads location.hash.
 * Returns an error message if the redirect came back with an error.
 */
export function handleRedirectReturn(): { handled: boolean; error?: string } {
  const h = location.hash;
  if (!/[#&](access_token|error)=/.test(h)) return { handled: false };
  const params = new URLSearchParams(h.slice(1));
  const expected = safeGet(REDIRECT_STATE_KEY);
  const back = safeGet(RETURN_ROUTE_KEY) || '#/';
  safeSet(REDIRECT_STATE_KEY, null);
  safeSet(RETURN_ROUTE_KEY, null);
  history.replaceState(null, '', location.pathname + location.search + back);
  if (!expected || params.get('state') !== expected) return { handled: true, error: 'Sign-in could not be verified. Please try again.' };
  const err = params.get('error');
  if (err) return { handled: true, error: err === 'access_denied' ? 'Sign-in was cancelled.' : `Sign-in failed (${err}).` };
  const scope = params.get('scope') ?? '';
  if (!grantedAll(scope)) {
    return { handled: true, error: 'Please tick both boxes on the Google screen, so the app can keep your library in your own Google Drive.' };
  }
  setToken({
    accessToken: params.get('access_token')!,
    expiresAt: Date.now() + Number(params.get('expires_in') || 3600) * 1000,
  });
  return { handled: true };
}

export function signOut() {
  const t = memoryToken?.accessToken;
  setToken(null);
  safeSet(HINT_KEY, null);
  if (t && typeof google !== 'undefined' && google.accounts?.oauth2) {
    try {
      google.accounts.oauth2.revoke(t);
    } catch {
      /* ignore */
    }
  }
}
