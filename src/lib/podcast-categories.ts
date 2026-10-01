import truecrime from "@/assets/cat-truecrime.jpg";
import drama from "@/assets/cat-drama.jpg";
import history from "@/assets/cat-history.jpg";
import interview from "@/assets/cat-interview.jpg";
import society from "@/assets/cat-society.jpg";
import comedy from "@/assets/cat-comedy.jpg";
import science from "@/assets/cat-science.jpg";
import news from "@/assets/cat-news.jpg";
import business from "@/assets/cat-business.jpg";
import wellness from "@/assets/cat-wellness.jpg";

export const PODCAST_CATEGORIES = [
  { name: "True Crime & Mystery", cover: truecrime },
  { name: "Audio Drama & Fiction", cover: drama },
  { name: "History & Documentary", cover: history },
  { name: "Interview & Talk Show", cover: interview },
  { name: "Society & Culture", cover: society },
  { name: "Comedy", cover: comedy },
  { name: "Science & Technology", cover: science },
  { name: "News & Current Affairs", cover: news },
  { name: "Business & Finance", cover: business },
  { name: "Self-Help & Wellness", cover: wellness },
] as const;

export type PodcastCategory = (typeof PODCAST_CATEGORIES)[number]["name"];

/** Reads the category label from an episode row (column may be newer than generated types). */
export function episodeCategory(ep: object): string | null {
  return ((ep as { category?: string | null }).category ?? null) || null;
}
