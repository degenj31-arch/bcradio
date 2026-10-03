import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PlaylistItem = {
  videoId: string;
  title: string;
  durationSeconds: number;
};

function extractPlaylistId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{12,60}$/.test(s) && /^(PL|UU|OL|LL|FL|RD)/.test(s)) return s;
  try {
    const u = new URL(s);
    const list = u.searchParams.get("list");
    if (list && /^[A-Za-z0-9_-]{12,60}$/.test(list)) return list;
  } catch {
    /* not a url */
  }
  return null;
}

function parseLengthText(text: string): number {
  const parts = text.split(":").map((p) => Number(p.trim()));
  if (parts.some((n) => !isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// Walk YouTube's initial data blob and pull out every playlist entry.
function collectItems(node: unknown, out: PlaylistItem[], seen: Set<string>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) collectItems(child, out, seen);
    return;
  }
  const obj = node as Record<string, unknown>;

  // 2025+ layout: lockupViewModel entries
  const lv = obj["lockupViewModel"] as Record<string, unknown> | undefined;
  if (lv && typeof lv["contentId"] === "string" && String(lv["contentType"] ?? "").includes("VIDEO")) {
    const videoId = lv["contentId"] as string;
    if (!seen.has(videoId)) {
      seen.add(videoId);
      const meta = lv["metadata"] as
        | { lockupMetadataViewModel?: { title?: { content?: string } } }
        | undefined;
      const title = meta?.lockupMetadataViewModel?.title?.content?.trim() || `Video ${videoId}`;
      let duration = 0;
      const badges: string[] = [];
      const grabBadges = (n: unknown) => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(grabBadges);
        const o = n as Record<string, unknown>;
        const b = o["thumbnailBadgeViewModel"] as { text?: string } | undefined;
        if (b?.text && /^\d+(:\d{2})+$/.test(b.text.trim())) badges.push(b.text.trim());
        for (const k of Object.keys(o)) grabBadges(o[k]);
      };
      grabBadges(lv["contentImage"]);
      if (badges[0]) duration = parseLengthText(badges[0]);
      out.push({ videoId, title, durationSeconds: duration || 0 });
    }
  }

  const r = obj["playlistVideoRenderer"] as Record<string, unknown> | undefined;
  if (r && typeof r["videoId"] === "string") {
    const videoId = r["videoId"] as string;
    if (!seen.has(videoId)) {
      seen.add(videoId);
      const titleObj = r["title"] as { runs?: { text?: string }[]; simpleText?: string } | undefined;
      const title =
        titleObj?.runs?.[0]?.text?.trim() || titleObj?.simpleText?.trim() || `Video ${videoId}`;
      let duration = Number(r["lengthSeconds"] ?? 0);
      if (!duration) {
        const lt = r["lengthText"] as { simpleText?: string } | undefined;
        if (lt?.simpleText) duration = parseLengthText(lt.simpleText);
      }
      out.push({ videoId, title, durationSeconds: duration || 0 });
    }
  }
  for (const key of Object.keys(obj)) {
    if (key === "playlistVideoRenderer" || key === "lockupViewModel") continue;
    collectItems(obj[key], out, seen);
  }
}

// Collect every continuation token; the caller tries each until one yields new videos.
function findContinuations(node: unknown): string[] {
  const all: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const obj = n as Record<string, unknown>;
    const cc = obj["continuationCommand"] as { token?: string } | undefined;
    if (cc && typeof cc.token === "string") all.push(cc.token);
    for (const k of Object.keys(obj)) walk(obj[k]);
  };
  walk(node);
  return all;
}

const input = z.object({ url: z.string().min(3) });

export const fetchYouTubePlaylist = createServerFn({ method: "POST" })
  .inputValidator((data) => input.parse(data))
  .handler(async ({ data }): Promise<{ playlistId: string; items: PlaylistItem[] }> => {
    const playlistId = extractPlaylistId(data.url);
    if (!playlistId) throw new Error("That doesn't look like a YouTube playlist link (it needs a ?list=… part).");

    const res = await fetch(`https://www.youtube.com/playlist?list=${playlistId}&hl=en`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`YouTube refused the request (${res.status}).`);
    const html = await res.text();

    const marker = "var ytInitialData = ";
    const start = html.indexOf(marker);
    let json: unknown = null;
    if (start >= 0) {
      const from = start + marker.length;
      const end = html.indexOf("};", from);
      if (end > from) {
        try {
          json = JSON.parse(html.slice(from, end + 1));
        } catch {
          json = null;
        }
      }
    }
    if (!json) {
      const alt = html.match(/ytInitialData"\]\s*=\s*(\{.+?\});/s);
      if (alt) {
        try {
          json = JSON.parse(alt[1]);
        } catch {
          json = null;
        }
      }
    }
    if (!json) throw new Error("Could not read that playlist. Make sure it is public or unlisted, not private.");

    const items: PlaylistItem[] = [];
    const seen = new Set<string>();
    collectItems(json, items, seen);
    if (!items.length) throw new Error("No videos found in that playlist (private playlists can't be read).");

    // YouTube only sends ~100 per page; follow continuation tokens for the rest.
    const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
    const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? "2.20250101.00.00";
    const queue = findContinuations(json);
    const used = new Set<string>();
    const url = `https://www.youtube.com/youtubei/v1/browse?prettyPrint=false${apiKey ? `&key=${apiKey}` : ""}`;
    while (queue.length && used.size < 200) {
      const token = queue.shift()!;
      if (used.has(token)) continue;
      used.add(token);
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion, hl: "en" } }, continuation: token }),
        });
        if (!r.ok) continue;
        const page = (await r.json()) as unknown;
        const before = items.length;
        collectItems(page, items, seen);
        if (items.length > before) queue.unshift(...findContinuations(page));
      } catch { /* try next token */ }
    }
    return { playlistId, items };
  });
