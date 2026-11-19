<script lang="ts">
  import { onDestroy } from 'svelte';
  import { CameraScanner, type CameraInfo } from '../lib/scan/camera';
  import { unlockAudio } from '../lib/scan/feedback';
  import { t } from '../lib/strings';

  let { onscan }: { onscan: (isbn: string) => void } = $props();

  let video: HTMLVideoElement | undefined = $state();
  let scanner: CameraScanner | null = null;
  let active = $state(false);
  let starting = $state(false);
  let error = $state('');
  let cameras = $state<CameraInfo[]>([]);
  let cameraId = $state('');
  let torchSupported = $state(false);
  let torchOn = $state(false);
  let flash = $state(false);

  function handle(isbn: string) {
    flash = true;
    setTimeout(() => (flash = false), 350);
    onscan(isbn);
  }

  async function start(deviceId?: string) {
    unlockAudio();
    error = '';
    starting = true;
    active = true;
    try {
      await Promise.resolve();
      scanner ??= new CameraScanner(video!, handle);
      await scanner.start(deviceId);
      torchSupported = scanner.torchSupported;
      torchOn = false;
      cameras = await CameraScanner.listCameras();
      cameraId = scanner.activeDeviceId;
    } catch (e) {
      error = (e as Error).message;
      active = false;
      scanner?.stop();
    } finally {
      starting = false;
    }
  }

  function stop() {
    scanner?.stop();
    active = false;
    torchOn = false;
  }

  async function toggleTorch() {
    await scanner?.setTorch(!torchOn);
    torchOn = scanner?.torchOn ?? false;
    torchSupported = scanner?.torchSupported ?? false;
  }

  // Stop the camera when the page is hidden (saves battery; iOS stops it anyway).
  function onVisibility() {
    if (document.visibilityState === 'hidden' && active) stop();
  }
  document.addEventListener('visibilitychange', onVisibility);
  onDestroy(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    scanner?.stop();
  });
</script>

<div class="scanner">
  <div class="viewport" class:hidden={!active} class:flash>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} playsinline muted autoplay></video>
    <div class="frame" aria-hidden="true"></div>
    {#if starting}<div class="overlay">…</div>{/if}
  </div>

  {#if active}
    <p class="muted small hint">{t.cameraHint}</p>
    <div class="row controls">
      <button class="small" onclick={stop}>{t.stopCamera}</button>
      {#if torchSupported}
        <button class="small" class:on={torchOn} onclick={toggleTorch} aria-pressed={torchOn}>💡 {t.torch}</button>
      {/if}
      {#if cameras.length > 1}
        <label class="visually-hidden" for="camera-select">{t.cameraLabel}</label>
        <select id="camera-select" class="camera-select" bind:value={cameraId} onchange={() => start(cameraId)}>
          {#each cameras as c}<option value={c.deviceId}>{c.label}</option>{/each}
        </select>
      {/if}
    </div>
  {:else}
    <button class="primary wide big" onclick={() => start()} disabled={starting}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
        ><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" /></svg
      >
      {t.startCamera}
    </button>
  {/if}
  {#if error}<p class="error-text" role="alert">{error}</p>{/if}
</div>

<style>
  .viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    max-height: 46vh;
    border-radius: var(--radius);
    overflow: hidden;
    background: #000;
    transition: box-shadow 0.15s;
  }
  .viewport.hidden {
    display: none;
  }
  .viewport.flash {
    box-shadow: 0 0 0 4px var(--ok);
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .frame {
    position: absolute;
    inset: 28% 12%;
    border: 3px solid rgb(255 255 255 / 0.85);
    border-radius: 12px;
    box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.25);
  }
  .flash .frame {
    border-color: #6ee77a;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 2rem;
  }
  .hint {
    margin: 0.5rem 0;
  }
  .controls {
    margin-top: 0.25rem;
  }
  .camera-select {
    width: auto;
    flex: 1;
    min-width: 0;
    min-height: 36px;
    padding: 0.3rem 0.6rem;
  }
  button.on {
    background: var(--warn-soft);
  }
  .big {
    min-height: 56px;
    font-size: 1.05rem;
  }
</style>
