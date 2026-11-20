<script lang="ts">
  import { onMount } from 'svelte';
  import Scanner from '../components/Scanner.svelte';
  import ScanCardView from '../components/ScanCardView.svelte';
  import { scanSession } from '../lib/scan/session.svelte';
  import { preloadDetector } from '../lib/scan/camera';
  import { t } from '../lib/strings';

  let input: HTMLInputElement | undefined = $state();
  let value = $state('');
  let error = $state('');
  // Keep the field focused on computers (USB scanners type into it). Not on
  // phones, where focusing would pop the keyboard up over the camera.
  const finePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;

  function submit(e: Event) {
    e.preventDefault();
    const problem = scanSession.submit(value, 'typed');
    error = problem ? t.isbnProblems[problem] : '';
    if (!problem) value = '';
    if (finePointer) input?.focus();
  }

  function refocus() {
    if (!finePointer) return;
    const a = document.activeElement;
    if (!a || a === document.body) input?.focus();
  }

  onMount(() => {
    preloadDetector().catch(() => {});
    if (finePointer) input?.focus();
    window.addEventListener('focus', refocus);
    document.addEventListener('click', refocus);
    return () => {
      window.removeEventListener('focus', refocus);
      document.removeEventListener('click', refocus);
    };
  });

  const doneCount = $derived(scanSession.cards.filter((c) => c.state === 'saved' || c.state === 'copyAdded').length);
</script>

<div class="page add">
  <h1>{t.addTitle}</h1>

  <form class="isbn-form" onsubmit={submit} autocomplete="off">
    <label for="isbn-input">{t.isbnLabel}</label>
    <div class="row nowrap">
      <input
        id="isbn-input"
        bind:this={input}
        bind:value
        placeholder={t.isbnPlaceholder}
        inputmode="text"
        enterkeyhint="search"
        autocapitalize="characters"
        spellcheck="false"
        aria-describedby="isbn-help"
        aria-invalid={error ? 'true' : undefined}
      />
      <button type="submit" class="primary">{t.lookUp}</button>
    </div>
    {#if error}<p class="error-text" role="alert">{error}</p>{:else}<p id="isbn-help" class="muted small">{t.isbnHelp}</p>{/if}
  </form>

  <Scanner onscan={(isbn) => scanSession.submit(isbn, 'camera')} />

  <div class="options">
    <label class="toggle">
      <input type="checkbox" checked={scanSession.wishlistMode} onchange={(e) => scanSession.setWishlistMode(e.currentTarget.checked)} />
      <span>☆ {t.addToWishlistMode}</span>
    </label>
    <label class="toggle">
      <input type="checkbox" checked={scanSession.autoSave} onchange={(e) => scanSession.setAutoSave(e.currentTarget.checked)} />
      <span>{t.autoSave}</span>
    </label>
  </div>
  {#if scanSession.wishlistMode}<p class="wishnote small">{t.wishlistModeOn}</p>{/if}

  <section class="cards" aria-live="polite">
    {#each scanSession.cards as card (card.key)}
      <ScanCardView {card} />
    {/each}
  </section>

  <div class="row footer">
    <a class="button small" href="#/new">{t.addWithoutIsbn}</a>
    {#if doneCount > 0}
      <button class="small ghost" onclick={() => scanSession.clearDone()}>{t.dismiss} ✓ ({doneCount})</button>
    {/if}
  </div>
</div>

<style>
  .add {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  h1 {
    margin-bottom: 0;
  }
  .isbn-form p {
    margin: 0.35rem 0 0;
  }
  .nowrap {
    flex-wrap: nowrap;
  }
  .nowrap input {
    flex: 1;
    font-size: 1.15rem;
    letter-spacing: 0.03em;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .wishnote {
    margin: -0.4rem 0 0;
    padding: 0.4rem 0.75rem;
    border-radius: 10px;
    background: var(--warn-soft);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    margin: 0;
    cursor: pointer;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .cards:empty {
    display: none;
  }
  @media (min-width: 800px) {
    .add {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
      column-gap: 1.5rem;
    }
    h1,
    .isbn-form {
      grid-column: 1;
    }
    .cards {
      grid-column: 2;
      grid-row: 1 / span 5;
    }
  }
</style>
