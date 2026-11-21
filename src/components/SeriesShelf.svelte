<script lang="ts">
  import Cover from './Cover.svelte';
  import { library } from '../lib/store/library.svelte';
  import { isNovel, seriesKey, seriesOf } from '../lib/series';
  import { STATUS_LABEL, pickCandidate, seriesFacts, type SeriesFacts } from '../lib/lookup/seriesInfo';
  import { bookSeries, type BookSeries } from '../lib/lookup/bookSeries';
  import { formatVolume } from '../lib/volume';
  import { toast } from '../lib/toast.svelte';
  import { t } from '../lib/strings';
  import { emptyBook, todayIso, type Book } from '../lib/types';

  let {
    book,
    books,
    readonly = false,
    bookHref,
  }: { book: Book; books: Book[]; readonly?: boolean; bookHref: (b: Book) => string } = $props();

  const found = $derived(seriesOf(book, books));
  const group = $derived(found?.group);
  let facts = $state<SeriesFacts | null>(null);
  let loading = $state(false);
  let busy = $state(false);
  /** Open Library's series, for books without a volume number in the title. */
  let olSeries = $state<BookSeries | null>(null);
  const useOpenLibrary = $derived(!found && !!book.isbn13);

  $effect(() => {
    if (!useOpenLibrary) return;
    let cancelled = false;
    bookSeries(book.isbn13).then((s) => !cancelled && (olSeries = s));
    return () => (cancelled = true);
  });

  /** Light novel or manga: the books in the series decide (category, publisher imprint, title note). */
  const preferNovel = $derived([...(group?.volumes.values() ?? [])].flat().some((b) => isNovel(b)));

  /** The series' author: the first author most of its volumes share. */
  const author = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const b of [...(group?.volumes.values() ?? [])].flat()) if (b.authors[0]) counts.set(b.authors[0], (counts.get(b.authors[0]) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  });

  // Load series facts (AniList + Google Books) for this series.
  $effect(() => {
    const g = group;
    if (!g) return;
    const lang = book.language || 'English';
    const who = author;
    const kind = preferNovel ? 'novel' : 'manga';
    loading = true;
    let cancelled = false;
    seriesFacts(g.name, lang, who, kind)
      .then((f) => !cancelled && (facts = f))
      .finally(() => !cancelled && (loading = false));
    return () => (cancelled = true);
  });

  const candidate = $derived.by(() => {
    if (!facts || !group) return null;
    return pickCandidate(facts.candidates, group.name, preferNovel, author);
  });
  const englishVolumes = $derived(new Map(facts?.volumes ?? []));

  // A lone "Title 2" is only shown once AniList knows a series by that name,
  // or Google Books has several of its volumes (so "Apollo 13" stays a book).
  const visible = $derived.by(() => {
    if (useOpenLibrary) return !!olSeries;
    if (!group) return false;
    if (group.confirmed) return true;
    if (!facts) return false;
    if (facts.candidates.some((c) => seriesKey(c.title) === group.key)) return true;
    return new Set([...group.volumes.keys(), ...englishVolumes.keys()]).size >= 3;
  });

  const ownedNumbers = $derived(group ? [...group.volumes.keys()] : []);
  const highestKnown = $derived(Math.max(0, ...ownedNumbers, ...englishVolumes.keys()));
  // AniList's total for finished series; otherwise as far as volumes are known (incl. announced ones).
  const total = $derived(candidate?.volumes ?? null);
  const shownCount = $derived(Math.max(total ?? 0, highestKnown));

  interface Tile {
    n: number;
    /** Title for a wishlist entry. */
    title: string;
    label: string;
    owned?: Book;
    wished?: Book;
    cover: string;
    isbn13: string;
    /** Release date when the volume isn't out yet (from Google Books preorders). */
    upcoming: string;
  }
  const tiles = $derived.by((): Tile[] => {
    if (useOpenLibrary) return olSeries ? olTiles(olSeries) : [];
    if (!group) return [];
    const out: Tile[] = [];
    for (let n = 1; n <= shownCount; n++) {
      const list = group.volumes.get(n) ?? [];
      const owned = list.find((b) => !b.wishlist);
      const wished = list.find((b) => b.wishlist);
      const v = englishVolumes.get(n);
      const upcoming = !owned && v && /^\d{4}-\d{2}-\d{2}$/.test(v.published) && v.published > todayIso() ? v.published : '';
      out.push({ n, title: formatVolume(group.name, n), label: t.seriesVol(n), owned, wished, cover: owned?.cover_url || wished?.cover_url || v?.cover || '', isbn13: v?.isbn13 ?? '', upcoming });
    }
    return out;
  });
  const missing = $derived(tiles.filter((x) => !x.owned && !x.wished));

  /** Your books in an Open Library series: same ISBN, same title, or this book at its own position. */
  function olTiles(series: BookSeries): Tile[] {
    return series.books.map((sb) => {
      const mine = books.filter(
        (b) => (b.isbn13 && sb.isbns.includes(b.isbn13)) || seriesKey(b.title) === seriesKey(sb.title) || (b.id === book.id && sb.position === series.position),
      );
      const owned = mine.find((b) => !b.wishlist);
      const wished = mine.find((b) => b.wishlist);
      return { n: sb.position, title: sb.title, label: t.seriesBook(sb.position), owned, wished, cover: owned?.cover_url || wished?.cover_url || sb.cover, isbn13: '', upcoming: '' };
    });
  }

  function placeholderBook(tile: Tile): Book {
    return { ...emptyBook(), id: `vol-${tile.n}`, title: tile.title, isbn13: tile.isbn13, authors: book.authors, cover_url: tile.cover };
  }

  async function addToWishlist(tile: Tile) {
    const sample = book;
    await library.add({
      ...emptyBook(),
      title: tile.title,
      isbn13: tile.isbn13,
      cover_url: tile.cover,
      authors: sample.authors,
      publisher: sample.publisher,
      language: sample.language,
      category: sample.category,
      wishlist: true,
      needs_details: false,
    });
  }

  async function addAllMissing() {
    busy = true;
    try {
      for (const tile of missing) await addToWishlist(tile);
      toast.show(t.addedToWishlist(missing.length));
    } finally {
      busy = false;
    }
  }

</script>

{#if visible}
  <section class="series">
    <div class="head">
      <h2>{useOpenLibrary ? olSeries?.name : group?.name}</h2>
      {#if candidate}
        <span class="chip" class:done={candidate.status === 'FINISHED'}>{STATUS_LABEL[candidate.status] ?? candidate.status}</span>
      {/if}
    </div>
    <ul class="vols">
      {#each tiles as tile (tile.n)}
        <li class:missing={!tile.owned && !tile.wished} class:here={(tile.owned ?? tile.wished)?.id === book.id}>
          {#if tile.owned}
            <a href={bookHref(tile.owned)} class="vol">
              <Cover book={tile.owned} />
              <span class="label">{tile.label}</span>
            </a>
          {:else if tile.wished}
            <a href={bookHref(tile.wished)} class="vol">
              <span class="coverwrap"><Cover book={tile.wished} /><span class="tag">{t.wishlist}</span></span>
              <span class="label">{tile.label}</span>
              {#if tile.upcoming}<span class="label">{t.seriesOut(tile.upcoming)}</span>{/if}
            </a>
          {:else}
            <div class="vol">
              <span class="coverwrap dim"><Cover book={placeholderBook(tile)} /></span>
              <span class="label">{tile.label}</span>
              {#if tile.upcoming}<span class="label">{t.seriesOut(tile.upcoming)}</span>{/if}
              {#if !readonly}<button class="small" onclick={() => addToWishlist(tile)}>{t.seriesAddWishlist}</button>{/if}
            </div>
          {/if}
        </li>
      {/each}
      {#if loading && !facts && !useOpenLibrary}
        <li class="vol loadingtile"><span class="muted small">{t.lookingUp}</span></li>
      {/if}
    </ul>

    {#if !readonly && missing.length > 1}
      <button class="small" disabled={busy} onclick={addAllMissing}>{t.seriesAddAllMissing}</button>
    {/if}
  </section>
{/if}

<style>
  .series {
    margin: 1.25rem 0;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .head {
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .head h2 {
    margin: 0;
  }
  .chip.done {
    background: var(--ok-soft);
    color: var(--ok);
  }
  .vols {
    list-style: none;
    margin: 0 0 0.75rem;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
    gap: 0.9rem 0.6rem;
  }
  .vol {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .vol button {
    min-height: 30px;
    padding: 0.2rem 0.5rem;
    font-size: 0.8rem;
  }
  .label {
    font-size: 0.8rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .here .vol :global(.cover) {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .coverwrap {
    position: relative;
    display: block;
  }
  .coverwrap.dim :global(.cover) {
    filter: grayscale(1);
    opacity: 0.45;
  }
  /* No cover yet: the label underneath already says which volume it is. */
  .coverwrap.dim :global(.placeholder span) {
    display: none;
  }
  .tag {
    position: absolute;
    left: 6px;
    bottom: 6px;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    background: var(--warn-soft);
    color: var(--accent);
  }
  .loadingtile {
    justify-content: center;
    align-items: center;
    aspect-ratio: 2 / 3;
    border: 1px dashed var(--border);
    border-radius: 6px;
  }
</style>
