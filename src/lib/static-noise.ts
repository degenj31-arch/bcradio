// "Tuning in" static effect.
// Uses an HTMLAudioElement playing a generated WAV blob — works reliably
// inside sandboxed iframes (Lovable preview) where WebAudio can be muted.

export type StaticHandle = {
  stop: () => void;
  fadeOut: (seconds: number) => void;
};

function buildNoiseWav(seconds = 2, sampleRate = 22050, volume = 0.7): Blob {
  const numSamples = Math.floor(seconds * sampleRate);
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let last = 0;
  for (let i = 0; i < numSamples; i++) {
    // pinkish noise: low-pass a bit so it sounds like radio fuzz, not harsh hiss
    const w = Math.random() * 2 - 1;
    last = last * 0.6 + w * 0.4;
    const s = Math.max(-1, Math.min(1, last * volume));
    view.setInt16(44 + i * 2, s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

let cachedUrl: string | null = null;
function noiseUrl(): string {
  if (cachedUrl) return cachedUrl;
  cachedUrl = URL.createObjectURL(buildNoiseWav(2, 22050, 0.8));
  return cachedUrl;
}

export function startStatic(volume = 0.5): StaticHandle {
  const audio = new Audio(noiseUrl());
  audio.loop = true;
  audio.volume = volume;
  audio.preload = "auto";
  // play() returns a promise — swallow rejections (already handled at call site)
  const p = audio.play();
  if (p && typeof p.catch === "function") p.catch((e) => console.warn("[static] play blocked:", e));

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { audio.pause(); audio.src = ""; } catch { /* noop */ }
  };
  const fadeOut = (seconds: number) => {
    const startVol = audio.volume;
    const steps = 20;
    const stepMs = (seconds * 1000) / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      audio.volume = Math.max(0, startVol * (1 - i / steps));
      if (i >= steps) {
        clearInterval(id);
        stop();
      }
    }, stepMs);
  };
  return { stop, fadeOut };
}
