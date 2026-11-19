/**
 * Continuous barcode scanning from the camera.
 * Uses the browser's own BarcodeDetector when it exists (Android Chrome), and
 * otherwise ZXing compiled to WebAssembly (iPhone Safari, Windows browsers).
 */
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { isBooklandEan, isValidIsbn10 } from '../isbn';

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
}

let detectorPromise: Promise<Detector> | null = null;

async function createDetector(): Promise<Detector> {
  const Native = (globalThis as unknown as { BarcodeDetector?: { new (o: unknown): Detector; getSupportedFormats(): Promise<string[]> } })
    .BarcodeDetector;
  if (Native) {
    try {
      const formats = await Native.getSupportedFormats();
      if (formats.includes('ean_13')) return new Native({ formats: ['ean_13'] });
    } catch {
      /* fall through to the WebAssembly detector */
    }
  }
  const mod = await import('barcode-detector/ponyfill');
  mod.prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  });
  return new mod.BarcodeDetector({ formats: ['ean_13'] }) as unknown as Detector;
}

/** Start loading the scanner engine early (e.g. when the Add page opens). */
export function preloadDetector(): Promise<Detector> {
  detectorPromise ??= createDetector().catch((e) => {
    detectorPromise = null;
    throw e;
  });
  return detectorPromise;
}

export interface CameraInfo {
  deviceId: string;
  label: string;
}

const CAMERA_KEY = 'bl.cameraId';

export class CameraScanner {
  private stream: MediaStream | null = null;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastCode = '';
  private lastSeen = 0;
  torchSupported = false;
  torchOn = false;

  constructor(
    private video: HTMLVideoElement,
    private onCode: (isbn: string) => void,
    /** The same code is ignored while it stays in view, and for this long after. */
    private repeatMs = 4000,
  ) {}

  static async listCameras(): Promise<CameraInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
  }

  static savedCameraId(): string {
    try {
      return localStorage.getItem(CAMERA_KEY) ?? '';
    } catch {
      return '';
    }
  }

  async start(deviceId?: string): Promise<void> {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot use the camera. Type the ISBN instead, or open the app in Safari or Chrome.');
    }
    const detector = await preloadDetector();
    const id = deviceId ?? CameraScanner.savedCameraId();
    const video: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      ...(id ? { deviceId: { exact: id } } : { facingMode: { ideal: 'environment' } }),
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      if (id && (e as Error).name === 'OverconstrainedError') {
        // Saved camera is gone (e.g. webcam unplugged): fall back to any camera.
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } else {
        throw friendlyCameraError(e);
      }
    }
    if (deviceId) {
      try {
        localStorage.setItem(CAMERA_KEY, deviceId);
      } catch {
        /* ignore */
      }
    }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', 'true');
    this.video.muted = true;
    await this.video.play().catch(() => {});

    const track = this.stream.getVideoTracks()[0];
    const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
    this.torchSupported = Boolean(caps.torch);
    this.torchOn = false;

    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
        try {
          const codes = await detector.detect(this.video);
          this.handle(codes.map((c) => c.rawValue));
        } catch {
          /* a frame failed to decode: try the next one */
        }
      }
      this.timer = setTimeout(tick, 120);
    };
    tick();
  }

  private handle(values: string[]) {
    const now = Date.now();
    const isbn = values.map((v) => v.replace(/\D/g, '')).find((v) => isBooklandEan(v) || isValidIsbn10(v));
    if (!isbn) return;
    if (isbn === this.lastCode && now - this.lastSeen < this.repeatMs) {
      this.lastSeen = now;
      return;
    }
    this.lastCode = isbn;
    this.lastSeen = now;
    this.onCode(isbn);
  }

  async setTorch(on: boolean) {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      this.torchOn = on;
    } catch {
      this.torchSupported = false;
    }
  }

  get activeDeviceId(): string {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId ?? '';
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}

function friendlyCameraError(e: unknown): Error {
  const name = (e as Error)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new Error('The app is not allowed to use the camera. Allow camera access for this site in your browser settings, then try again.');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new Error('No camera was found on this device.');
  if (name === 'NotReadableError') return new Error('The camera is being used by another app. Close it and try again.');
  return new Error(`The camera could not start (${(e as Error)?.message ?? name}).`);
}
