<script lang="ts">
  import { onMount } from 'svelte';
  import ConfirmButton from '../components/ConfirmButton.svelte';
  import { friends } from '../lib/friends/store.svelte';
  import { shareLink } from '../lib/friends/sharing';
  import type { SharedLibrary } from '../lib/friends/publicRead';
  import { go, router } from '../lib/router.svelte';
  import { library } from '../lib/store/library.svelte';
  import { toast } from '../lib/toast.svelte';
  import { t } from '../lib/strings';

  let name = $state('');
  let renaming = $state(false);
  let addInput = $state('');
  let adding = $state(false);
  let addError = $state('');
  let candidate = $state<SharedLibrary | null>(null);

  const link = $derived(friends.myCode ? shareLink(friends.myCode) : '');

  onMount(async () => {
    await friends.load();
    // Fetch every friend's library in the background so the list shows book counts right away.
    friends.preloadAll();
    name = friends.displayName;
    // Opened from a friend's share link: #/friends?add=CODE
    const code = router.route.query.get('add');
    if (code) {
      addInput = code;
      await check();
      go('/friends', { replace: true });
    }
  });

  async function check(e?: Event) {
    e?.preventDefault();
    addError = '';
    candidate = null;
    adding = true;
    const r = await friends.preview(addInput);
    adding = false;
    if (r.error) addError = r.error;
    else candidate = r.lib ?? null;
  }

  async function confirmAdd() {
    if (!candidate) return;
    await friends.add(candidate);
    if (!friends.error) {
      toast.show(t.friendAdded(candidate.name || '?'));
      candidate = null;
      addInput = '';
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(t.copied);
    } catch {
      prompt(t.copyThis, text);
    }
  }

  async function shareNative() {
    try {
      await navigator.share({ title: t.appName, text: t.shareText(friends.displayName), url: link });
    } catch {
      /* cancelled */
    }
  }

  async function startSharing(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    await friends.share(name);
  }

  async function stopSharing() {
    await friends.unshare();
  }
</script>

<div class="page narrow stack">
  <h1>{t.friendsTitle}</h1>

  {#if friends.error}<p class="card error">{friends.error}</p>{/if}

  <section class="card stack">
    <h2>{t.shareMyLibrary}</h2>
    {#if !friends.loaded && friends.loading}
      <p class="muted">…</p>
    {:else if !friends.sharing}
      <p>{t.shareIntro}</p>
      <p class="small warn">{t.shareWarning}</p>
      <form class="stack" onsubmit={startSharing}>
        <div>
          <label for="share-name">{t.yourNameForFriends}</label>
          <input id="share-name" bind:value={name} autocomplete="nickname" maxlength="40" required />
        </div>
        <button type="submit" class="primary" disabled={!name.trim() || friends.busy || !library.spreadsheetId}>{t.startSharing}</button>
      </form>
    {:else}
      <p>
        {t.sharingAs}
        {#if renaming}
          <span class="row inline">
            <input bind:value={name} maxlength="40" aria-label={t.yourNameForFriends} />
            <button class="small primary" disabled={!name.trim() || friends.busy} onclick={async () => ((await friends.rename(name)), (renaming = false))}>{t.save}</button>
          </span>
        {:else}
          <strong>{friends.displayName}</strong>
          <button class="small ghost" onclick={() => ((name = friends.displayName), (renaming = true))}>{t.edit}</button>
        {/if}
      </p>
      <p class="small muted">{t.sendThisLink}</p>
      <div class="codebox">
        <code>{link}</code>
      </div>
      <div class="row">
        <button class="primary" onclick={() => copy(link)}>{t.copyLink}</button>
        {#if typeof navigator !== 'undefined' && 'share' in navigator}<button onclick={shareNative}>{t.shareEllipsis}</button>{/if}
        <button class="ghost small" onclick={() => copy(friends.myCode)}>{t.copyCodeOnly}</button>
      </div>
      <p class="small warn">{t.shareWarning}</p>
      <ConfirmButton class="danger" disabled={friends.busy} label={t.stopSharing} confirmLabel={t.confirmStopSharing} note={t.stopSharingNote} onconfirm={stopSharing} />
    {/if}
  </section>

  <section class="card stack">
    <h2>{t.friendsLibraries}</h2>
    {#if friends.friends.length === 0}
      <p class="muted">{t.noFriendsYet}</p>
    {:else}
      <ul class="flist">
        {#each friends.friends as f (f.code)}
          <li>
            <a href="#/friends/{f.code}">
              <span class="avatar" aria-hidden="true">{(f.name || '?').slice(0, 1).toUpperCase()}</span>
              <span class="fname">{t.friendLibraryName(f.name || '?')}</span>
              <span class="muted small count">
                {#if friends.libraries[f.code]}
                  {t.bookCount(friends.libraries[f.code].books.filter((b) => !b.wishlist).length)}
                {:else if friends.libraryErrors[f.code]}
                  {t.notSharedShort}
                {:else}
                  …
                {/if}
              </span>
            </a>
            <ConfirmButton class="small ghost" ariaLabel={t.removeFriend} label="✕" confirmLabel={t.confirmRemove} onconfirm={() => friends.remove(f.code)} />
          </li>
        {/each}
      </ul>
    {/if}

    <form class="stack" onsubmit={check}>
      <label for="add-friend">{t.addFriendLabel}</label>
      <div class="row nowrap">
        <input id="add-friend" bind:value={addInput} placeholder={t.addFriendPlaceholder} autocomplete="off" />
        <button type="submit" disabled={!addInput.trim() || adding}>{adding ? '…' : t.lookUp}</button>
      </div>
      {#if addError}<p class="error-text">{addError}</p>{/if}
    </form>
    {#if candidate}
      <div class="candidate">
        <p>{t.addFriendQuestion(candidate.name || '?', candidate.books.filter((b) => !b.wishlist).length)}</p>
        <div class="row">
          <button class="primary" disabled={friends.busy} onclick={confirmAdd}>{t.addFriend}</button>
          <a class="button" href="#/friends/{candidate.code}">{t.view}</a>
          <button class="ghost" onclick={() => (candidate = null)}>{t.cancel}</button>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .narrow {
    max-width: 640px;
  }
  .stack > p,
  form.stack {
    margin-bottom: 0;
  }
  .warn {
    background: var(--warn-soft);
    border-radius: 10px;
    padding: 0.5rem 0.75rem;
  }
  .error {
    background: var(--danger-soft);
  }
  .codebox {
    background: var(--surface-2);
    border-radius: 10px;
    padding: 0.6rem 0.75rem;
    overflow-wrap: anywhere;
    font-size: 0.85rem;
  }
  .inline {
    display: inline-flex;
    flex-wrap: nowrap;
  }
  .inline input {
    width: 12rem;
    min-height: 36px;
  }
  .nowrap {
    flex-wrap: nowrap;
  }
  .nowrap input {
    flex: 1;
  }
  .flist {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .flist li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .flist li + li {
    border-top: 1px solid var(--border);
  }
  .flist a {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0;
    color: inherit;
    text-decoration: none;
  }
  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--primary-soft);
    color: var(--primary);
    font-weight: 700;
  }
  .fname {
    font-weight: 600;
    flex: 1;
  }
  /* Fixed width so the row doesn't shift when the count arrives. */
  .count {
    min-width: 5.5rem;
    text-align: right;
  }
  .candidate {
    background: var(--ok-soft);
    border-radius: 12px;
    padding: 0.75rem;
  }
  .candidate p {
    margin-bottom: 0.5rem;
  }
</style>
