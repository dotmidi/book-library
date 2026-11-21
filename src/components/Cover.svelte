<script lang="ts">
  import type { Book } from '../lib/types';
  import { sharpCover } from '../lib/lookup/covers';

  let { book, size = 'md' }: { book: Book; size?: 'sm' | 'md' | 'lg' } = $props();
  let failed = $state(false);
  $effect(() => {
    void book.cover_url;
    failed = false;
  });

  const hue = $derived.by(() => {
    let h = 0;
    for (const c of book.title || book.isbn13) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  });
  const src = $derived(book.cover_url && !failed ? sharpCover(book.cover_url) : '');
</script>

<div class="cover {size}" style="--hue: {hue}">
  {#if src}
    <img {src} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror={() => (failed = true)} />
  {:else}
    <div class="placeholder">
      <span class="ptitle">{book.title || book.isbn13 || book.barcode || '?'}</span>
      {#if book.authors[0]}<span class="pauthor">{book.authors[0]}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .cover {
    aspect-ratio: 2 / 3;
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface-2);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
    flex-shrink: 0;
  }
  .cover.sm {
    width: 48px;
  }
  .cover.md {
    width: 100%;
  }
  .cover.lg {
    width: min(180px, 45vw);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 10%;
    background: linear-gradient(160deg, hsl(var(--hue) 35% 45%), hsl(calc(var(--hue) + 30) 35% 30%));
    color: #fff;
    overflow: hidden;
  }
  .ptitle {
    font-weight: 700;
    font-size: 0.8rem;
    line-height: 1.15;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
  .pauthor {
    font-size: 0.65rem;
    opacity: 0.85;
  }
  .sm .ptitle {
    font-size: 0.5rem;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }
  .sm .pauthor {
    display: none;
  }
  .lg .ptitle {
    font-size: 1rem;
  }
  .lg .pauthor {
    font-size: 0.8rem;
  }
</style>
