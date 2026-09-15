import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PodcastEpisode = Tables<"podcast_episodes">;

export async function fetchEpisodes(): Promise<PodcastEpisode[]> {
  const { data, error } = await supabase
    .from("podcast_episodes")
    .select("*")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function episodeThumb(ep: PodcastEpisode): string | null {
  if (ep.cover_url) return ep.cover_url;
  if (ep.youtube_id) return `https://i.ytimg.com/vi/${ep.youtube_id}/hqdefault.jpg`;
  return null;
}

export function formatEpisodeDate(iso: string, locale = "en-US"): string {
  try {
    return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export async function countPlay(ep: PodcastEpisode): Promise<void> {
  await supabase
    .from("podcast_episodes")
    .update({ plays: Number(ep.plays ?? 0) + 1 })
    .eq("id", ep.id);
}
