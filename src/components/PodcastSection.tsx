import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Play, Pause, Search, Clock, Headphones, Youtube, Gauge, X } from "lucide-react";
import { fetchEpisodes, episodeThumb, formatEpisodeDate, countPlay, type PodcastEpisode } from "@/lib/podcasts";
import { getPlayableUrl, fmtTime } from "@/lib/radio";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SortKey = "new" | "old" | "plays";

export function PodcastSection() {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("new");
  const [active, setActive] = useState<PodcastEpisode | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  const load = async () => {
    try {
      setEpisodes(await fetchEpisodes());
    } catch {
      /* offline */
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("podcast-episodes")
      .on("postgres_changes", { event: "*", schema: "public", table: "podcast_episodes" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

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

  const open = async (ep: PodcastEpisode) => {
    setActive(ep);
    setPosition(0);
    setPlaying(false);
    setAudioSrc(null);
    countPlay(ep).then(load).catch(() => {});
    if (!ep.youtube_id && ep.audio_url) {
      try {
        setAudioSrc(await getPlayableUrl(ep.audio_url));
      } catch {
        toast.error("Could not load that episode's audio");
      }
    }
    setTimeout(() => {
      document.getElementById("podcast-player")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => toast.error("Tap play again to start the episode"));
    else a.pause();
  };

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = rate;
  }, [rate, audioSrc]);

  const totalMinutes = Math.round(episodes.reduce((s, e) => s + Number(e.duration_seconds || 0), 0) / 60);

  return (
    <section id="podcasts" className="mt-14 md:mt-20 panel p-6 md:p-10 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 right-0 h-64 w-64 rounded-full blur-3xl opacity-25"
        style={{ background: "radial-gradient(circle, var(--amber, #f59e0b), transparent 70%)" }}
      />

      <header className="relative flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-amber/80">
            <Mic className="w-3.5 h-3.5" /> On demand
          </div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl dial-glow text-amber">BCradio Podcasts</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Full episodes you can start any time — no schedule, no sync. Recorded in the studio or pulled straight
            from YouTube.
          </p>
        </div>
        <div className="text-right font-mono text-[11px] text-muted-foreground space-y-0.5">
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
            placeholder="Search episodes, hosts, topics…"
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
                setActive(null);
                setAudioSrc(null);
              }}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground shrink-0"
              aria-label="Close player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {active.youtube_id ? (
            <div className="aspect-video w-full bg-black">
              <iframe
                key={active.id}
                src={`https://www.youtube-nocookie.com/embed/${active.youtube_id}?autoplay=1&rel=0&playsinline=1`}
                title={active.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="p-4 pt-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="w-12 h-12 rounded-full bg-amber text-primary-foreground flex items-center justify-center shrink-0"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, Number(active.duration_seconds) || 1)}
                    step={1}
                    value={position}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPosition(v);
                      if (audioRef.current) audioRef.current.currentTime = v;
                    }}
                    className="w-full accent-amber"
                    aria-label="Seek"
                  />
                  <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                    <span>{fmtTime(position)}</span>
                    <span>{fmtTime(Number(active.duration_seconds))}</span>
                  </div>
                </div>
                <button
                  onClick={() => setRate((r) => (r >= 2 ? 0.75 : Math.round((r + 0.25) * 100) / 100))}
                  className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1.5 rounded-md border border-border text-muted-foreground hover:text-amber shrink-0"
                  title="Playback speed"
                >
                  <Gauge className="w-3.5 h-3.5" /> {rate}×
                </button>
              </div>
              <audio
                ref={audioRef}
                src={audioSrc ?? undefined}
                autoPlay
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
                className="hidden"
              />
            </div>
          )}

          {active.description && (
            <p className="px-4 pb-4 pt-3 text-sm text-muted-foreground whitespace-pre-line">{active.description}</p>
          )}
        </div>
      )}

      <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((ep, i) => {
          const thumb = episodeThumb(ep);
          const isActive = active?.id === ep.id;
          return (
            <button
              key={ep.id}
              onClick={() => open(ep)}
              className={`group text-left panel overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-amber/50 animate-fade-in ${
                isActive ? "border-amber/60 ring-1 ring-amber/40" : ""
              }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="relative aspect-video w-full bg-muted overflow-hidden">
                {thumb ? (
                  <img
                    src={thumb}
                    alt={`${ep.title} cover art`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-amber/50">
                    <Mic className="w-10 h-10" />
                  </div>
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent" />
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-amber">
                  {ep.youtube_id ? <Youtube className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5" />}
                  Ep. {ep.episode_number}
                </span>
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                  <Clock className="w-3 h-3" /> {fmtTime(Number(ep.duration_seconds))}
                </span>
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="w-12 h-12 rounded-full bg-amber/90 text-primary-foreground flex items-center justify-center">
                    <Play className="w-5 h-5 ml-0.5" />
                  </span>
                </span>
              </div>
              <div className="p-4">
                <div className="font-medium leading-tight line-clamp-2">{ep.title}</div>
                <div className="mt-1 text-xs text-muted-foreground truncate">
                  {ep.show_name}
                  {ep.host ? ` · ${ep.host}` : ""}
                </div>
                {ep.description && (
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{ep.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <span>{formatEpisodeDate(ep.published_at)}</span>
                  <span>{Number(ep.plays)} plays</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="relative text-center py-12 text-muted-foreground text-sm">
          {episodes.length === 0
            ? "No episodes yet. Record one in the studio or drop in a YouTube link."
            : "No episodes match that search."}
        </div>
      )}
    </section>
  );
}
