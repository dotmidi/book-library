<script lang="ts">
  import LibraryView from '../components/LibraryView.svelte';
  import { library } from '../lib/store/library.svelte';
  import { t } from '../lib/strings';
</script>

<LibraryView books={library.books} heading={t.libraryTitle} bookHref={(b) => `#/book/${b.id}`} />

<div class="refresh">
  <button class="small ghost" onclick={() => library.refresh()} disabled={library.refreshing}>
    {library.refreshing ? '…' : '↻'} {t.refresh}
  </button>
</div>

<style>
  .refresh {
    text-align: center;
    margin: -1rem 0 calc(var(--nav-h) + var(--safe-bottom) + 1rem);
  }
  @media (min-width: 800px) {
    .refresh {
      margin-bottom: 2rem;
    }
  }
</style>
