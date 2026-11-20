<script lang="ts">
  import { CATEGORIES } from '../lib/categories';
  import { library } from '../lib/store/library.svelte';
  import { uniqueSorted } from '../lib/search';
  import { t } from '../lib/strings';

  let { value = $bindable(''), id }: { value?: string; id: string } = $props();

  // Built-in categories plus any custom ones already used in the library.
  const options = $derived(
    uniqueSorted([...CATEGORIES, ...library.books.map((b) => b.category)]).sort(
      (a, b) => (CATEGORIES.indexOf(a) + 1 || 99) - (CATEGORIES.indexOf(b) + 1 || 99),
    ),
  );
  let custom = $state(false);
</script>

<div class="cats" role="radiogroup" aria-labelledby="{id}-label">
  {#each options as c}
    <button type="button" class="chipbtn" class:on={value === c} role="radio" aria-checked={value === c} onclick={() => (value = value === c ? '' : c)}>
      {c}
    </button>
  {/each}
  <button type="button" class="chipbtn own" aria-expanded={custom} onclick={() => (custom = !custom)}>{t.otherCategory}</button>
</div>
{#if custom}
  <input {id} bind:value placeholder={t.customCategory} autocomplete="off" class="custom" />
{/if}

<style>
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chipbtn {
    min-height: 34px;
    padding: 0.2rem 0.75rem;
    font-size: 0.88rem;
    font-weight: 600;
  }
  .chipbtn.on {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--primary-ink);
  }
  .chipbtn.own {
    border-style: dashed;
    background: transparent;
  }
  .custom {
    margin-top: 0.5rem;
  }
</style>
