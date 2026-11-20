<script lang="ts">
  import { router } from './lib/router.svelte';
  import { library } from './lib/store/library.svelte';
  import { toast } from './lib/toast.svelte';
  import { t } from './lib/strings';
  import StatusBanner from './components/StatusBanner.svelte';
  import Welcome from './routes/Welcome.svelte';
  import LibraryPage from './routes/Library.svelte';
  import Add from './routes/Add.svelte';
  import BookView from './routes/BookView.svelte';
  import EditBook from './routes/EditBook.svelte';
  import Stats from './routes/Stats.svelte';
  import More from './routes/More.svelte';
  import Import from './routes/Import.svelte';
  import Friends from './routes/Friends.svelte';
  import FriendLibrary from './routes/FriendLibrary.svelte';

  const route = $derived(router.route);
  const tabs = [
    { href: '#/', name: 'library', label: t.navLibrary, icon: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.6l3.8-1 3.7 15.5-3.8.9z' },
    { href: '#/add', name: 'add', label: t.navAdd, icon: 'M3 5h2v14H3zM7 5h1v14H7zM10 5h2v14h-2zM14 5h1v14h-1zM17 5h2v14h-2zM21 5h1v14h-1z' },
    { href: '#/friends', name: 'friends', label: t.navFriends, icon: 'M9 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm8 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM1 20c0-3.3 3.6-6 8-6s8 2.7 8 6v1H1zm16.9 1H23v-1c0-2.6-2.4-4.8-5.6-5.4 1.5 1.4 2.5 3.3 2.5 5.4z' },
    { href: '#/stats', name: 'stats', label: t.navStats, icon: 'M4 20V10h4v10zM10 20V4h4v16zM16 20v-7h4v7z' },
    { href: '#/more', name: 'more', label: t.navMore, icon: 'M5 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z' },
  ];
  const activeTab = $derived(
    route.name === 'book' || route.name === 'edit' || route.name === 'library'
      ? 'library'
      : route.name === 'new'
        ? 'add'
        : route.name === 'import'
          ? 'more'
          : route.name === 'friend' || route.name === 'friendBook'
            ? 'friends'
            : route.name,
  );
</script>

{#if library.phase === 'starting'}
  <div class="center"><div class="spinner" aria-label="Loading"></div></div>
{:else if library.phase === 'welcome' || library.phase === 'connecting'}
  <Welcome />
{:else}
  <header class="topbar">
    <a class="brand" href="#/">
      <img src="./favicon.svg" alt="" width="28" height="28" />
      <span>{t.appName}</span>
    </a>
    <nav class="desktop-nav" aria-label="Main">
      {#each tabs as tab}
        <a href={tab.href} class:active={activeTab === tab.name}>{tab.label}</a>
      {/each}
    </nav>
  </header>

  <StatusBanner />

  <main>
    {#if route.name === 'library'}
      <LibraryPage />
    {:else if route.name === 'add'}
      <Add />
    {:else if route.name === 'book'}
      {#key route.params.id}<BookView id={route.params.id} />{/key}
    {:else if route.name === 'edit'}
      {#key route.params.id}<EditBook id={route.params.id} />{/key}
    {:else if route.name === 'new'}
      <EditBook isbn={route.query.get('isbn') ?? ''} />
    {:else if route.name === 'stats'}
      <Stats />
    {:else if route.name === 'more'}
      <More />
    {:else if route.name === 'import'}
      <Import />
    {:else if route.name === 'friends'}
      <Friends />
    {:else if route.name === 'friend'}
      {#key route.params.code}<FriendLibrary code={route.params.code} />{/key}
    {:else if route.name === 'friendBook'}
      {#key route.params.id}<FriendLibrary code={route.params.code} bookId={route.params.id} />{/key}
    {:else}
      <div class="page"><p>{t.bookNotFound}</p><a class="button" href="#/">{t.backToLibrary}</a></div>
    {/if}
  </main>

  <nav class="tabbar" aria-label="Main">
    {#each tabs as tab}
      <a href={tab.href} class:active={activeTab === tab.name}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={tab.icon} fill="currentColor" /></svg>
        <span>{tab.label}</span>
      </a>
    {/each}
  </nav>
{/if}

{#if toast.message}
  <div class="toast" role="status">{toast.message}</div>
{/if}

<style>
  .center {
    min-height: 100dvh;
    display: grid;
    place-items: center;
  }
  .spinner {
    width: 36px;
    height: 36px;
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
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: calc(0.5rem + var(--safe-top)) 16px 0.5rem;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    color: var(--text);
    text-decoration: none;
    font-size: 1.05rem;
  }
  .desktop-nav {
    display: none;
    gap: 0.25rem;
  }
  .desktop-nav a {
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    text-decoration: none;
    color: var(--muted);
    font-weight: 600;
  }
  .desktop-nav a.active {
    background: var(--primary-soft);
    color: var(--primary);
  }
  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    height: calc(var(--nav-h) + var(--safe-bottom));
    padding-bottom: var(--safe-bottom);
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  .tabbar a {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--muted);
    text-decoration: none;
    font-size: 0.75rem;
    font-weight: 600;
    -webkit-tap-highlight-color: transparent;
  }
  .tabbar a.active {
    color: var(--primary);
  }
  @media (min-width: 800px) {
    .desktop-nav {
      display: flex;
    }
    .tabbar {
      display: none;
    }
  }
</style>
