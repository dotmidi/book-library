<script lang="ts">
  import { library } from '../lib/store/library.svelte';
  import { t } from '../lib/strings';

  type Bar = { label: string; value: number };

  function countBy(values: string[]): Bar[] {
    const m = new Map<string, { label: string; value: number }>();
    for (const raw of values) {
      const label = raw.trim() || t.unknown;
      const key = label.toLowerCase();
      const e = m.get(key) ?? { label, value: 0 };
      e.value++;
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }

  const books = $derived(library.books.filter((b) => b.status !== 'wishlist'));
  const total = $derived(books.length);
  const copies = $derived(books.reduce((n, b) => n + (b.copies || 1), 0));
  const lent = $derived(books.filter((b) => b.status === 'lent').length);
  const byLanguage = $derived(countBy(books.map((b) => b.language)));
  const byLocation = $derived(countBy(books.map((b) => b.location)));
  const byStatus = $derived(countBy(library.books.map((b) => t.status[b.status] ?? b.status)));

  const perMonth = $derived.by(() => {
    const now = new Date();
    const months: Bar[] = [];
    const counts = new Map<string, number>();
    for (const b of library.books) {
      const m = /^(\d{4})-(\d{2})/.exec(b.date_added);
      if (m) counts.set(`${m[1]}-${m[2]}`, (counts.get(`${m[1]}-${m[2]}`) ?? 0) + 1);
    }
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ label: d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), value: counts.get(key) ?? 0 });
    }
    return months;
  });
  const monthMax = $derived(Math.max(1, ...perMonth.map((m) => m.value)));
</script>

{#snippet bars(title: string, items: Bar[])}
  <section class="card">
    <h2>{title}</h2>
    {#if items.length === 0}
      <p class="muted">—</p>
    {:else}
      {@const max = Math.max(...items.map((i) => i.value))}
      <ul class="bars">
        {#each items.slice(0, 12) as item}
          <li>
            <span class="label">{item.label}</span>
            <span class="track"><span class="fill" style="width: {(item.value / max) * 100}%"></span></span>
            <span class="value">{item.value}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

<div class="page">
  <h1>{t.statsTitle}</h1>
  <div class="tiles">
    <div class="card tile"><span class="big">{total}</span><span class="muted">{t.totalBooks}</span></div>
    <div class="card tile"><span class="big">{copies}</span><span class="muted">{t.totalCopies}</span></div>
    <div class="card tile"><span class="big">{lent}</span><span class="muted">{t.lentOut}</span></div>
  </div>

  <section class="card">
    <h2>{t.perMonth}</h2>
    <div class="months" role="img" aria-label={t.perMonth}>
      {#each perMonth as m}
        <div class="month" title="{m.label}: {m.value}">
          <span class="mval">{m.value || ''}</span>
          <span class="mtrack"><span class="mbar" style="height: {(m.value / monthMax) * 100}%"></span></span>
          <span class="mlabel">{m.label}</span>
        </div>
      {/each}
    </div>
  </section>

  <div class="two">
    {@render bars(t.byLanguage, byLanguage)}
    {@render bars(t.byLocation, byLocation)}
  </div>
  {@render bars(t.byStatus, byStatus)}
</div>

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.9rem 0.5rem;
  }
  .big {
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--primary);
    font-variant-numeric: tabular-nums;
  }
  section {
    margin-bottom: 1rem;
  }
  .two {
    display: grid;
    gap: 0 1rem;
  }
  @media (min-width: 800px) {
    .two {
      grid-template-columns: 1fr 1fr;
    }
  }
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .bars li {
    display: grid;
    grid-template-columns: minmax(5rem, 9rem) 1fr 2.5rem;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.92rem;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track {
    height: 12px;
    background: var(--surface-2);
    border-radius: 999px;
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--primary);
    border-radius: 999px;
  }
  .value {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .months {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 4px;
    height: 160px;
    align-items: end;
  }
  .month {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    min-width: 0;
  }
  .mbar {
    width: 70%;
    min-height: 2px;
    background: var(--primary);
    border-radius: 4px 4px 0 0;
  }
  .mval {
    font-size: 0.7rem;
    font-weight: 600;
  }
  .mlabel {
    font-size: 0.62rem;
    color: var(--muted);
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    max-width: 100%;
  }
  .mtrack {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    min-height: 0;
  }
</style>
