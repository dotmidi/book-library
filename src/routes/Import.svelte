<script lang="ts">
  import { importer } from '../lib/importer.svelte';
  import { t } from '../lib/strings';

  let error = $state('');

  async function pick(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    try {
      await importer.load(file);
    } catch (err) {
      error = (err as Error).message;
    }
  }
</script>

<div class="page narrow stack">
  <a href="#/more" class="backlink">‹ {t.moreTitle}</a>
  <h1>{t.importTitle}</h1>
  <p class="muted">{t.importIntro}</p>

  {#if importer.running}
    <div class="card stack">
      <p><strong>{t.importProgress(importer.done, importer.total)}</strong></p>
      <progress max={importer.total} value={importer.done}></progress>
      <p class="muted small">{t.importLookupNote}</p>
    </div>
  {:else if importer.preview}
    {@const p = importer.preview}
    <div class="card stack">
      <p><strong>{p.fileName}</strong></p>
      <p>{t.importSummary(p.books.length, p.needLookup.length, p.duplicates, p.skipped.length)}</p>
      {#if p.matchedHeaders.length}<p class="small"><span class="muted">{t.matchedColumns}:</span> {p.matchedHeaders.join(', ')}</p>{/if}
      {#if p.unknownHeaders.length}<p class="small"><span class="muted">{t.ignoredColumns}:</span> {p.unknownHeaders.join(', ')}</p>{/if}
      {#if p.skipped.length}
        <details>
          <summary class="small">{t.skippedRows} ({p.skipped.length})</summary>
          <ul class="small">{#each p.skipped.slice(0, 50) as s}<li>{s}</li>{/each}</ul>
        </details>
      {/if}
      {#if p.withoutIsbn}
        <label class="toggle">
          <input type="checkbox" bind:checked={importer.matchByTitle} />
          <span>{t.matchByTitle(p.withoutIsbn)}</span>
        </label>
      {/if}
      <label class="toggle">
        <input type="checkbox" bind:checked={importer.toWishlist} />
        <span>{t.importToWishlist}</span>
      </label>
      <div class="row">
        <button class="primary" onclick={() => importer.run()} disabled={p.books.length + p.needLookup.length === 0}>{t.importStart}</button>
        <button onclick={() => importer.reset()}>{t.cancel}</button>
      </div>
    </div>
  {:else}
    {#if importer.finished}
      <p class="card done">{t.importDone(importer.added)} {importer.matched ? t.importMatched(importer.matched) : ''}</p>
    {/if}
    <label class="button primary filebtn">
      {t.chooseFile}
      <input type="file" accept=".csv,text/csv,text/plain" onchange={pick} />
    </label>
  {/if}
  {#if error}<p class="error-text">{error}</p>{/if}
</div>

<style>
  .narrow {
    max-width: 640px;
  }
  .backlink {
    text-decoration: none;
    font-weight: 600;
  }
  progress {
    width: 100%;
    height: 14px;
    accent-color: var(--primary);
  }
  .filebtn {
    position: relative;
    overflow: hidden;
    margin: 0;
  }
  .filebtn input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    margin: 0;
    cursor: pointer;
  }
  .done {
    background: var(--ok-soft);
  }
  .stack > p {
    margin-bottom: 0;
  }
</style>
