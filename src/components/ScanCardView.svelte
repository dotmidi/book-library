<script lang="ts">
  import Cover from './Cover.svelte';
  import BookForm from './BookForm.svelte';
  import { scanSession, type ScanCard } from '../lib/scan/session.svelte';
  import { library } from '../lib/store/library.svelte';
  import { t } from '../lib/strings';
  import { formatIsbn13 } from '../lib/isbn';
  import type { Book } from '../lib/types';

  let { card }: { card: ScanCard } = $props();
  const existing = $derived(card.bookId ? library.get(card.bookId) : undefined);
  const shown = $derived<Book>(card.state === 'duplicate' || card.state === 'copyAdded' ? (existing ?? card.draft) : card.draft);
  let prevState = $state<ScanCard['state']>('found');

  function edit() {
    prevState = card.state;
    card.state = 'editing';
  }
  async function saveEdited(b: Book) {
    await scanSession.save(card.key, b);
  }
</script>

<article class="card scan-card" class:done={card.state === 'saved' || card.state === 'copyAdded'}>
  {#if card.state === 'editing'}
    <h3>{card.draft.title || formatIsbn13(card.isbn13)}</h3>
    <BookForm book={card.draft} compact onsave={saveEdited} oncancel={() => (card.state = prevState)} />
  {:else}
    <div class="top">
      <Cover book={shown} size="sm" />
      <div class="info">
        {#if card.state === 'looking'}
          <strong>{t.lookingUp}</strong>
          <span class="muted small">{formatIsbn13(card.isbn13)}</span>
        {:else}
          <strong class="title">{shown.title || formatIsbn13(card.isbn13)}</strong>
          {#if shown.authors.length}<span class="muted small">{shown.authors.join(', ')}</span>{/if}
          {#if card.state === 'notfound'}<span class="small">{t.notFound}</span>{/if}
          {#if card.state === 'error'}<span class="small error-text">{t.lookupFailed}</span>{/if}
          {#if card.state === 'duplicate'}<span class="chip lent">{t.alreadyOwned(existing?.copies ?? 1)}</span>{/if}
          {#if card.state === 'saved'}<span class="ok">✓ {t.saved}</span>{/if}
          {#if card.state === 'copyAdded'}<span class="ok">✓ {t.copyAdded} ({existing?.copies})</span>{/if}
          {#if card.state === 'found' && card.sources.length}<span class="muted small">{t.foundVia(card.sources.join(' + '))}</span>{/if}
        {/if}
      </div>
      {#if card.state !== 'looking'}
        <button class="ghost small close" aria-label={t.skip} onclick={() => scanSession.dismiss(card.key)}>✕</button>
      {/if}
    </div>

    <div class="row actions">
      {#if card.state === 'found'}
        <button class="primary" onclick={() => scanSession.save(card.key)}>{t.save}</button>
        <button onclick={edit}>{t.edit}</button>
      {:else if card.state === 'notfound' || card.state === 'error'}
        <button class="primary" onclick={edit}>{t.fillInDetails}</button>
        <button onclick={() => scanSession.save(card.key)}>{t.saveIsbnOnly}</button>
        {#if card.state === 'error'}<button class="ghost" onclick={() => scanSession.lookup(card.key, true)}>{t.retryLookup}</button>{/if}
      {:else if card.state === 'duplicate'}
        <button class="primary" onclick={() => scanSession.addCopy(card.key)}>{t.addAnotherCopy}</button>
        <a class="button" href="#/book/{card.bookId}">{t.view}</a>
      {:else if card.state === 'saved' || card.state === 'copyAdded'}
        <button class="small" onclick={() => scanSession.undo(card.key)}>{t.undo}</button>
        {#if card.bookId}<a class="button small" href="#/book/{card.bookId}/edit">{t.edit}</a>{/if}
      {/if}
    </div>
  {/if}
</article>

<style>
  .scan-card {
    padding: 0.85rem;
    animation: slide-in 0.2s ease-out;
  }
  .scan-card.done {
    background: color-mix(in srgb, var(--ok-soft) 50%, var(--surface));
  }
  @keyframes slide-in {
    from {
      transform: translateY(-8px);
      opacity: 0;
    }
  }
  .top {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
    min-width: 0;
  }
  .title {
    overflow-wrap: anywhere;
  }
  .ok {
    color: var(--ok);
    font-weight: 700;
  }
  .close {
    min-height: 36px;
    width: 36px;
    padding: 0;
  }
  .actions {
    margin-top: 0.6rem;
  }
  .actions:empty {
    display: none;
  }
  .chip {
    align-self: flex-start;
  }
</style>
