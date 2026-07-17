// YouTube helpers: URL parsing + IFrame Player API loader.

export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // bare id
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      // /embed/<id>, /shorts/<id>, /live/<id>
      const i = parts.findIndex((p) => ["embed", "shorts", "live", "v"].includes(p));
      if (i >= 0 && parts[i + 1] && /^[A-Za-z0-9_-]{11}$/.test(parts[i + 1])) return parts[i + 1];
    }
  } catch { /* not a URL */ }
  return null;
}

// Ambient YT namespace declarations
declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
  namespace YT {
    class Player {
      constructor(el: HTMLElement | string, opts: PlayerOptions);
      playVideo(): void;
      pauseVideo(): void;
      seekTo(sec: number, allowSeekAhead?: boolean): void;
      getDuration(): number;
      getCurrentTime(): number;
      setVolume(v: number): void;
      mute(): void;
      unMute(): void;
      destroy(): void;
      loadVideoById(opts: { videoId: string; startSeconds?: number } | string): void;
    }
    interface PlayerOptions {
      videoId?: string;
      width?: string | number;
      height?: string | number;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: Player }) => void;
        onStateChange?: (e: { data: number; target: Player }) => void;
        onError?: (e: { data: number }) => void;
      };
    }
    enum PlayerState {
      ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5,
    }
  }
}

let apiPromise: Promise<typeof YT> | null = null;
export function loadYouTubeAPI(): Promise<typeof YT> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => reject(new Error("Failed to load YouTube API"));
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("YT global missing"));
    };
    setTimeout(() => reject(new Error("YouTube API timeout")), 12000);
  });
  return apiPromise;
}

// Load a hidden player briefly to read the video duration.
export async function fetchYouTubeDuration(videoId: string): Promise<number> {
  const YT = await loadYouTubeAPI();
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;";
  const inner = document.createElement("div");
  holder.appendChild(inner);
  document.body.appendChild(holder);
  return new Promise<number>((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      try { player.destroy(); } catch { /* noop */ }
      holder.remove();
      reject(new Error("Could not read YouTube duration"));
    }, 15000);
    const player = new YT.Player(inner, {
      videoId,
      height: "1",
      width: "1",
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, mute: 1 },
      events: {
        onReady: (e) => {
          const finish = (d: number) => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            try { e.target.destroy(); } catch { /* noop */ }
            holder.remove();
            if (isFinite(d) && d > 0) resolve(d);
            else reject(new Error("YouTube returned invalid duration"));
          };
          const d1 = e.target.getDuration();
          if (d1 > 0) return finish(d1);
          // Duration sometimes only available after buffer starts — nudge play muted.
          try { e.target.mute(); e.target.playVideo(); } catch { /* noop */ }
          const iv = setInterval(() => {
            const d = e.target.getDuration();
            if (d > 0) { clearInterval(iv); finish(d); }
          }, 300);
          setTimeout(() => clearInterval(iv), 12000);
        },
        onError: () => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          try { player.destroy(); } catch { /* noop */ }
          holder.remove();
          reject(new Error("YouTube video unavailable or embed blocked"));
        },
      },
    });
  });
}

// Off-air window: local time 22:00 (10pm) - 07:00.
export const OFF_AIR_START_HOUR = 22;
export const OFF_AIR_END_HOUR = 7;

export function isOffAir(d: Date = new Date()): boolean {
  const h = d.getHours();
  return h >= OFF_AIR_START_HOUR || h < OFF_AIR_END_HOUR;
}

export function msUntilOnAir(d: Date = new Date()): number {
  const next = new Date(d);
  if (d.getHours() >= OFF_AIR_START_HOUR) next.setDate(next.getDate() + 1);
  next.setHours(OFF_AIR_END_HOUR, 0, 0, 0);
  return next.getTime() - d.getTime();
}

export function msUntilOffAir(d: Date = new Date()): number {
  const next = new Date(d);
  if (d.getHours() >= OFF_AIR_START_HOUR) next.setDate(next.getDate() + 1);
  next.setHours(OFF_AIR_START_HOUR, 0, 0, 0);
  return next.getTime() - d.getTime();
}

export function formatOffAirWindow(): string {
  return "10:00 PM – 7:00 AM (your local time)";
}
