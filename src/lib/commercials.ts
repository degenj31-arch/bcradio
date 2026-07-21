import { supabase } from "@/integrations/supabase/client";
import { etSecondsOfDay, parseScheduleTime, RADIO_TIMEZONE } from "@/lib/youtube";

export type Commercial = {
  id: string;
  title: string;
  youtube_id: string;
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

// Find a scheduled commercial slot that has recently fired (within `windowMinutes`)
// and hasn't yet been played (per `playedKeys`). Returns the most recent unplayed
// slot. Commercials play AFTER the current song finishes, so they may desync
// between listeners — that's intentional.
export function findPendingCommercial(
  commercials: Commercial[],
  playedKeys: Set<string>,
  now: Date = new Date(),
  windowMinutes: number = 45
): { commercial: Commercial; key: string } | null {
  const sec = etSecondsOfDay(now);
  const dateKey = etDateKey(now);
  const windowSec = windowMinutes * 60;
  let best: { commercial: Commercial; key: string; delta: number } | null = null;
  for (const c of commercials) {
    if (!c.active) continue;
    if (!(Number(c.duration_seconds) > 0)) continue;
    for (const s of c.schedule_times) {
      const target = parseScheduleTime(s);
      if (target == null) continue;
      const delta = sec - target;
      if (delta < 0 || delta > windowSec) continue;
      const key = `${c.id}:${dateKey}:${target}`;
      if (playedKeys.has(key)) continue;
      if (!best || delta < best.delta) best = { commercial: c, key, delta };
    }
  }
  return best ? { commercial: best.commercial, key: best.key } : null;
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

