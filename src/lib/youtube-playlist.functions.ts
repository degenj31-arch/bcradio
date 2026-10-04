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

    const UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const clients = [
      { clientName: "WEB", clientVersion: "2.20250101.00.00", host: "https://www.youtube.com" },
      { clientName: "MWEB", clientVersion: "2.20250101.00.00", host: "https://m.youtube.com" },
      { clientName: "WEB", clientVersion: "2.20250101.00.00", host: "https://youtubei.googleapis.com" },
    ];
    let lastStatus = 0;

    // Call YouTube's internal browse API directly (far less rate-limited than the HTML page).
    const browse = async (body: Record<string, unknown>): Promise<unknown | null> => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const c = clients[attempt % clients.length];
        try {
          const res = await fetch(`${c.host}/youtubei/v1/browse?prettyPrint=false`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": UA,
              "Accept-Language": "en-US,en;q=0.9",
              Origin: "https://www.youtube.com",
            },
            body: JSON.stringify({
              context: { client: { clientName: c.clientName, clientVersion: c.clientVersion, hl: "en", gl: "US" } },
              ...body,
            }),
          });
          lastStatus = res.status;
          if (res.ok) return await res.json();
          if (res.status !== 429 && res.status !== 503 && res.status !== 403) return null;
        } catch {
          /* network blip — retry */
        }
        await sleep(500 * (attempt + 1));
      }
      return null;
    };

    let json: unknown = await browse({ browseId: `VL${playlistId}` });

    // Fallback: scrape the playlist HTML page.
    if (!json) {
      for (let attempt = 0; attempt < 4 && !json; attempt++) {
        const host = attempt % 2 ? "https://m.youtube.com" : "https://www.youtube.com";
        try {
          const res = await fetch(`${host}/playlist?list=${playlistId}&hl=en`, {
            headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
          });
          lastStatus = res.status;
          if (res.ok) {
            const html = await res.text();
            const m =
              html.match(/var ytInitialData = (\{.+?\});<\/script>/s) ||
              html.match(/ytInitialData"\]\s*=\s*(\{.+?\});/s);
            if (m) {
              try { json = JSON.parse(m[1]); } catch { json = null; }
            }
          }
        } catch { /* retry */ }
        if (!json) await sleep(800 * (attempt + 1));
      }
    }

    if (!json) {
      throw new Error(
        lastStatus === 429
          ? "YouTube is rate-limiting imports right now. Wait a few minutes and try again."
          : "Could not read that playlist. Make sure it is public or unlisted, not private.",
      );
    }

    const items: PlaylistItem[] = [];
    const seen = new Set<string>();
    collectItems(json, items, seen);
    if (!items.length) throw new Error("No videos found in that playlist (private playlists can't be read).");

    // YouTube only sends ~100 per page; follow continuation tokens for the rest.
    const queue = findContinuations(json);
    const used = new Set<string>();
    while (queue.length && used.size < 200) {
      const token = queue.shift()!;
      if (used.has(token)) continue;
      used.add(token);
      const page = await browse({ continuation: token });
      if (!page) continue;
      const before = items.length;
      collectItems(page, items, seen);
      if (items.length > before) queue.unshift(...findContinuations(page));
    }
    return { playlistId, items };
  });
