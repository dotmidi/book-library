<script lang="ts">
  import { library } from '../lib/store/library.svelte';
  import { locationFlag, suggestLocations } from '../lib/countries';
  import { uniqueSorted } from '../lib/search';
  import { t } from '../lib/strings';

  let { value = $bindable(''), id }: { value?: string; id: string } = $props();
  let open = $state(false);
  let active = $state(-1);

  const used = $derived(uniqueSorted(library.books.map((b) => b.location)));
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
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(suggestions[active].value);
    } else if (e.key === 'Escape') {
      open = false;
    }
  }
</script>

<div class="loc">
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
      oninput={() => {
        open = true;
        active = -1;
      }}
      onblur={() => setTimeout(() => (open = false), 150)}
      onkeydown={onKey}
    />
  </div>
  {#if suggestions.length}
    <ul class="suggest" id="{id}-list" role="listbox">
      {#each suggestions as s, i}
        <li role="option" aria-selected={i === active}>
          <button type="button" class:active={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => pick(s.value)}>
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
    z-index: 15;
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
    max-height: 16rem;
    overflow-y: auto;
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
