/**
 * Thin fetch wrapper for Google REST APIs: adds the token, retries rate limits
 * and server errors, and turns a 401 into AuthRequiredError.
 */
import { AuthRequiredError, getValidToken, invalidateToken } from '../auth/google';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public reason?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class OfflineError extends Error {
  constructor() {
    super("You're offline. Changes will be saved when you're back online.");
    this.name = 'OfflineError';
  }
}

const RETRYABLE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'backendError', 'internalError']);

export interface ApiInit {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  /** Return raw text instead of JSON. */
  text?: boolean;
}

export async function gapi<T = unknown>(url: string, init: ApiInit = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const token = getValidToken(30_000);
    if (!token) throw new AuthRequiredError();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) };
    let body = init.body;
    if (init.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.json);
    }
    let res: Response;
    try {
      res = await fetch(url, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body });
    } catch {
      if (!navigator.onLine) throw new OfflineError();
      if (attempt < 2) {
        await wait(1000 * 2 ** attempt);
        continue;
      }
      throw new OfflineError();
    }
    if (res.ok) {
      if (res.status === 204) return undefined as T;
      return (init.text ? await res.text() : await res.json()) as T;
    }
    if (res.status === 401) {
      invalidateToken();
      throw new AuthRequiredError();
    }
    let message = `Google returned an error (${res.status}).`;
    let reason: string | undefined;
    try {
      const j = await res.json();
      message = j?.error?.message ?? message;
      reason = j?.error?.errors?.[0]?.reason ?? j?.error?.status;
    } catch {
      /* not json */
    }
    const retryable = res.status === 429 || res.status >= 500 || (res.status === 403 && reason && RETRYABLE_REASONS.has(reason));
    if (retryable && attempt < 5) {
      const ra = Number(res.headers.get('Retry-After'));
      await wait(Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(32_000, 1000 * 2 ** attempt + Math.random() * 500));
      continue;
    }
    throw new ApiError(res.status, message, reason);
  }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
