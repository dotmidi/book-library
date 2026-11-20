<script lang="ts">
  import Cover from './Cover.svelte';
  import BulkBar from './BulkBar.svelte';
  import { t } from '../lib/strings';
  import { displayTitle, fold, matchesQuery, sortKeyAuthor, uniqueSorted } from '../lib/search';
  import { locationFlag } from '../lib/countries';
  import type { Book } from '../lib/types';

  let {
    books,
    readonly = false,
    bookHref,
    storagePrefix = 'bl',
    heading,
  }: {
    books: Book[];
    readonly?: boolean;
    bookHref: (b: Book) => string;
    storagePrefix?: string;
    heading: string;
  } = $props();

  type Sort = 'recent' | 'title' | 'author' | 'year';
  type View = 'grid' | 'list';
  type Shelf = 'owned' | 'wishlist';
  const NONE = '__none';

  function load<T extends string>(key: string, fallback: T, local = false): T {
    try {
      return ((local ? localStorage : sessionStorage).getItem(`${storagePrefix}.${key}`) as T) || fallback;
    } catch {
      return fallback;
    }
  }
  function persist(key: string, value: string, local = false) {
    try {
      (local ? localStorage : sessionStorage).setItem(`${storagePrefix}.${key}`, value);
    } catch {
      /* ignore */
    }
  }

  // Filters live in sessionStorage so they survive opening a book and coming back.
  let query = $state(load<string>('q', ''));
  let location = $state(load<string>('loc', ''));
  let category = $state(load<string>('cat', ''));
  let tag = $state(load<string>('tag', ''));
  let shelf = $state<Shelf>(load<Shelf>('shelf', 'owned'));
  let sort = $state<Sort>(load<Sort>('sort', 'recent', true));
  let view = $state<View>(load<View>('view', 'grid', true));
  let limit = $state(120);

  // Select mode (bulk edit)
  let selecting = $state(false);
  let selected = $state<Record<string, true>>({});
  const selectedIds = $derived(Object.keys(selected));

  $effect(() => {
    persist('q', query);
    persist('loc', location);
    persist('cat', category);
    persist('tag', tag);
    persist('shelf', shelf);
    persist('sort', sort, true);
    persist('view', view, true);
  });

  const owned = $derived(books.filter((b) => !b.wishlist));
  const wished = $derived(books.filter((b) => b.wishlist));
  const shelfBooks = $derived(shelf === 'wishlist' ? wished : owned);
  const locations = $derived(uniqueSorted(shelfBooks.map((b) => b.location)));
  const categories = $derived(uniqueSorted(shelfBooks.map((b) => b.category)));
  const tags = $derived(uniqueSorted(shelfBooks.flatMap((b) => b.tags)));
  const filtersOn = $derived(Boolean(query || location || category || tag));

  const filtered = $derived.by(() => {
    const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const out = shelfBooks.filter(
      (b) =>
        matchesQuery(b, query) &&
        (!location || (location === NONE ? !b.location : eq(b.location, location))) &&
        (!category || (category === NONE ? !b.category : eq(b.category, category))) &&
        (!tag || b.tags.some((x) => eq(x, tag))),
    );
    const cmp: Record<Sort, (a: Book, b: Book) => number> = {
      recent: (a, b) => (b.date_added || '').localeCompare(a.date_added || ''),
      title: (a, b) => fold(a.title).localeCompare(fold(b.title), undefined, { numeric: true }),
      author: (a, b) => sortKeyAuthor(a).localeCompare(sortKeyAuthor(b)) || fold(a.title).localeCompare(fold(b.title), undefined, { numeric: true }),
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
    category = '';
    tag = '';
  }

  function toggle(id: string) {
    if (selected[id]) delete selected[id];
    else selected[id] = true;
  }
  function selectAllShown() {
    const all = filtered.every((b) => selected[b.id]);
    selected = all ? {} : Object.fromEntries(filtered.map((b) => [b.id, true as const]));
  }
  function stopSelecting() {
    selecting = false;
    selected = {};
  }
</script>

<div class="page" class:with-bar={selecting}>
  <div class="head">
    <h1>{heading}</h1>
    {#if !readonly && books.length}
      <button class="small" onclick={() => (selecting ? stopSelecting() : (selecting = true))}>{selecting ? t.done : t.select}</button>
    {/if}
  </div>

  <div class="shelves" role="tablist">
    <button role="tab" aria-selected={shelf === 'owned'} class:active={shelf === 'owned'} onclick={() => ((shelf = 'owned'), (selected = {}))}>
      {t.myBooks} <span class="count">{owned.length}</span>
    </button>
    <button role="tab" aria-selected={shelf === 'wishlist'} class:active={shelf === 'wishlist'} onclick={() => ((shelf = 'wishlist'), (selected = {}))}>
      {t.wishlist} <span class="count">{wished.length}</span>
    </button>
  </div>

  {#if shelfBooks.length === 0}
    <div class="empty card">
      {#if shelf === 'wishlist'}
        <p class="muted">{readonly ? t.friendEmptyWishlist : t.emptyWishlist}</p>
      {:else if readonly}
        <p class="muted">{t.friendEmptyLibrary}</p>
      {:else}
        <h2>{t.emptyLibraryTitle}</h2>
        <p class="muted">{t.emptyLibraryBody}</p>
        <a class="button primary" href="#/add">{t.addFirstBook}</a>
      {/if}
    </div>
  {:else}
    <div class="search">
      <label class="visually-hidden" for="{storagePrefix}-q">{t.searchPlaceholder}</label>
      <input id="{storagePrefix}-q" type="search" bind:value={query} placeholder={t.searchPlaceholder} autocomplete="off" enterkeyhint="search" />
    </div>

    <div class="filters">
      {#if locations.length}
        <select bind:value={location} aria-label={t.fieldLabels.location}>
          <option value="">{t.allLocations}</option>
          {#each locations as l}<option value={l}>{locationFlag(l) ? `${locationFlag(l)} ` : ''}{l}</option>{/each}
          <option value={NONE}>{t.noLocation}</option>
        </select>
      {/if}
      {#if categories.length}
        <select bind:value={category} aria-label={t.fieldLabels.category}>
          <option value="">{t.allCategories}</option>
          {#each categories as c}<option value={c}>{c}</option>{/each}
          <option value={NONE}>{t.noCategory}</option>
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

    <p class="muted small count-line">
      {filtersOn ? t.shownOf(filtered.length, shelfBooks.length) : t.bookCount(shelfBooks.length)}
      {#if selecting}
        · <button class="linkbtn" onclick={selectAllShown}>{filtered.every((b) => selected[b.id]) ? t.selectNone : t.selectAllShown}</button>
      {/if}
    </p>

    {#snippet badges(b: Book, long: boolean)}
      {#if long && b.location}<span class="chip">{locationFlag(b.location)} {b.location}</span>{/if}
      {#if b.category}<span class="chip">{b.category}</span>{/if}
      {#if b.lent_to}<span class="chip lent">{long ? t.lentTo(b.lent_to, '') : t.lentOut}</span>{/if}
      {#if b.needs_details || !b.title}<span class="chip warn">{t.needsDetailsBadge}</span>{/if}
      {#if b.copies > 1}<span class="chip">×{b.copies}</span>{/if}
    {/snippet}

    {#if filtered.length === 0}
      <p class="muted">{t.noMatches}</p>
    {:else if view === 'grid'}
      <ul class="grid">
        {#each visible as b (b.id)}
          <li>
            {#if selecting}
              <button class="tile selectable" class:sel={selected[b.id]} aria-pressed={!!selected[b.id]} onclick={() => toggle(b.id)}>
                <span class="check" aria-hidden="true">{selected[b.id] ? '✓' : ''}</span>
                <Cover book={b} />
                <span class="ttitle">{locationFlag(b.location)} {displayTitle(b, t.untitled)}</span>
              </button>
            {:else}
              <a href={bookHref(b)} class="tile">
                <Cover book={b} />
                <span class="ttitle">{#if locationFlag(b.location)}<span class="flag">{locationFlag(b.location)}</span> {/if}{displayTitle(b, t.untitled)}</span>
                {#if b.authors.length}<span class="tauthor muted">{b.authors[0]}</span>{/if}
                <span class="badges">{@render badges(b, false)}</span>
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
      <ul class="list">
        {#each visible as b (b.id)}
          <li>
            {#if selecting}
              <button class="lrow selectable" class:sel={selected[b.id]} aria-pressed={!!selected[b.id]} onclick={() => toggle(b.id)}>
                <span class="check inline" aria-hidden="true">{selected[b.id] ? '✓' : ''}</span>
                <Cover book={b} size="sm" />
                <span class="linfo"><strong>{displayTitle(b, t.untitled)}</strong><span class="badges">{@render badges(b, true)}</span></span>
              </button>
            {:else}
              <a href={bookHref(b)} class="lrow">
                <Cover book={b} size="sm" />
                <span class="linfo">
                  <strong>{displayTitle(b, t.untitled)}</strong>
                  <span class="muted small">{[b.authors.join(', '), b.year].filter(Boolean).join(' · ')}</span>
                  <span class="badges">{@render badges(b, true)}</span>
                </span>
              </a>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if filtered.length > limit}
      <button class="wide" onclick={() => (limit += 200)}>{t.showMore} ({filtered.length - limit})</button>
    {/if}
  {/if}
</div>

{#if selecting}
  <BulkBar ids={selectedIds} {shelf} ondone={stopSelecting} />
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .head h1 {
    margin: 0;
  }
  .shelves {
    display: inline-flex;
    margin: 0.75rem 0 0.25rem;
    background: var(--surface-2);
    border-radius: 999px;
    padding: 3px;
  }
  .shelves button {
    border: 0;
    background: transparent;
    min-height: 36px;
    padding: 0.25rem 1rem;
    font-size: 0.92rem;
  }
  .shelves button.active {
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .count {
    color: var(--muted);
    font-weight: 500;
    margin-left: 0.2rem;
  }
  .empty {
    text-align: center;
    padding: 2rem 1rem;
    margin-top: 1rem;
  }
  .search {
    margin: 0.6rem 0;
  }
  .filters {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
    margin-bottom: 0.4rem;
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
  .count-line {
    margin: 0 0 0.8rem;
  }
  .linkbtn {
    border: 0;
    background: none;
    padding: 0;
    min-height: 0;
    color: var(--primary);
    font-weight: 600;
    font-size: inherit;
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
    position: relative;
  }
  button.tile,
  button.lrow {
    border: 0;
    background: none;
    padding: 0;
    min-height: 0;
    width: 100%;
    text-align: left;
    align-items: stretch;
    justify-content: flex-start;
    font-weight: inherit;
    border-radius: 8px;
  }
  .selectable.sel {
    outline: 3px solid var(--primary);
    outline-offset: 2px;
  }
  .check {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 2;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: rgb(255 255 255 / 0.9);
    border: 2px solid var(--primary);
    color: var(--primary);
    font-weight: 800;
  }
  .check.inline {
    position: static;
    flex-shrink: 0;
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
  button.lrow {
    align-items: center;
    padding: 0.6rem 0.25rem;
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
  .page.with-bar {
    padding-bottom: calc(var(--nav-h) + var(--safe-bottom) + 9rem);
  }
</style>
