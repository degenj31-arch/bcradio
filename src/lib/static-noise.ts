// White-noise "tuning in" effect using WebAudio.
// Must be created from a user gesture (click) to satisfy autoplay policies.

export type StaticHandle = {
  ctx: AudioContext;
  stop: () => void;
  fadeOut: (seconds: number) => void;
};

export function startStatic(volume = 0.12): StaticHandle {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const bufLen = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    // Pink-ish noise — softer than pure white
    data[i] = (Math.random() * 2 - 1) * 0.7 + (Math.random() * 2 - 1) * 0.3;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  // Bandpass for radio-static feel
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { src.stop(); } catch { /* noop */ }
    setTimeout(() => ctx.close().catch(() => {}), 50);
  };
  const fadeOut = (seconds: number) => {
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0.0001, t + seconds);
    setTimeout(stop, seconds * 1000 + 100);
  };
  return { ctx, stop, fadeOut };
}
