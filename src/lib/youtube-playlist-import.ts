// Playlist import with two strategies:
// 1) Server reads the playlist (fast, but YouTube sometimes blocks server IPs).
// 2) Fallback: the user's own browser loads the playlist in a hidden YouTube player
//    and reads each video's id, title and duration — never rate-limited.
import { fetchYouTubePlaylist, type PlaylistItem } from "@/lib/youtube-playlist.functions";
import { loadYouTubeAPI } from "@/lib/youtube";

export function extractPlaylistIdClient(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{12,60}$/.test(s) && /^(PL|UU|OL|LL|FL|RD)/.test(s)) return s;
  try {
    const list = new URL(s).searchParams.get("list");
    if (list && /^[A-Za-z0-9_-]{12,60}$/.test(list)) return list;
  } catch { /* not a url */ }
  return null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readViaBrowser(
  listId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<PlaylistItem[]> {
  const YT = await loadYouTubeAPI();
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;right:0;bottom:0;width:240px;height:135px;opacity:0.01;pointer-events:none;z-index:-1;";
  const inner = document.createElement("div");
  holder.appendChild(inner);
  document.body.appendChild(holder);

  let player: YT.Player | null = null;
  try {
    player = await new Promise<YT.Player>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("YouTube player didn't load")), 20000);
      new YT.Player(inner, {
        width: 240,
        height: 135,
        playerVars: { listType: "playlist", list: listId, autoplay: 0, mute: 1, controls: 0, playsinline: 1 },
        events: {
          onReady: (e) => { clearTimeout(t); resolve(e.target); },
          onError: () => { /* individual video errors are handled per item */ },
        },
      });
    });

    let ids: string[] = [];
    for (let i = 0; i < 40 && !ids.length; i++) {
      ids = (player.getPlaylist?.() ?? []).filter(Boolean);
      if (!ids.length) {
        if (i === 5) { try { player.mute(); player.playVideo(); } catch { /* noop */ } }
        await wait(300);
      }
    }
    if (!ids.length) throw new Error("Could not read that playlist. Make sure it is public or unlisted, not private.");

    const items: PlaylistItem[] = [];
    player.mute();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      let title = "";
      let duration = 0;
      try {
        player.playVideoAt?.(i);
        for (let k = 0; k < 30; k++) {
          await wait(250);
          const vd = player.getVideoData?.();
          if (vd?.video_id === id) {
            title = vd.title || title;
            duration = player.getDuration() || 0;
            if (title && duration > 0) break;
          }
        }
      } catch { /* keep defaults */ }
      items.push({ videoId: id, title: title || `Video ${id}`, durationSeconds: Math.round(duration) });
      onProgress?.(i + 1, ids.length);
    }
    return items;
  } finally {
    try { player?.destroy(); } catch { /* noop */ }
    holder.remove();
  }
}

export async function importYouTubePlaylist(
  url: string,
  onProgress?: (done: number, total: number) => void,
): Promise<PlaylistItem[]> {
  const listId = extractPlaylistIdClient(url);
  if (!listId) throw new Error("That doesn't look like a YouTube playlist link (it needs a ?list=… part).");
  try {
    const { items } = await fetchYouTubePlaylist({ data: { url } });
    if (items.length) return items;
  } catch (e) {
    console.warn("[playlist] server read failed, using browser fallback", e);
  }
  return readViaBrowser(listId, onProgress);
}
