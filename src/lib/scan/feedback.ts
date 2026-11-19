/**
 * Scan feedback. iPhone Safari has no vibration API, so we always beep too.
 * Audio must be "unlocked" by a tap (call unlockAudio from the Start camera button).
 */
let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, ms: number, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + ms / 1000 + 0.02);
}

export function scanFeedback(kind: 'ok' | 'duplicate' | 'error' = 'ok') {
  try {
    navigator.vibrate?.(kind === 'ok' ? 60 : [40, 60, 40]);
  } catch {
    /* not supported */
  }
  if (kind === 'ok') tone(1400, 90);
  else if (kind === 'duplicate') {
    tone(900, 80);
    tone(900, 80, 0.13);
  } else tone(300, 200);
}
