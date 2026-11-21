<script lang="ts">
  import { untrack } from 'svelte';
  import { library } from '../lib/store/library.svelte';
  import { t } from '../lib/strings';
  import { parseIsbn } from '../lib/isbn';
  import { COMMON_LANGUAGES, languageName } from '../lib/languages';
  import { uniqueSorted } from '../lib/search';
  import LocationInput from './LocationInput.svelte';
  import CategoryPicker from './CategoryPicker.svelte';
  import { todayIso, type Book } from '../lib/types';

  let {
    book,
    onsave,
    oncancel,
    submitLabel = t.save,
    compact = false,
  }: {
    book: Book;
    onsave: (b: Book) => void | Promise<void>;
    oncancel?: () => void;
    submitLabel?: string;
    compact?: boolean;
  } = $props();

  // Local editable copy, with list fields as text (the form is recreated for another book).
  const initial = untrack(() => $state.snapshot(book)) as Book;
  let f = $state({
    ...initial,
    authorsText: initial.authors.join('; '),
    tagsText: initial.tags.join(', '),
    yearText: initial.year?.toString() ?? '',
    pagesText: initial.pages?.toString() ?? '',
    isbnText: initial.isbn13 || initial.isbn10,
  });
  let showMore = $state(untrack(() => !compact));
  let error = $state('');
  let busy = $state(false);

  const allTags = $derived(uniqueSorted(library.books.flatMap((b) => b.tags)));
  const authors = $derived(uniqueSorted(library.books.flatMap((b) => b.authors)));
  const publishers = $derived(uniqueSorted(library.books.map((b) => b.publisher)));
  const languages = $derived(uniqueSorted([...COMMON_LANGUAGES, ...library.books.map((b) => b.language)]));
  const uid = Math.random().toString(36).slice(2, 8);

  function toInt(s: string): number | null {
    const n = parseInt(s.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  async function submit(e: Event) {
    e.preventDefault();
    error = '';
    let isbn13 = '';
    let isbn10 = '';
    if (f.isbnText.trim()) {
      const p = parseIsbn(f.isbnText);
      if (!p.ok) {
        error = t.isbnProblems[p.problem];
        return;
      }
      isbn13 = p.value.isbn13;
      isbn10 = p.value.isbn10;
    }
    if (!f.title.trim() && !isbn13 && !f.barcode.trim()) {
      error = t.titleRequired;
      return;
    }
    const out: Book = {
      ...initial,
      isbn13,
      isbn10,
      title: f.title.trim(),
      subtitle: f.subtitle.trim(),
      // A changed title gets a fresh translation unless you also edited the English one.
      title_en: f.title.trim() !== initial.title && f.title_en === initial.title_en ? '' : f.title_en.trim(),
      authors: f.authorsText.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean),
      publisher: f.publisher.trim(),
      year: toInt(f.yearText),
      pages: toInt(f.pagesText),
      language: languageName(f.language),
      cover_url: f.cover_url.trim(),
      location: f.location.trim(),
      category: f.category.trim(),
      barcode: f.barcode.replace(/\D/g, ''),
      tags: f.tagsText.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean),
      notes: f.notes.trim(),
      copies: Math.max(1, toInt(String(f.copies)) ?? 1),
      lent_to: f.lent_to.trim(),
      // Keep the original lending date; start one when a name is newly filled in.
      lent_since: f.lent_to.trim() ? f.lent_since || todayIso() : '',
    };
    out.needs_details = !out.title;
    busy = true;
    try {
      await onsave(out);
    } finally {
      busy = false;
    }
  }
</script>

<form class="form" onsubmit={submit} novalidate>
  <div class="field">
    <label for="title-{uid}">{t.fieldLabels.title}</label>
    <input id="title-{uid}" bind:value={f.title} autocomplete="off" enterkeyhint="next" />
  </div>
  <div class="field">
    <label for="authors-{uid}">{t.fieldLabels.authors}</label>
    <input id="authors-{uid}" bind:value={f.authorsText} list="authors-list-{uid}" autocomplete="off" />
    <datalist id="authors-list-{uid}">{#each authors as a}<option value={a}></option>{/each}</datalist>
    <small class="muted">{t.authorsHelp}</small>
  </div>
  <div class="field">
    <span class="label" id="category-{uid}-label">{t.fieldLabels.category}</span>
    <CategoryPicker id="category-{uid}" bind:value={f.category} />
  </div>
  <div class="grid2">
    <div class="field">
      <label for="location-{uid}">{t.fieldLabels.location}</label>
      <LocationInput id="location-{uid}" bind:value={f.location} />
    </div>
    <div class="field">
      <label for="language-{uid}">{t.fieldLabels.language}</label>
      <input id="language-{uid}" bind:value={f.language} list="lang-list-{uid}" autocomplete="off" />
      <datalist id="lang-list-{uid}">{#each languages as l}<option value={l}></option>{/each}</datalist>
    </div>
  </div>
  <div class="field">
    <label for="tags-{uid}">{t.fieldLabels.tags}</label>
    <input id="tags-{uid}" bind:value={f.tagsText} list="tags-list-{uid}" autocomplete="off" />
    <datalist id="tags-list-{uid}">{#each allTags as tg}<option value={tg}></option>{/each}</datalist>
    <small class="muted">{t.tagsHelp}</small>
  </div>

  {#if !showMore}
    <button type="button" class="small ghost" onclick={() => (showMore = true)}>+ {t.more}</button>
  {:else}
    <div class="field">
      <label for="subtitle-{uid}">{t.fieldLabels.subtitle}</label>
      <input id="subtitle-{uid}" bind:value={f.subtitle} autocomplete="off" />
    </div>
    <div class="field">
      <label for="title-en-{uid}">{t.fieldLabels.title_en}</label>
      <input id="title-en-{uid}" bind:value={f.title_en} autocomplete="off" />
    </div>
    <div class="grid2">
      <div class="field">
        <label for="publisher-{uid}">{t.fieldLabels.publisher}</label>
        <input id="publisher-{uid}" bind:value={f.publisher} list="pub-list-{uid}" autocomplete="off" />
        <datalist id="pub-list-{uid}">{#each publishers as p}<option value={p}></option>{/each}</datalist>
      </div>
      <div class="field">
        {#if f.barcode && !f.isbnText}
          <label for="barcode-{uid}">{t.fieldLabels.barcode}</label>
          <input id="barcode-{uid}" bind:value={f.barcode} inputmode="numeric" autocomplete="off" />
        {:else}
          <label for="isbn-{uid}">{t.fieldLabels.isbn13}</label>
          <input id="isbn-{uid}" bind:value={f.isbnText} inputmode="text" autocomplete="off" />
        {/if}
      </div>
    </div>
    <div class="grid3">
      <div class="field">
        <label for="year-{uid}">{t.fieldLabels.year}</label>
        <input id="year-{uid}" bind:value={f.yearText} inputmode="numeric" autocomplete="off" />
      </div>
      <div class="field">
        <label for="pages-{uid}">{t.fieldLabels.pages}</label>
        <input id="pages-{uid}" bind:value={f.pagesText} inputmode="numeric" autocomplete="off" />
      </div>
      <div class="field">
        <label for="copies-{uid}">{t.fieldLabels.copies}</label>
        <input id="copies-{uid}" type="number" min="1" bind:value={f.copies} inputmode="numeric" />
      </div>
    </div>
    <div class="field">
      <label for="lentto-{uid}">{t.fieldLabels.lent_to}</label>
      <input id="lentto-{uid}" bind:value={f.lent_to} autocomplete="off" />
    </div>
    <div class="field">
      <label for="notes-{uid}">{t.fieldLabels.notes}</label>
      <textarea id="notes-{uid}" bind:value={f.notes}></textarea>
    </div>
    <div class="field">
      <label for="cover-{uid}">{t.fieldLabels.cover_url}</label>
      <input id="cover-{uid}" bind:value={f.cover_url} type="url" autocomplete="off" />
    </div>
  {/if}

  {#if error}<p class="error-text" role="alert">{error}</p>{/if}

  <div class="row actions">
    <button type="submit" class="primary" disabled={busy}>{submitLabel}</button>
    {#if oncancel}<button type="button" onclick={oncancel}>{t.cancel}</button>{/if}
  </div>
</form>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  .label {
    display: block;
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 0.35rem;
  }
  .field small {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.8rem;
  }
  .grid2,
  .grid3 {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: 1fr 1fr;
  }
  .grid3 {
    grid-template-columns: 1fr 1fr 1fr;
  }
  @media (max-width: 380px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
  }
  .actions {
    margin-top: 0.25rem;
  }
  .actions button[type='submit'] {
    flex: 1;
  }
</style>
