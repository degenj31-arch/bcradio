import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  Play,
  Pause,
  Search,
  Clock,
  Headphones,
  Gauge,
  X,
  ChevronDown,
  RotateCcw,
  RotateCw,
  SkipForward,
  Moon,
  Radio,
} from "lucide-react";
import { fetchEpisodes, formatEpisodeDate, countPlay, type PodcastEpisode } from "@/lib/podcasts";
import { getPlayableUrl, fmtTime } from "@/lib/radio";
import { loadYouTubeAPI } from "@/lib/youtube";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SortKey = "new" | "old" | "plays";

const PROGRESS_KEY = "bcradio.podcast.progress";

function readProgress(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeProgress(next: Record<string, number>) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function PodcastSection() {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("new");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<PodcastEpisode | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [autoplay, setAutoplay] = useState(true);
  const [sleepMin, setSleepMin] = useState(0);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const audioRef = useRef<HTMLAudioElement>(null);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const ytRef = useRef<YT.Player | null>(null);
  const activeRef = useRef<PodcastEpisode | null>(null);
  const sleepAt = useRef<number>(0);

  const load = useCallback(async () => {
    try {
      setEpisodes(await fetchEpisodes());
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    setProgress(readProgress());
    load();
    const ch = supabase
      .channel("podcast-episodes")
      .on("postgres_changes", { event: "*", schema: "public", table: "podcast_episodes" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = episodes.filter(
      (e) =>
        !q ||
        e.title.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.host ?? "").toLowerCase().includes(q) ||
        (e.show_name ?? "").toLowerCase().includes(q)
    );
    const sorted = [...list];
    if (sort === "old") sorted.sort((a, b) => a.published_at.localeCompare(b.published_at));
    else if (sort === "plays") sorted.sort((a, b) => Number(b.plays) - Number(a.plays));
    else sorted.sort((a, b) => b.published_at.localeCompare(a.published_at));
    return sorted;
  }, [episodes, query, sort]);

  // Group episodes that belong to the same show.
  const shows = useMemo(() => {
    const map = new Map<string, PodcastEpisode[]>();
    for (const ep of visible) {
      const key = (ep.show_name || "BCradio Podcast").trim();
      const arr = map.get(key);
      if (arr) arr.push(ep);
      else map.set(key, [ep]);
    }
    return [...map.entries()].map(([name, eps]) => ({
      name,
      eps,
      minutes: Math.round(eps.reduce((s, e) => s + Number(e.duration_seconds || 0), 0) / 60),
      hosts: [...new Set(eps.map((e) => e.host).filter(Boolean))] as string[],
      latest: eps.reduce((m, e) => (e.published_at > m ? e.published_at : m), eps[0].published_at),
    }));
  }, [visible]);

  const saveProgress = useCallback((id: string, sec: number) => {
    setProgress((prev) => {
      const next = { ...prev, [id]: Math.floor(sec) };
      writeProgress(next);
      return next;
    });
  }, []);

  const destroyYt = () => {
    try {
      ytRef.current?.destroy();
    } catch {
      /* ignore */
    }
    ytRef.current = null;
  };

  const playEpisode = useCallback(
    async (ep: PodcastEpisode, resume = true) => {
      activeRef.current = ep;
      setActive(ep);
      setPlaying(false);
      setAudioSrc(null);
      destroyYt();
      const start = resume ? Math.max(0, progress[ep.id] ?? 0) : 0;
      setPosition(start);
      setDuration(Number(ep.duration_seconds) || 0);
      countPlay(ep).then(load).catch(() => {});

      if (ep.youtube_id) {
        try {
          const YTApi = await loadYouTubeAPI();
          if (activeRef.current?.id !== ep.id) return;
          const host = ytHostRef.current;
          if (!host) return;
          host.innerHTML = "";
          const mount = document.createElement("div");
          host.appendChild(mount);
          ytRef.current = new YTApi.Player(mount, {
            videoId: ep.youtube_id,
            playerVars: { autoplay: 1, controls: 0, playsinline: 1, start: Math.floor(start) },
            events: {
              onReady: (e) => {
                (e.target as unknown as { setPlaybackRate?: (r: number) => void }).setPlaybackRate?.(rate);
                e.target.playVideo();
                setDuration(e.target.getDuration() || Number(ep.duration_seconds) || 0);
              },
              onStateChange: (e) => {
                if (e.data === 1) setPlaying(true);
                if (e.data === 2) setPlaying(false);
                if (e.data === 0) {
                  setPlaying(false);
                  saveProgress(ep.id, 0);
                  if (autoplay) playNext(ep);
                }
              },
              onError: () => toast.error("That episode can't be streamed from YouTube."),
            },
          });
        } catch {
          toast.error("Could not start that episode");
        }
      } else if (ep.audio_url) {
        try {
          setAudioSrc(await getPlayableUrl(ep.audio_url));
          setTimeout(() => {
            const a = audioRef.current;
            if (a && start) a.currentTime = start;
          }, 120);
        } catch {
          toast.error("Could not load that episode's audio");
        }
      }
      setTimeout(() => {
        document.getElementById("podcast-player")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [progress, rate, autoplay, load, saveProgress]
  );

  const playNext = useCallback(
    (from: PodcastEpisode) => {
      const list = episodes
        .filter((e) => (e.show_name || "") === (from.show_name || ""))
        .sort((a, b) => a.published_at.localeCompare(b.published_at));
      const i = list.findIndex((e) => e.id === from.id);
      const next = i >= 0 ? list[i + 1] : undefined;
      if (next) playEpisode(next, false);
    },
    [episodes, playEpisode]
  );

  const togglePlay = () => {
    if (ytRef.current) {
      if (playing) ytRef.current.pauseVideo();
      else ytRef.current.playVideo();
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => toast.error("Tap play again to start the episode"));
    else a.pause();
  };

  const seekTo = (v: number) => {
    setPosition(v);
    if (ytRef.current) ytRef.current.seekTo(v, true);
    else if (audioRef.current) audioRef.current.currentTime = v;
    if (active) saveProgress(active.id, v);
  };

  const nudge = (delta: number) => seekTo(Math.max(0, Math.min(duration || 1e9, position + delta)));

  // Ticker for the YouTube-backed player + sleep timer.
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = ytRef.current;
      if (p && typeof p.getCurrentTime === "function") {
        const t = p.getCurrentTime() || 0;
        setPosition(t);
        if (activeRef.current) saveProgress(activeRef.current.id, t);
      }
      if (sleepAt.current && Date.now() >= sleepAt.current) {
        sleepAt.current = 0;
        setSleepMin(0);
        ytRef.current?.pauseVideo();
        audioRef.current?.pause();
        toast.message("Sleep timer ended — podcast paused");
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [saveProgress]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = rate;
    (ytRef.current as unknown as { setPlaybackRate?: (r: number) => void } | null)?.setPlaybackRate?.(rate);
  }, [rate, audioSrc]);

  useEffect(() => () => destroyYt(), []);

  const startSleep = (min: number) => {
    setSleepMin(min);
    sleepAt.current = min ? Date.now() + min * 60_000 : 0;
    if (min) toast.success(`Sleep timer set for ${min} minutes`);
  };

  const totalMinutes = Math.round(episodes.reduce((s, e) => s + Number(e.duration_seconds || 0), 0) / 60);

  return (
    <section id="podcasts" className="mt-14 md:mt-20 panel p-6 md:p-10 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-0 h-64 w-64 rounded-full blur-3xl opacity-25"
        style={{ background: "radial-gradient(circle, var(--amber, #f59e0b), transparent 70%)" }}
      />
      {/* Audio-only: the YouTube player is mounted off-screen so nothing is ever shown. */}
      <div ref={ytHostRef} aria-hidden className="absolute -left-[9999px] top-0 h-1 w-1 overflow-hidden" />

      <header className="relative flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-amber/80">
            <Mic className="w-3.5 h-3.5" /> On demand · audio only
          </div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl dial-glow text-amber">BCradio Podcasts</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Pure listening — every episode plays as sound only, grouped by the show it belongs to. Pick up right
            where you left off.
          </p>
        </div>
        <div className="text-right font-mono text-[11px] text-muted-foreground space-y-0.5">
          <div>{shows.length} show{shows.length === 1 ? "" : "s"}</div>
          <div>{episodes.length} episode{episodes.length === 1 ? "" : "s"}</div>
          <div>{totalMinutes} min of listening</div>
        </div>
      </header>

      <div className="relative flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shows, episodes, hosts…"
            className="w-full bg-input border border-border rounded-md pl-9 pr-3 py-2 text-sm"
          />
        </div>
        {([
          ["new", "Newest"],
          ["old", "Oldest"],
          ["plays", "Most played"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={`text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded-md border transition ${
              sort === k ? "border-amber/50 bg-amber/10 text-amber" : "border-border text-muted-foreground hover:text-amber"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {active && (
        <div id="podcast-player" className="relative mb-6 rounded-xl border border-amber/40 bg-card/60 overflow-hidden">
          <div className="flex items-start justify-between gap-3 p-4 pb-2">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-widest text-amber">Now playing</div>
              <div className="font-display text-xl truncate">{active.title}</div>
              <div className="text-xs text-muted-foreground truncate">
                {active.show_name}
                {active.host ? ` · ${active.host}` : ""} · {formatEpisodeDate(active.published_at)}
              </div>
            </div>
            <button
              onClick={() => {
                audioRef.current?.pause();
                destroyYt();
                activeRef.current = null;
                setActive(null);
                setAudioSrc(null);
                setPlaying(false);
              }}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground shrink-0"
              aria-label="Close player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 pt-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => nudge(-15)}
                className="p-2 rounded-md border border-border text-muted-foreground hover:text-amber shrink-0"
                aria-label="Back 15 seconds"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className="w-12 h-12 rounded-full bg-amber text-primary-foreground flex items-center justify-center shrink-0"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button
                onClick={() => nudge(15)}
                className="p-2 rounded-md border border-border text-muted-foreground hover:text-amber shrink-0"
                aria-label="Forward 15 seconds"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, duration || Number(active.duration_seconds) || 1)}
                  step={1}
                  value={position}
                  onChange={(e) => seekTo(Number(e.target.value))}
                  className="w-full accent-amber"
                  aria-label="Seek"
                />
                <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                  <span>{fmtTime(position)}</span>
                  <span>-{fmtTime(Math.max(0, (duration || Number(active.duration_seconds)) - position))}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setRate((r) => (r >= 2 ? 0.75 : Math.round((r + 0.25) * 100) / 100))}
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:text-amber"
                title="Playback speed"
              >
                <Gauge className="w-3.5 h-3.5" /> {rate}×
              </button>
              <button
                onClick={() => playNext(active)}
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:text-amber"
              >
                <SkipForward className="w-3.5 h-3.5" /> Next in show
              </button>
              <button
                onClick={() => setAutoplay((a) => !a)}
                className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1.5 rounded-md border ${
                  autoplay ? "border-amber/50 bg-amber/10 text-amber" : "border-border text-muted-foreground"
                }`}
              >
                <Radio className="w-3.5 h-3.5" /> Autoplay
              </button>
              <div className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1.5 rounded-md border border-border text-muted-foreground">
                <Moon className="w-3.5 h-3.5" />
                {[0, 15, 30, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => startSleep(m)}
                    className={`px-1 ${sleepMin === m ? "text-amber" : "hover:text-amber"}`}
                  >
                    {m === 0 ? "off" : `${m}m`}
                  </button>
                ))}
              </div>
            </div>

            <audio
              ref={audioRef}
              src={audioSrc ?? undefined}
              autoPlay
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => {
                setPosition(e.currentTarget.currentTime);
                if (active) saveProgress(active.id, e.currentTarget.currentTime);
              }}
              onEnded={() => {
                if (active) saveProgress(active.id, 0);
                if (autoplay && active) playNext(active);
              }}
              className="hidden"
            />
          </div>

          {active.description && (
            <p className="px-4 pb-4 pt-1 text-sm text-muted-foreground whitespace-pre-line">{active.description}</p>
          )}
        </div>
      )}

      <div className="relative space-y-6">
        {shows.map((show) => {
          const isOpen = !collapsed[show.name];
          return (
            <div key={show.name} className="rounded-xl border border-border bg-card/40 overflow-hidden">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [show.name]: isOpen }))}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/40 transition"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-amber shrink-0" />
                    <span className="font-display text-lg truncate">{show.name}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground truncate">
                    {show.eps.length} episode{show.eps.length === 1 ? "" : "s"} · {show.minutes} min
                    {show.hosts.length ? ` · ${show.hosts.join(", ")}` : ""} · latest {formatEpisodeDate(show.latest)}
                  </div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen && (
                <ul className="divide-y divide-border/70 border-t border-border/70">
                  {show.eps.map((ep, i) => {
                    const isActive = active?.id === ep.id;
                    const saved = progress[ep.id] ?? 0;
                    const total = Number(ep.duration_seconds) || 0;
                    const pct = total ? Math.min(100, (saved / total) * 100) : 0;
                    return (
                      <li key={ep.id}>
                        <button
                          onClick={() => playEpisode(ep)}
                          className={`w-full text-left flex items-start gap-3 px-4 py-3 transition hover:bg-accent/30 animate-fade-in ${
                            isActive ? "bg-amber/10" : ""
                          }`}
                          style={{ animationDelay: `${i * 30}ms` }}
                        >
                          <span className="mt-0.5 w-9 h-9 rounded-full bg-amber/15 text-amber flex items-center justify-center shrink-0">
                            {isActive && playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                Ep. {ep.episode_number}
                              </span>
                              <span className="font-medium truncate">{ep.title}</span>
                            </span>
                            {ep.description && (
                              <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">
                                {ep.description}
                              </span>
                            )}
                            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {fmtTime(total)}
                              </span>
                              <span>{formatEpisodeDate(ep.published_at)}</span>
                              <span>{Number(ep.plays)} plays</span>
                              {pct > 1 && pct < 98 && <span className="text-amber">resume {Math.round(pct)}%</span>}
                            </span>
                            {pct > 1 && (
                              <span className="mt-1.5 block h-1 w-full rounded-full bg-border overflow-hidden">
                                <span className="block h-full bg-amber" style={{ width: `${pct}%` }} />
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {shows.length === 0 && (
        <div className="relative text-center py-12 text-muted-foreground text-sm">
          {episodes.length === 0
            ? "No episodes yet. Record one in the studio or drop in a YouTube link."
            : "No episodes match that search."}
        </div>
      )}
    </section>
  );
}
