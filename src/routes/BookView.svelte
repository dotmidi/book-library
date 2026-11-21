<script lang="ts">
  import Cover from '../components/Cover.svelte';
  import SeriesShelf from '../components/SeriesShelf.svelte';
  import ConfirmButton from '../components/ConfirmButton.svelte';
  import { library } from '../lib/store/library.svelte';
  import { lookupBook, fillBlanks } from '../lib/lookup/service';
  import { t } from '../lib/strings';
  import { go } from '../lib/router.svelte';
  import { toast } from '../lib/toast.svelte';
  import { displayTitle, originalTitle } from '../lib/search';
  import { formatIsbn13 } from '../lib/isbn';
  import { todayIso, type Book } from '../lib/types';
  import { locationFlag } from '../lib/countries';

  // Own books are read from the library by id; a friend's book is passed in and shown read-only.
  let {
    id = '',
    friendBook,
    friendBooks = [],
    friendCode = '',
    backHref = '#/',
    backLabel = t.navLibrary,
  }: { id?: string; friendBook?: Book; friendBooks?: Book[]; friendCode?: string; backHref?: string; backLabel?: string } = $props();
  const readonly = $derived(Boolean(friendBook));
  const book = $derived(friendBook ?? library.get(id));
  let lending = $state(false);
  let lendName = $state('');
  let looking = $state(false);

  async function lend(e: Event) {
    e.preventDefault();
    if (!book || !lendName.trim()) return;
    await library.update(book.id, { lent_to: lendName.trim(), lent_since: todayIso() });
    lending = false;
    lendName = '';
  }

  async function returned() {
    if (book) await library.update(book.id, { lent_to: '', lent_since: '' });
  }

  async function remove() {
    if (!book) return;
    await library.remove(book.id);
    toast.show(t.deleted);
    go('/');
  }

  async function retry() {
    if (!book?.isbn13) return;
    looking = true;
    try {
      const out = await lookupBook(book.isbn13, { force: true });
      if (out.metadata) {
        const filled = fillBlanks($state.snapshot(book), out.metadata);
        await library.update(book.id, filled);
        toast.show(t.lookupUpdated);
      } else toast.show(out.errors.length ? t.lookupFailed : t.lookupNothingNew);
    } finally {
      looking = false;
    }
  }

  const rows = $derived(
    book
      ? ([
          ['publisher', book.publisher],
          ['year', book.year],
          ['pages', book.pages],
          ['language', book.language],
          ['location', book.location ? `${locationFlag(book.location)} ${book.location}`.trim() : ''],
          ['category', book.category],
          ['tags', book.tags.join(', ')],
          ['copies', book.copies > 1 ? book.copies : ''],
          ['isbn13', book.isbn13 ? formatIsbn13(book.isbn13) : ''],
          ['isbn10', book.isbn10],
          ['barcode', book.barcode],
          ['date_added', book.date_added],
        ] as [string, unknown][]).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      : [],
  );
</script>

<div class="page">
  {#if !book}
    <p>{t.bookNotFound}</p>
    <a class="button" href={backHref}>{backLabel}</a>
  {:else}
    <a class="backlink" href={backHref}>‹ {backLabel}</a>
    <div class="hero">
      <Cover {book} size="lg" />
      <div class="htext">
        <h1>{originalTitle(book, t.untitled)}</h1>
        {#if book.title_en && book.title_en !== book.title}<p class="translated">{book.title_en}</p>{/if}
        {#if book.subtitle}<p class="subtitle">{book.subtitle}</p>{/if}
        {#if book.authors.length}<p class="muted">{t.by} {book.authors.join(', ')}</p>{/if}
        <div class="row badges">
          {#if book.wishlist}<span class="chip warn">{t.wishlist}</span>{/if}
          {#if book.category}<span class="chip">{book.category}</span>{/if}
          {#if book.lent_to}<span class="chip lent">{t.lentOut}</span>{/if}
          {#if book.needs_details || !book.title}<span class="chip warn">{t.needsDetailsBadge}</span>{/if}
        </div>
        {#if !readonly}<div class="row actions">
          {#if book.wishlist}<button class="primary" onclick={() => library.update(book.id, { wishlist: false })}>{t.boughtIt}</button>{/if}
          <a class="button" class:primary={!book.wishlist} href="#/book/{book.id}/edit">{t.edit}</a>
          {#if book.isbn13 && (book.needs_details || !book.title || !book.cover_url || !book.authors.length)}
            <button onclick={retry} disabled={looking}>{looking ? t.lookingUp : t.retryLookup}</button>
          {/if}
        </div>{/if}
      </div>
    </div>

    {#if readonly && book.lent_to}
      <p class="chip lent">{t.lentOut}</p>
    {/if}
    {#if !readonly && !book.wishlist}
    <section class="card lendcard">
      <h2>{t.lending}</h2>
      {#if book.lent_to}
        <p>{t.lentTo(book.lent_to || '?', book.lent_since)}</p>
        <button onclick={returned}>{t.markReturned}</button>
      {:else if lending}
        <form class="row" onsubmit={lend}>
          <label class="visually-hidden" for="lend-name">{t.lendTo}</label>
          <input id="lend-name" bind:value={lendName} placeholder={t.lendTo} autocomplete="off" style="flex:1;min-width:10rem" />
          <button type="submit" class="primary">{t.lend}</button>
          <button type="button" class="ghost" onclick={() => (lending = false)}>{t.cancel}</button>
        </form>
      {:else}
        <button onclick={() => (lending = true)}>{t.lendBook}</button>
      {/if}
    </section>
    {/if}

    {#if rows.length || book.notes}
      <section class="card">
        <h2>{t.details}</h2>
        <dl>
          {#each rows as [k, v]}
            <dt>{t.fieldLabels[k]}</dt>
            <dd>{v}</dd>
          {/each}
        </dl>
        {#if book.notes}
          <h3>{t.fieldLabels.notes}</h3>
          <p class="notes">{book.notes}</p>
        {/if}
      </section>
    {/if}

    {#if !readonly}
    <div class="row copies">
      <span class="muted">{t.fieldLabels.copies}: {book.copies}</span>
      <button class="small" onclick={() => library.addCopy(book.id)}>+1</button>
      {#if book.copies > 1}
        <button class="small" onclick={() => library.update(book.id, { copies: book.copies - 1 })}>−1</button>
      {/if}
    </div>

    {/if}

    <SeriesShelf
      {book}
      books={readonly ? friendBooks : library.books}
      {readonly}
      bookHref={(b) => (readonly ? `#/friends/${friendCode}/book/${b.id}` : `#/book/${b.id}`)}
    />

    {#if !readonly}
    <div class="danger-zone">
      <ConfirmButton class="danger" label={t.deleteBook} confirmLabel={t.confirmDelete} onconfirm={remove} />
    </div>
    {/if}
  {/if}
</div>

<style>
  .backlink {
    display: inline-block;
    margin-bottom: 0.75rem;
    text-decoration: none;
    font-weight: 600;
  }
  .hero {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  .htext {
    min-width: 0;
    flex: 1;
  }
  h1 {
    overflow-wrap: anywhere;
  }
  .subtitle {
    font-size: 1.05rem;
  }
  .translated {
    margin-top: -0.25rem;
    color: var(--muted);
  }
  .badges {
    margin-bottom: 0.75rem;
  }
  @media (max-width: 520px) {
    .hero {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .badges,
    .actions {
      justify-content: center;
    }
  }
  section {
    margin-bottom: 1rem;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.4rem 1rem;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .notes {
    white-space: pre-wrap;
  }
  .copies {
    margin: 1rem 0;
  }
  .danger-zone {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
</style>
