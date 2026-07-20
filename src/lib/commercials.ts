import { supabase } from "@/integrations/supabase/client";
import { etSecondsOfDay, parseScheduleTime } from "@/lib/youtube";

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

// Returns the commercial currently active in Massachusetts time, plus offset in seconds.
export function currentCommercial(
  commercials: Commercial[],
  now: Date = new Date()
): { commercial: Commercial; offset: number } | null {
  const sec = etSecondsOfDay(now);
  for (const c of commercials) {
    if (!c.active) continue;
    const dur = Number(c.duration_seconds);
    if (!(dur > 0)) continue;
    for (const s of c.schedule_times) {
      const target = parseScheduleTime(s);
      if (target == null) continue;
      const delta = sec - target;
      if (delta >= 0 && delta < dur) {
        return { commercial: c, offset: delta };
      }
    }
  }
  return null;
}
