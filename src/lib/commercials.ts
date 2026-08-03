import { supabase } from "@/integrations/supabase/client";
import { etSecondsOfDay, parseScheduleTime, RADIO_TIMEZONE } from "@/lib/youtube";

export type Commercial = {
  id: string;
  title: string;
  youtube_id: string | null;
  audio_url: string | null;
  duration_seconds: number;
  schedule_times: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchCommercials(): Promise<Commercial[]> {
  const { data, error } = await supabase.from("commercials").select("*").order("created_at");
  if (error) { console.error("[commercials]", error); return []; }
  return (data ?? []) as Commercial[];
}

// ISO date key in Massachusetts time — used to scope "played today" state.
export function etDateKey(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RADIO_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export type ActiveCommercial = { commercial: Commercial; key: string; offset: number };

// A commercial is "on air" for exactly its duration starting at its scheduled
// ET time. Every device computes the same slot and the same playback offset,
// so ad breaks are synchronized worldwide just like songs are.
export function activeCommercial(
  commercials: Commercial[],
  now: Date = new Date()
): ActiveCommercial | null {
  const sec = etSecondsOfDay(now);
  const dateKey = etDateKey(now);
  let best: ActiveCommercial | null = null;
  for (const c of commercials) {
    if (!c.active) continue;
    const dur = Number(c.duration_seconds);
    if (!(dur > 0)) continue;
    if (!c.youtube_id && !c.audio_url) continue;
    for (const s of c.schedule_times) {
      const target = parseScheduleTime(s);
      if (target == null) continue;
      const offset = sec - target;
      if (offset < 0 || offset >= dur) continue;
      const cand = { commercial: c, key: `${c.id}:${dateKey}:${target}`, offset };
      // If two ads overlap, the one that started most recently wins.
      if (!best || cand.offset < best.offset) best = cand;
    }
  }
  return best;
}

// Milliseconds until the next scheduled commercial slot fires (looking up to 24h ahead).
export function nextCommercialInfo(
  commercials: Commercial[],
  now: Date = new Date()
): { commercial: Commercial; msUntil: number; scheduleSec: number } | null {
  const sec = etSecondsOfDay(now);
  let best: { commercial: Commercial; delta: number; scheduleSec: number } | null = null;
  for (const c of commercials) {
    if (!c.active) continue;
    for (const s of c.schedule_times) {
      const target = parseScheduleTime(s);
      if (target == null) continue;
      let delta = target - sec;
      if (delta < 0) delta += 86400;
      if (!best || delta < best.delta) best = { commercial: c, delta, scheduleSec: target };
    }
  }
  return best ? { commercial: best.commercial, msUntil: best.delta * 1000, scheduleSec: best.scheduleSec } : null;
}
