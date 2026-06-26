import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Station = Tables<"stations">;
export type Song = Tables<"songs">;

// Sync epoch: all clients compute current position relative to this point.
// Using Unix epoch — Date.now()/1000 is identical worldwide (UTC).
export const SYNC_EPOCH_SEC = 0;

export function currentPlayhead(songs: Song[], nowMs = Date.now()):
  | { song: Song; offset: number; index: number; totalDuration: number }
  | null {
  if (!songs.length) return null;
  const total = songs.reduce((s, x) => s + Number(x.duration_seconds || 0), 0);
  if (total <= 0) return null;
  const t = ((nowMs / 1000 - SYNC_EPOCH_SEC) % total + total) % total;
  let acc = 0;
  for (let i = 0; i < songs.length; i++) {
    const d = Number(songs[i].duration_seconds);
    if (t < acc + d) {
      return { song: songs[i], offset: t - acc, index: i, totalDuration: total };
    }
    acc += d;
  }
  const last = songs[songs.length - 1];
  return { song: last, offset: Number(last.duration_seconds) - 0.05, index: songs.length - 1, totalDuration: total };
}

const signedCache = new Map<string, { url: string; expires: number }>();

export async function getPlayableUrl(path: string): Promise<string> {
  const now = Date.now();
  const cached = signedCache.get(path);
  if (cached && cached.expires > now + 60_000) return cached.url;
  // 1 year signed url
  const { data, error } = await supabase.storage
    .from("radio-audio")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (error || !data) throw error ?? new Error("Failed to sign url");
  signedCache.set(path, { url: data.signedUrl, expires: now + 1000 * 60 * 60 * 24 * 364 });
  return data.signedUrl;
}

export async function extractDuration(file: File): Promise<number> {
  const isVideo = file.type.startsWith("video/");
  const el = document.createElement(isVideo ? "video" : "audio") as HTMLMediaElement;
  el.preload = "metadata";
  const url = URL.createObjectURL(file);
  el.src = url;
  try {
    await new Promise<void>((res, rej) => {
      el.onloadedmetadata = () => res();
      el.onerror = () => rej(new Error("Could not read media metadata"));
      setTimeout(() => rej(new Error("Metadata load timed out")), 15000);
    });
    const d = el.duration;
    if (!isFinite(d) || d <= 0) throw new Error("Invalid duration");
    return d;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadAudio(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("radio-audio")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export function fmtTime(sec: number): string {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
