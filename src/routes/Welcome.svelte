<script lang="ts">
  import { library } from '../lib/store/library.svelte';
  import { config } from '../lib/config';
  import { t } from '../lib/strings';
</script>

<div class="welcome">
  <div class="inner">
    <img class="logo" src="./icon-192.png" alt="" width="88" height="88" />
    <h1>{t.welcomeTitle}</h1>
    <p class="lead">{t.welcomeBody}</p>
    <ul>
      {#each t.welcomePoints as p}<li>{p}</li>{/each}
    </ul>

    {#if !config.clientId}
      <p class="card notice">{t.notConfigured}</p>
    {:else if library.phase === 'connecting'}
      <div class="connecting">
        <div class="spinner"></div>
        <p>{library.hasSignedInBefore ? t.signingIn : t.firstTimeSetup}</p>
      </div>
    {:else}
      <button class="primary google" onclick={() => library.signIn()}>
        <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true"
          ><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path
            fill="#FF3D00"
            d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
          /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
          /></svg
        >
        {t.signInButton}
      </button>
      <p class="muted small hint">{t.signInHint}</p>
    {/if}

    {#if library.authError}<p class="error-text" role="alert">{library.authError}</p>{/if}
    {#if library.connectError}
      <p class="error-text" role="alert">{library.connectError}</p>
      <button onclick={() => library.signIn()}>{t.tryAgain}</button>
    {/if}

    <p class="foot small"><a href="./privacy.html">{t.privacyLink}</a></p>
  </div>
</div>

<style>
  .welcome {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: calc(2rem + var(--safe-top)) 16px calc(2rem + var(--safe-bottom));
  }
  .inner {
    max-width: 480px;
    width: 100%;
    text-align: center;
  }
  .logo {
    border-radius: 22px;
    margin-bottom: 1rem;
    box-shadow: var(--shadow);
  }
  h1 {
    font-size: 1.7rem;
  }
  .lead {
    color: var(--muted);
    font-size: 1.05rem;
  }
  ul {
    text-align: left;
    margin: 1.25rem auto 1.75rem;
    padding-left: 1.2rem;
    max-width: 400px;
  }
  li {
    margin-bottom: 0.4rem;
  }
  .google {
    min-height: 56px;
    font-size: 1.1rem;
    padding: 0.6rem 1.6rem;
    width: 100%;
    max-width: 340px;
  }
  .google svg {
    background: #fff;
    border-radius: 50%;
    padding: 2px;
  }
  .hint {
    margin-top: 0.75rem;
  }
  .notice {
    text-align: left;
  }
  .connecting {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }
  .spinner {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .foot {
    margin-top: 2rem;
  }
</style>
