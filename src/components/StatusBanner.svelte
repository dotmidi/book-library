<script lang="ts">
  import { library } from '../lib/store/library.svelte';
  import { t } from '../lib/strings';
</script>

<div class="banners" aria-live="polite">
  {#if library.justCreated}
    <div class="banner ok">
      <span>{t.sheetCreated}</span>
      <button class="small ghost" onclick={() => (library.justCreated = false)}>{t.dismiss}</button>
    </div>
  {/if}

  {#if library.needsAuth}
    <div class="banner" class:warn={library.pending > 0}>
      <span>{library.pending > 0 ? t.reconnectNeededPending(library.pending) : t.reconnectNeeded}</span>
      <button class="small primary" onclick={() => library.reconnect()}>{t.reconnectButton}</button>
    </div>
  {:else if !library.online}
    <div class="banner">{t.offline}</div>
  {:else if library.syncError}
    <div class="banner error">
      <span>{library.syncError}</span>
      <button class="small" onclick={() => library.retryNow()}>{t.tryAgain}</button>
    </div>
  {/if}

  {#if library.authError}
    <div class="banner error">
      <span>{library.authError}</span>
      <button class="small ghost" onclick={() => (library.authError = '')}>{t.dismiss}</button>
    </div>
  {/if}

  {#if library.connectError}
    <div class="banner error">
      <span>{library.connectError}</span>
      <button class="small" onclick={() => library.refresh()}>{t.tryAgain}</button>
    </div>
  {/if}

  {#if library.saving || (library.pending > 0 && !library.needsAuth && library.online && !library.syncError)}
    <div class="saving">{library.saving ? t.saving : t.pendingChanges(library.pending)}</div>
  {/if}
</div>

<style>
  .banners {
    max-width: 980px;
    margin: 0 auto;
    padding: 0 16px;
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding: 0.6rem 0.6rem 0.6rem 1rem;
    border-radius: 12px;
    background: var(--surface-2);
    font-size: 0.95rem;
  }
  .banner.warn {
    background: var(--warn-soft);
  }
  .banner.error {
    background: var(--danger-soft);
  }
  .banner.ok {
    background: var(--ok-soft);
  }
  .banner button {
    flex-shrink: 0;
  }
  .saving {
    position: fixed;
    top: calc(var(--safe-top) + 10px);
    right: 16px;
    z-index: 30;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.2rem 0.7rem;
  }
</style>
