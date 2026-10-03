import type { Station, Song } from "@/lib/radio";

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic, time-based fake listener count for a station. All clients
// worldwide compute the same value from Date.now() so the numbers agree.
export function stationListenerCount(st: Station, nowMs: number = Date.now()): number {
  const avg = Number((st as unknown as { avg_listeners?: number }).avg_listeners ?? 50);
  const fluct = Number((st as unknown as { fluctuation?: number }).fluctuation ?? 15);
  const rate = Math.max(1, Number((st as unknown as { fluctuation_rate_seconds?: number }).fluctuation_rate_seconds ?? 60));
  const seed = hashStr(st.id);
  const phase1 = (seed % 1000) / 1000 * Math.PI * 2;
  const phase2 = ((seed >>> 10) % 1000) / 1000 * Math.PI * 2;
  const t = nowMs / 1000 / rate;
  const a = Math.sin(t * 2 * Math.PI + phase1);
  const b = Math.sin(t * 2 * Math.PI * 0.37 + phase2);
  const v = a * 0.7 + b * 0.3;
  return Math.max(0, Math.round(avg + fluct * v));
}

export function totalListeners(stations: Station[], nowMs: number = Date.now()): number {
  let total = 0;
  for (const s of stations) total += stationListenerCount(s, nowMs);
  return total;
}

// Deterministic seeded Fisher-Yates. Same seed → same order everywhere.
export function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  const a = arr.slice();
  let s = hashStr(seedStr) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// HD-2 plays the same ordered playlist as the main station, offset by 10
// songs ahead (wrapping around), so it stays deterministic worldwide.
export const HD2_OFFSET = 10;

export function hd2Playlist(_stationId: string, songs: Song[]): Song[] {
  if (songs.length === 0) return songs;
  const off = HD2_OFFSET % songs.length;
  return songs.slice(off).concat(songs.slice(0, off));
}
