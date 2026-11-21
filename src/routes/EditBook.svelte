<script lang="ts">
  import { untrack } from 'svelte';
  import BookForm from '../components/BookForm.svelte';
  import { library } from '../lib/store/library.svelte';
  import { parseIsbn } from '../lib/isbn';
  import { go } from '../lib/router.svelte';
  import { t } from '../lib/strings';
  import { toast } from '../lib/toast.svelte';
  import { emptyBook, type Book } from '../lib/types';

  let { id = '', isbn = '' }: { id?: string; isbn?: string } = $props();

  // The route is keyed on the id, so reading the props once is enough.
  const existing = untrack(() => (id ? library.get(id) : undefined));
  const initial: Book | undefined = untrack(() =>
    existing
      ? existing
      : id
        ? undefined
        : (() => {
            const b = emptyBook();
            const p = parseIsbn(isbn);
            if (p.ok) {
              b.isbn13 = p.value.isbn13;
              b.isbn10 = p.value.isbn10;
            }
            return b;
          })(),
  );

  /** Saving a book you already own: the first Save warns, the second adds a copy. */
  let warnedDup = '';

  async function save(b: Book) {
    if (existing) {
      await library.update(existing.id, b);
      go(`/book/${existing.id}`, { replace: true });
    } else {
      const dup = b.isbn13 ? library.findByIsbn(b.isbn13) : undefined;
      if (dup && warnedDup !== dup.id) {
        warnedDup = dup.id;
        toast.show(t.saveAgainForCopy(t.alreadyOwned(dup.copies)));
        return;
      }
      if (dup) {
        await library.addCopy(dup.id);
        go(`/book/${dup.id}`, { replace: true });
        return;
      }
      const saved = await library.add(b);
      toast.show(t.saved);
      go(`/book/${saved.id}`, { replace: true });
    }
  }

  function cancel() {
    if (existing) go(`/book/${existing.id}`, { replace: true });
    else go('/add');
  }
</script>

<div class="page narrow">
  {#if !initial}
    <p>{t.bookNotFound}</p>
    <a class="button" href="#/">{t.backToLibrary}</a>
  {:else}
    <h1>{existing ? t.editBookTitle : t.newBookTitle}</h1>
    <div class="card">
      <BookForm book={initial} onsave={save} oncancel={cancel} />
    </div>
  {/if}
</div>

<style>
  .narrow {
    max-width: 640px;
  }
</style>
