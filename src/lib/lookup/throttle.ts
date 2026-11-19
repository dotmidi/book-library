import { HttpError, sleep } from './provider';

/**
 * Serialises requests so at most one starts every `intervalMs`, and retries
 * 429 / 5xx responses with exponential backoff (honouring Retry-After).
 */
export class Throttle {
  private last = -Infinity;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private intervalMs: number,
    private maxRetries = 3,
    private now: () => number = () => Date.now(),
    private wait: (ms: number, signal?: AbortSignal) => Promise<void> = sleep,
  ) {}

  /** Wait for a free slot, then run fn. */
  schedule<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const run = async () => {
      const delay = this.last + this.intervalMs - this.now();
      if (delay > 0) await this.wait(delay, signal);
      this.last = this.now();
      return fn();
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** fetch() through the throttle with retries. Returns the Response for 2xx and 404. */
  async fetch(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.schedule(() => fetch(url, { ...init, signal }), signal);
      if (res.ok || res.status === 404) return res;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= this.maxRetries) {
        throw new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).hostname}`);
      }
      const retryAfter = Number(res.headers.get('Retry-After'));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await this.wait(Math.min(backoff, 30_000), signal);
    }
  }
}
