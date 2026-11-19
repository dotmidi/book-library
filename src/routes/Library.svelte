<script lang="ts">
  import Cover from '../components/Cover.svelte';
  import { library } from '../lib/store/library.svelte';
  import { t } from '../lib/strings';
  import { displayTitle, fold, matchesQuery, sortKeyAuthor, uniqueSorted } from '../lib/search';
  import type { Book } from '../lib/types';

  type Sort = 'recent' | 'title' | 'author' | 'year';
  type View = 'grid' | 'list';

  function load<T extends string>(key: string, fallback: T): T {
    try {
      return (sessionStorage.getItem(key) as T) || (localStorage.getItem(key) as T) || fallback;
    } catch {
      return fallback;
    }
  }
  function persist(key: string, value: string, local = false) {
    try {
      (local ? localStorage : sessionStorage).setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  // Filters live in sessionStorage so they survive opening a book and coming back.
  let query = $state(load<string>('bl.q', ''));
  let location = $state(load<string>('bl.loc', ''));
  let tag = $state(load<string>('bl.tag', ''));
  let sort = $state<Sort>(load('bl.sort', 'recent'));
  let view = $state<View>(load('bl.view', 'grid'));
  let limit = $state(120);

  $effect(() => {
    persist('bl.q', query);
    persist('bl.loc', location);
    persist('bl.tag', tag);
    persist('bl.sort', sort, true);
    persist('bl.view', view, true);
  });

  const locations = $derived(uniqueSorted(library.books.map((b) => b.location)));
  const tags = $derived(uniqueSorted(library.books.flatMap((b) => b.tags)));
  const filtersOn = $derived(Boolean(query || location || tag));

  const filtered = $derived.by(() => {
    const out = library.books.filter(
      (b) =>
        matchesQuery(b, query) &&
        (!location || b.location.toLowerCase() === location.toLowerCase()) &&
        (!tag || b.tags.some((x) => x.toLowerCase() === tag.toLowerCase())),
    );
    const cmp: Record<Sort, (a: Book, b: Book) => number> = {
      recent: (a, b) => (b.date_added || '').localeCompare(a.date_added || ''),
      title: (a, b) => fold(a.title).localeCompare(fold(b.title)),
      author: (a, b) => sortKeyAuthor(a).localeCompare(sortKeyAuthor(b)) || fold(a.title).localeCompare(fold(b.title)),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
    };
    // Stable sort keeps sheet order (newest appended last → reversed for "recent").
    const base = sort === 'recent' ? [...out].reverse() : out;
    return [...base].sort(cmp[sort]);
  });
  const visible = $derived(filtered.slice(0, limit));

  function clear() {
    query = '';
    location = '';
    tag = '';
  }
</script>

<div class="page">
  {#if library.books.length === 0}
    <div class="empty card">
      <h1>{t.emptyLibraryTitle}</h1>
      <p class="muted">{t.emptyLibraryBody}</p>
      <a class="button primary" href="#/add">{t.addFirstBook}</a>
    </div>
  {:else}
    <div class="head">
      <h1>{t.libraryTitle}</h1>
      <span class="muted small">{filtersOn ? t.shownOf(filtered.length, library.books.length) : t.bookCount(library.books.length)}</span>
    </div>

    <div class="search">
      <label class="visually-hidden" for="q">{t.searchPlaceholder}</label>
      <input id="q" type="search" bind:value={query} placeholder={t.searchPlaceholder} autocomplete="off" enterkeyhint="search" />
    </div>

    <div class="filters">
      {#if locations.length}
        <select bind:value={location} aria-label={t.fieldLabels.location}>
          <option value="">{t.allLocations}</option>
          {#each locations as l}<option value={l}>{l}</option>{/each}
        </select>
      {/if}
      {#if tags.length}
        <select bind:value={tag} aria-label={t.fieldLabels.tags}>
          <option value="">{t.allTags}</option>
          {#each tags as tg}<option value={tg}>{tg}</option>{/each}
        </select>
      {/if}
      <select bind:value={sort} aria-label="Sort">
        <option value="recent">{t.sortRecent}</option>
        <option value="title">{t.sortTitle}</option>
        <option value="author">{t.sortAuthor}</option>
        <option value="year">{t.sortYear}</option>
      </select>
      <div class="viewtoggle" role="group" aria-label="View">
        <button class="small" class:active={view === 'grid'} aria-pressed={view === 'grid'} onclick={() => (view = 'grid')}>{t.gridView}</button>
        <button class="small" class:active={view === 'list'} aria-pressed={view === 'list'} onclick={() => (view = 'list')}>{t.listView}</button>
      </div>
      {#if filtersOn}<button class="small ghost" onclick={clear}>{t.clearFilters}</button>{/if}
    </div>

    {#if filtered.length === 0}
      <p class="muted">{t.noMatches}</p>
    {:else if view === 'grid'}
      <ul class="grid">
        {#each visible as b (b.id)}
          <li>
            <a href="#/book/{b.id}" class="tile">
              <Cover book={b} />
              <span class="ttitle">{displayTitle(b, t.untitled)}</span>
              {#if b.authors.length}<span class="tauthor muted">{b.authors[0]}</span>{/if}
              <span class="badges">
                {#if b.lent_to}<span class="chip lent">{t.lentOut}</span>{/if}
                {#if b.needs_details || !b.title}<span class="chip warn">{t.needsDetailsBadge}</span>{/if}
                {#if b.copies > 1}<span class="chip">×{b.copies}</span>{/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <ul class="list">
        {#each visible as b (b.id)}
          <li>
            <a href="#/book/{b.id}" class="lrow">
              <Cover book={b} size="sm" />
              <span class="linfo">
                <strong>{displayTitle(b, t.untitled)}</strong>
                <span class="muted small">{[b.authors.join(', '), b.year].filter(Boolean).join(' · ')}</span>
                <span class="badges">
                  {#if b.location}<span class="chip">{b.location}</span>{/if}
                  {#if b.lent_to}<span class="chip lent">{t.lentTo(b.lent_to, '')}</span>{/if}
                  {#if b.needs_details || !b.title}<span class="chip warn">{t.needsDetailsBadge}</span>{/if}
                  {#if b.copies > 1}<span class="chip">×{b.copies}</span>{/if}
                </span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
    {#if filtered.length > limit}
      <button class="wide" onclick={() => (limit += 200)}>{t.showMore} ({filtered.length - limit})</button>
    {/if}
    <div class="refresh">
      <button class="small ghost" onclick={() => library.refresh()} disabled={library.refreshing}>
        {library.refreshing ? '…' : '↻'} {t.refresh}
      </button>
    </div>
  {/if}
</div>

<style>
  .empty {
    text-align: center;
    padding: 2.5rem 1rem;
    margin-top: 1rem;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .search {
    margin: 0.5rem 0 0.6rem;
  }
  .filters {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
    margin-bottom: 0.9rem;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .filters select {
    width: auto;
    min-height: 38px;
    padding: 0.3rem 0.6rem;
    font-size: 0.9rem;
    flex-shrink: 0;
    max-width: 11rem;
  }
  .viewtoggle {
    display: flex;
    flex-shrink: 0;
  }
  .viewtoggle button {
    border-radius: 0;
    min-height: 38px;
  }
  .viewtoggle button:first-child {
    border-radius: 999px 0 0 999px;
  }
  .viewtoggle button:last-child {
    border-radius: 0 999px 999px 0;
    border-left: 0;
  }
  .viewtoggle .active {
    background: var(--primary-soft);
    color: var(--primary);
  }
  .filters .ghost {
    flex-shrink: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 1rem 0.75rem;
  }
  @media (min-width: 800px) {
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    }
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    color: inherit;
    text-decoration: none;
  }
  .ttitle {
    font-weight: 600;
    font-size: 0.88rem;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .tauthor {
    font-size: 0.78rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .badges:empty {
    display: none;
  }
  .list li + li {
    border-top: 1px solid var(--border);
  }
  .lrow {
    display: flex;
    gap: 0.8rem;
    padding: 0.6rem 0;
    color: inherit;
    text-decoration: none;
    align-items: center;
  }
  .linfo {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .linfo strong {
    overflow-wrap: anywhere;
  }
  .refresh {
    text-align: center;
    margin-top: 1.5rem;
  }
</style>
