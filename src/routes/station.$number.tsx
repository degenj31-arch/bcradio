import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Station, Song } from "@/lib/radio";
import { currentPlayhead, getPlayableUrl, fmtTime } from "@/lib/radio";
import { startStatic } from "@/lib/static-noise";
import { ArrowLeft, Pause, Play, Volume2, VolumeX, SkipForward } from "lucide-react";

export const Route = createFileRoute("/station/$number")({
  head: ({ params }) => ({
    meta: [
      { title: `BCradio ${params.number} FM` },
      { name: "description", content: `Live broadcast on BCradio ${params.number} FM.` },
    ],
  }),
  component: StationPage,
});

function StationPage() {
  const { number } = Route.useParams();
  const navigate = useNavigate();
  const [station, setStation] = useState<Station | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [current, setCurrent] = useState<Song | null>(null);
  const [tuning, setTuning] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const staticRef = useRef<ReturnType<typeof startStatic> | null>(null);
  const stoppedRef = useRef(false);

  // Load station + songs
  useEffect(() => {
    stoppedRef.current = false;
    (async () => {
      const num = Number(number);
      const { data: st } = await supabase.from("stations").select("*").eq("number", num).maybeSingle();
      if (!st) { setError("Station not found"); return; }
      setStation(st);
      const { data: sg } = await supabase.from("songs").select("*").eq("station_id", st.id).order("position");
      setSongs(sg ?? []);
    })();
    return () => { stoppedRef.current = true; };
  }, [number]);

  // Subscribe to song changes (live studio updates)
  useEffect(() => {
    if (!station) return;
    const ch = supabase
      .channel(`station-${station.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "songs", filter: `station_id=eq.${station.id}` },
        async () => {
          const { data: sg } = await supabase.from("songs").select("*").eq("station_id", station.id).order("position");
          setSongs(sg ?? []);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [station]);

  // Tune-in: play static then sync up
  useEffect(() => {
    if (!station || !songs.length) return;
    let cancelled = false;
    setTuning(true);
    setError(null);

    // Start static
    try {
      staticRef.current = startStatic(0.14);
    } catch {
      staticRef.current = null;
    }

    const startAfterStatic = async () => {
      if (cancelled) return;
      try {
        await syncAndPlay();
        staticRef.current?.fadeOut(0.6);
        setTuning(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Playback failed");
        setTuning(false);
      }
    };
    const t = setTimeout(startAfterStatic, 1800);
    return () => {
      cancelled = true;
      clearTimeout(t);
      staticRef.current?.stop();
      staticRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.id, songs.length]);

  // Sync engine — compute current playhead and play the matching song at the right offset.
  const syncAndPlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    const head = currentPlayhead(songs);
    if (!head) return;
    setCurrent(head.song);
    const url = await getPlayableUrl(head.song.audio_url);
    if (stoppedRef.current) return;
    audio.src = url;
    audio.currentTime = head.offset;
    audio.volume = muted ? 0 : 0.9;
    await audio.play().catch((e) => { throw e; });
    setPlaying(true);
  };

  // When a song ends, advance to next per playlist order
  const handleEnded = async () => {
    if (!songs.length) return;
    // Resync from clock — keeps every listener in lockstep
    try { await syncAndPlay(); } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed");
    }
  };

  // Progress ticker
  useEffect(() => {
    const id = setInterval(() => {
      const a = audioRef.current;
      if (a && a.duration) setProgress(a.currentTime / a.duration);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Media Session metadata for OS-level controls (lock screen / media keys)
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist ?? station?.name ?? "BCradio",
      album: `BCradio ${station ? Number(station.number).toFixed(1) : ""} FM`,
    });
    navigator.mediaSession.setActionHandler?.("play", () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler?.("pause", () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler?.("nexttrack", handleEnded);
  }, [current, station]);

  const togglePlay = async () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) {
      try { await syncAndPlay(); } catch { /* noop */ }
    } else {
      a.pause(); setPlaying(false);
    }
  };

  const toggleMute = () => {
    const a = audioRef.current; if (!a) return;
    const next = !muted;
    setMuted(next);
    a.volume = next ? 0 : 0.9;
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="panel p-8 max-w-md text-center">
          <h2 className="font-display text-2xl mb-2">Signal lost</h2>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <Link to="/" className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground">
            ← Back to dial
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-3xl mx-auto">
      <nav className="flex items-center justify-between mb-8">
        <button onClick={() => navigate({ to: "/" })} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Dial
        </button>
        <div className="font-mono text-xs text-muted-foreground">LIVE · WORLDWIDE</div>
      </nav>

      <div className="panel relative overflow-hidden p-6 md:p-10">
        {tuning && <div className="absolute inset-0 tv-static z-10" />}

        <div className="text-center mb-8">
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">
            {station ? `${station.name} · ${station.tagline ?? ""}` : "—"}
          </div>
          <div
            className="font-display text-7xl md:text-8xl dial-glow"
            style={{ color: station?.color ?? "var(--amber)" }}
          >
            {station ? Number(station.number).toFixed(1) : "···"}
          </div>
          <div className="font-mono text-sm text-muted-foreground mt-1">FM</div>
        </div>

        {/* VU meter */}
        <div className="flex items-end justify-center gap-1 h-12 mb-8">
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className={playing ? "vu-bar" : ""}
              style={{
                width: 4, height: `${12 + (i % 5) * 6}px`,
                background: `linear-gradient(to top, ${station?.color ?? "#f59e0b"}, transparent)`,
                animationDelay: `${i * 0.05}s`,
                opacity: playing ? undefined : 0.2,
              }}
            />
          ))}
        </div>

        {/* Now playing */}
        <div className="text-center min-h-[60px]">
          {tuning ? (
            <div className="font-mono text-sm text-muted-foreground animate-pulse">⟨ tuning in… ⟩</div>
          ) : current ? (
            <>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Now playing</div>
              <div className="text-xl md:text-2xl font-medium mt-1">{current.title}</div>
              {current.artist && <div className="text-muted-foreground text-sm">{current.artist}</div>}
            </>
          ) : (
            <div className="text-muted-foreground">No songs on this station yet.</div>
          )}
        </div>

        {/* Progress */}
        {current && (
          <div className="mt-6">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-amber transition-all"
                style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
            <div className="flex justify-between font-mono text-xs text-muted-foreground mt-1">
              <span>{fmtTime((audioRef.current?.currentTime) ?? 0)}</span>
              <span>{fmtTime(Number(current.duration_seconds))}</span>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="mt-8 flex items-center justify-center gap-4">
          <button onClick={toggleMute} className="p-3 rounded-full hover:bg-accent" aria-label="Mute">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button
            onClick={togglePlay}
            className="station-knob w-16 h-16 rounded-full flex items-center justify-center text-amber"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
          </button>
          <button onClick={handleEnded} className="p-3 rounded-full hover:bg-accent" aria-label="Skip">
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>

      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setError("Audio failed to load")}
        playsInline
      />
    </div>
  );
}
