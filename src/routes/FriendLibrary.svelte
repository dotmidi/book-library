<script lang="ts">
  import { onMount } from 'svelte';
  import LibraryView from '../components/LibraryView.svelte';
  import BookView from './BookView.svelte';
  import { friends } from '../lib/friends/store.svelte';
  import { t } from '../lib/strings';

  let { code, bookId = '' }: { code: string; bookId?: string } = $props();
  let loading = $state(false);

  const lib = $derived(friends.libraries[code]);
  const error = $derived(friends.libraryErrors[code]);
  const name = $derived(lib?.name || friends.friends.find((f) => f.code === code)?.name || '?');
  const book = $derived(bookId && lib ? lib.books.find((b) => b.id === bookId) : undefined);

  async function load(force = false) {
    loading = true;
    await friends.open(code, force);
    loading = false;
  }

  onMount(() => {
    friends.load();
    load();
  });
</script>

{#if !lib}
  <div class="page">
    <a class="backlink" href="#/friends">‹ {t.friendsTitle}</a>
    {#if error}
      <p class="card err">{error}</p>
      <button onclick={() => load(true)}>{t.tryAgain}</button>
    {:else}
      <p class="muted">{t.loadingFriendLibrary}</p>
    {/if}
  </div>
{:else if bookId}
  {#if book}
    <BookView friendBook={book} backHref="#/friends/{code}" backLabel={t.friendLibraryName(name)} />
  {:else}
    <div class="page"><p>{t.bookNotFound}</p><a class="button" href="#/friends/{code}">{t.friendLibraryName(name)}</a></div>
  {/if}
{:else}
  <div class="page top">
    <a class="backlink" href="#/friends">‹ {t.friendsTitle}</a>
    <span class="muted small">{t.readOnly}</span>
  </div>
  <LibraryView books={lib.books} readonly heading={t.friendLibraryName(name)} storagePrefix="fr-{code.slice(0, 8)}" bookHref={(b) => `#/friends/${code}/book/${b.id}`} />
  <div class="refresh">
    <button class="small ghost" onclick={() => load(true)} disabled={loading}>{loading ? '…' : '↻'} {t.refresh}</button>
  </div>
{/if}

<style>
  .backlink {
    display: inline-block;
    text-decoration: none;
    font-weight: 600;
  }
  .page.top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0;
  }
  .err {
    background: var(--danger-soft);
    margin-top: 1rem;
  }
  .refresh {
    text-align: center;
    margin: -1rem 0 calc(var(--nav-h) + var(--safe-bottom) + 1rem);
  }
</style>
