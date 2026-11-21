<!--
  A button that asks for a second tap instead of the browser's confirm() popup
  (which some in-app browsers block, so the action silently never ran).
  First tap: the label changes to `confirmLabel` (plus an optional note) for a
  few seconds. Second tap: `onconfirm` runs.
-->
<script lang="ts">
  let {
    label,
    confirmLabel,
    note = '',
    onconfirm,
    class: cls = '',
    disabled = false,
    skip = false,
    ariaLabel,
  }: {
    label: string;
    confirmLabel: string;
    note?: string;
    onconfirm: () => unknown;
    class?: string;
    disabled?: boolean;
    /** Run straight away, no second tap (e.g. nothing would be lost). */
    skip?: boolean;
    ariaLabel?: string;
  } = $props();

  let armed = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function disarm() {
    clearTimeout(timer);
    armed = false;
  }

  function click() {
    if (skip || armed) {
      disarm();
      onconfirm();
      return;
    }
    armed = true;
    clearTimeout(timer);
    timer = setTimeout(disarm, 5000);
  }

  $effect(() => () => clearTimeout(timer));
</script>

<span class="confirm">
  <button class={cls} class:armed {disabled} aria-label={armed ? confirmLabel : ariaLabel} onclick={click}>
    {armed ? confirmLabel : label}
  </button>
  {#if armed && note}<span class="note">{note}</span>{/if}
</span>

<style>
  .confirm {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
  }
  .note {
    font-size: 0.85rem;
    color: var(--muted);
    max-width: 22rem;
  }
</style>
