<script lang="ts">
  import { library } from '../lib/store/library.svelte';
  import { getAuthMode, setAuthMode } from '../lib/auth/google';
  import { sheetUrl, xlsxUrl } from '../lib/google/sheets';
  import { config } from '../lib/config';
  import { t } from '../lib/strings';

  let fullPage = $state(getAuthMode() === 'redirect');
  const lastLoaded = $derived(library.lastSync ? new Date(library.lastSync).toLocaleString() : '—');
  const guideUrl = 'https://github.com/dotmidi/book-library/blob/main/docs/user-guide.md';

  function toggleMode(on: boolean) {
    fullPage = on;
    setAuthMode(on ? 'redirect' : 'popup');
  }

  async function signOut() {
    if (library.pending > 0 && !confirm(t.signOutPendingConfirm(library.pending))) return;
    await library.signOut();
  }
</script>

<div class="page narrow stack">
  <h1>{t.moreTitle}</h1>

  {#if library.warnings.length}
    <section class="card warn">
      <h2>{t.warningsTitle}</h2>
      <ul>
        {#each library.warnings.slice(0, 30) as w}<li>{w}</li>{/each}
      </ul>
      {#if library.warnings.length > 30}<p class="muted small">+{library.warnings.length - 30}</p>{/if}
      <button class="small" onclick={() => library.dismissWarnings()}>{t.dismiss}</button>
    </section>
  {/if}

  <section class="card stack">
    <h2>{t.yourSheet}</h2>
    {#if library.spreadsheetId}
      <a class="button primary wide" href={sheetUrl(library.spreadsheetId)} target="_blank" rel="noopener">{t.openSheet}</a>
      <a class="button wide" href={xlsxUrl(library.spreadsheetId)} target="_blank" rel="noopener">{t.downloadExcel}</a>
    {/if}
    <button class="wide" onclick={() => library.refresh()} disabled={library.refreshing}>
      {library.refreshing ? '…' : t.refreshFromSheet}
    </button>
    <p class="muted small">{t.lastSynced(lastLoaded)}</p>
    {#if library.pending > 0}
      <p class="small">
        {t.pendingChanges(library.pending)}
        <button class="small" onclick={() => (library.needsAuth ? library.reconnect() : library.retryNow())}>{t.tryAgain}</button>
      </p>
    {/if}
    <a class="button wide" href="#/import">{t.importCsv}</a>
  </section>

  <section class="card stack">
    <h2>{t.help}</h2>
    <a href={guideUrl} target="_blank" rel="noopener">{t.userGuide}</a>
    <label class="toggle">
      <input type="checkbox" checked={fullPage} onchange={(e) => toggleMode(e.currentTarget.checked)} />
      <span>{t.signInMethod}</span>
    </label>
    <p class="muted small">{t.signInMethodHelp}</p>
  </section>

  <section class="card stack">
    {#if library.user?.email}
      <p><span class="muted">{t.signedInAs}</span><br /><strong>{library.user.email}</strong></p>
    {/if}
    <div class="row">
      <button onclick={() => library.signIn(true)}>{t.switchAccount}</button>
      <button class="danger" onclick={signOut}>{t.signOut}</button>
    </div>
  </section>

  <p class="muted small center">
    <a href="./privacy.html">{t.privacyLink}</a> · {t.version(config.version)}
  </p>
</div>

<style>
  .narrow {
    max-width: 640px;
  }
  .warn {
    background: var(--warn-soft);
  }
  .warn ul {
    padding-left: 1.2rem;
    margin: 0 0 0.75rem;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    cursor: pointer;
    margin: 0;
  }
  .center {
    text-align: center;
  }
  .stack > p {
    margin-bottom: 0;
  }
</style>
