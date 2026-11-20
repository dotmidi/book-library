<script lang="ts">
  import { library } from '../lib/store/library.svelte';
  import { locationFlag, suggestLocations } from '../lib/countries';
  import { uniqueSorted } from '../lib/search';
  import { t } from '../lib/strings';

  let { value = $bindable(''), id }: { value?: string; id: string } = $props();
  let open = $state(false);
  let active = $state(-1);
  let wrapper: HTMLDivElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();

  const used = $derived(uniqueSorted(library.books.map((b) => b.location)));
  // All matching countries (≈250 when nothing is typed); the list scrolls.
  const suggestions = $derived(open ? suggestLocations(value, used) : []);
  const flag = $derived(locationFlag(value));

  function pick(v: string) {
    value = v;
    open = false;
    active = -1;
  }

  function onKey(e: KeyboardEvent) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % suggestions.length;
      scrollActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + suggestions.length) % suggestions.length;
      scrollActive();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(suggestions[active].value);
    } else if (e.key === 'Escape') {
      open = false;
    }
  }

  function scrollActive() {
    queueMicrotask(() => list?.querySelectorAll('li')[active]?.scrollIntoView({ block: 'nearest' }));
  }

  // Close only when focus leaves the whole control (so scrolling or clicking the list keeps it open).
  function onFocusOut(e: FocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (!next || !wrapper?.contains(next)) open = false;
  }
</script>

<div class="loc" bind:this={wrapper} onfocusout={onFocusOut}>
  <div class="field-wrap">
    {#if flag}<span class="flag" aria-hidden="true">{flag}</span>{/if}
    <input
      {id}
      bind:value
      class:has-flag={flag}
      autocomplete="off"
      placeholder={t.locationPlaceholder}
      role="combobox"
      aria-expanded={suggestions.length > 0}
      aria-controls="{id}-list"
      onfocus={() => (open = true)}
      onclick={() => (open = true)}
      oninput={() => {
        open = true;
        active = -1;
      }}
      onkeydown={onKey}
    />
  </div>
  {#if suggestions.length}
    <!-- tabindex lets the list (and its scrollbar) take focus without closing it -->
    <ul class="suggest" id="{id}-list" role="listbox" tabindex="-1" bind:this={list}>
      {#each suggestions as s, i (s.value)}
        <li role="option" aria-selected={i === active}>
          <button type="button" tabindex="-1" class:active={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => pick(s.value)}>
            <span class="flag">{s.flag || '📍'}</span>{s.label}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .loc {
    position: relative;
  }
  .field-wrap {
    position: relative;
  }
  .field-wrap .flag {
    position: absolute;
    left: 0.7rem;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
  }
  input.has-flag {
    padding-left: 2.3rem;
  }
  .suggest {
    position: absolute;
    z-index: 40;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    margin: 0;
    padding: 0.25rem;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow);
    max-height: min(18rem, 45vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .suggest:focus {
    outline: none;
  }
  .suggest button {
    width: 100%;
    justify-content: flex-start;
    border: 0;
    border-radius: 8px;
    min-height: 40px;
    font-weight: 500;
    background: transparent;
  }
  .suggest button.active,
  .suggest button:hover {
    background: var(--primary-soft);
  }
  .suggest .flag {
    width: 1.6rem;
    display: inline-block;
  }
</style>
