/** Tiny hash router (GitHub Pages has no server-side routing). */
export interface Route {
  name: 'library' | 'add' | 'book' | 'edit' | 'new' | 'stats' | 'more' | 'import' | 'notfound';
  params: Record<string, string>;
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = new URLSearchParams(qs);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  if (!a) return { name: 'library', params: {}, query };
  if (a === 'add' && !b) return { name: 'add', params: {}, query };
  if (a === 'new' && !b) return { name: 'new', params: {}, query };
  if (a === 'book' && b && !c) return { name: 'book', params: { id: b }, query };
  if (a === 'book' && b && c === 'edit') return { name: 'edit', params: { id: b }, query };
  if (a === 'stats') return { name: 'stats', params: {}, query };
  if (a === 'more') return { name: 'more', params: {}, query };
  if (a === 'import') return { name: 'import', params: {}, query };
  return { name: 'notfound', params: {}, query };
}

class Router {
  route = $state<Route>(parse());
  constructor() {
    if (typeof window !== 'undefined') {
      addEventListener('hashchange', () => {
        this.route = parse();
        window.scrollTo(0, 0);
      });
    }
  }
  /** Re-read the hash (after the OAuth redirect handler rewrote it). */
  sync() {
    this.route = parse();
  }
}

export const router = new Router();

export function go(path: string, opts: { replace?: boolean } = {}) {
  const hash = '#' + path;
  if (opts.replace) {
    history.replaceState(null, '', hash);
    router.sync();
  } else location.hash = path;
}

export function back(fallback = '/') {
  if (history.length > 1) history.back();
  else go(fallback);
}
