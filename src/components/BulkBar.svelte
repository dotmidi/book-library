<script lang="ts">
  import LocationInput from './LocationInput.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import CategoryPicker from './CategoryPicker.svelte';
  import { library } from '../lib/store/library.svelte';
  import { toast } from '../lib/toast.svelte';
  import { t } from '../lib/strings';

  let { ids, shelf, ondone }: { ids: string[]; shelf: 'owned' | 'wishlist'; ondone: () => void } = $props();

  type Panel = '' | 'location' | 'category' | 'tag';
  let panel = $state<Panel>('');
  let location = $state('');
  let category = $state('');
  let tagText = $state('');
  let busy = $state(false);

  async function run(fn: (id: string) => Promise<void>, message: string) {
    if (!ids.length || busy) return;
    busy = true;
    try {
      for (const id of [...ids]) await fn(id);
      toast.show(message);
      panel = '';
      ondone();
    } finally {
      busy = false;
    }
  }

  const setLocation = () => run((id) => library.update(id, { location: location.trim() }), t.bulkDone(ids.length));
  const setCategory = () => run((id) => library.update(id, { category: category.trim() }), t.bulkDone(ids.length));
  function addTag() {
    const tag = tagText.trim();
    if (!tag) return;
    run(async (id) => {
      const b = library.get(id);
      if (b && !b.tags.some((x) => x.toLowerCase() === tag.toLowerCase())) await library.update(id, { tags: [...b.tags, tag] });
    }, t.bulkDone(ids.length));
  }
  function removeTag() {
    const tag = tagText.trim().toLowerCase();
    if (!tag) return;
    run(async (id) => {
      const b = library.get(id);
      if (b) await library.update(id, { tags: b.tags.filter((x) => x.toLowerCase() !== tag) });
    }, t.bulkDone(ids.length));
  }
  const moveShelf = () =>
    run((id) => library.update(id, { wishlist: shelf === 'owned' }), shelf === 'owned' ? t.bulkMovedToWishlist(ids.length) : t.bulkMovedToLibrary(ids.length));
  function remove() {
    run((id) => library.remove(id), t.bulkDeleted(ids.length));
  }
</script>

<div class="bulk" role="region" aria-label={t.bulkEdit}>
  {#if panel === 'location'}
    <div class="panel">
      <label for="bulk-loc">{t.setLocationFor(ids.length)}</label>
      <LocationInput id="bulk-loc" bind:value={location} />
      <div class="row"><button class="primary" disabled={busy} onclick={setLocation}>{t.apply}</button><button onclick={() => (panel = '')}>{t.cancel}</button></div>
    </div>
  {:else if panel === 'category'}
    <div class="panel">
      <span class="lbl">{t.setCategoryFor(ids.length)}</span>
      <CategoryPicker id="bulk-cat" bind:value={category} />
      <div class="row"><button class="primary" disabled={busy} onclick={setCategory}>{t.apply}</button><button onclick={() => (panel = '')}>{t.cancel}</button></div>
    </div>
  {:else if panel === 'tag'}
    <div class="panel">
      <label for="bulk-tag">{t.tagFor(ids.length)}</label>
      <input id="bulk-tag" bind:value={tagText} autocomplete="off" />
      <div class="row">
        <button class="primary" disabled={busy || !tagText.trim()} onclick={addTag}>{t.addTag}</button>
        <button disabled={busy || !tagText.trim()} onclick={removeTag}>{t.removeTag}</button>
        <button class="ghost" onclick={() => (panel = '')}>{t.cancel}</button>
      </div>
    </div>
  {/if}
  <div class="bar">
    <strong class="n">{t.selectedCount(ids.length)}</strong>
    <div class="actions">
      <button class="small" disabled={!ids.length} onclick={() => (panel = 'location')}>{t.fieldLabels.location}</button>
      <button class="small" disabled={!ids.length} onclick={() => (panel = 'category')}>{t.fieldLabels.category}</button>
      <button class="small" disabled={!ids.length} onclick={() => (panel = 'tag')}>{t.fieldLabels.tags}</button>
      <button class="small" disabled={!ids.length || busy} onclick={moveShelf}>{shelf === 'owned' ? t.toWishlist : t.boughtIt}</button>
      <ConfirmButton class="small danger" disabled={!ids.length || busy} label={t.deleteBook} confirmLabel={t.confirmDelete} onconfirm={remove} />
    </div>
  </div>
</div>

<style>
  .bulk {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--nav-h) + var(--safe-bottom));
    z-index: 25;
    background: var(--surface);
    border-top: 1px solid var(--border);
    box-shadow: 0 -4px 16px rgb(0 0 0 / 0.08);
    padding: 0.6rem 16px;
  }
  @media (min-width: 800px) {
    .bulk {
      bottom: 0;
    }
  }
  .bar {
    max-width: 980px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 0.5rem 0.75rem;
    flex-wrap: wrap;
  }
  .n {
    flex-shrink: 0;
    font-size: 0.9rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .actions button {
    flex-shrink: 0;
  }
  .panel {
    max-width: 980px;
    margin: 0 auto 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .lbl {
    font-weight: 600;
    font-size: 0.9rem;
  }
</style>
