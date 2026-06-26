import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Station, Song } from "@/lib/radio";
import { currentPlayhead, getPlayableUrl, fmtTime } from "@/lib/radio";
import { startStatic } from "@/lib/static-noise";
import { ArrowLeft, Pause, Play, Volume2, VolumeX, SkipForward, Radio } from "lucide-react";

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
  const [tuning, setTuning] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needsGesture, setNeedsGesture] = useState(true);

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
    return () => {
      stoppedRef.current = true;
      staticRef.current?.stop();
      staticRef.current = null;
      const a = audioRef.current;
      if (a) { a.pause(); a.src = ""; }
    };
  }, [number]);

  // Live song updates
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

  const syncAndPlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !songs.length) return;
    const head = currentPlayhead(songs);
    if (!head) return;
    setCurrent(head.song);
    const url = await getPlayableUrl(head.song.audio_url);
    if (stoppedRef.current) return;
    if (audio.src !== url) {
      audio.src = url;
      // Wait for metadata so currentTime assignment sticks
      await new Promise<void>((res) => {
        const ok = () => { audio.removeEventListener("loadedmetadata", ok); res(); };
        if (audio.readyState >= 1) res();
        else audio.addEventListener("loadedmetadata", ok);
        setTimeout(res, 4000);
      });
    }
    try { audio.currentTime = head.offset; } catch { /* noop */ }
    audio.volume = muted ? 0 : 0.9;
    await audio.play();
    setPlaying(true);
  }, [songs, muted]);

  // Tune in — start static, then play (only after user gesture)
  const tuneIn = useCallback(async () => {
    if (!station) return;
    setNeedsGesture(false);
    setTuning(true);
    setError(null);
    try {
      staticRef.current = startStatic(0.5);
    } catch (e) {
      console.warn("static failed", e);
      staticRef.current = null;
    }

    await new Promise((r) => setTimeout(r, 2000));
    if (stoppedRef.current) return;

    if (songs.length) {
      try {
        await syncAndPlay();
      } catch (e) {
        console.error("playback error", e);
        setError(e instanceof Error ? e.message : "Playback failed");
      }
    }
    staticRef.current?.fadeOut(0.8);
    setTuning(false);
  }, [station, songs, syncAndPlay]);

  const handleEnded = async () => {
    if (!songs.length) return;
    try { await syncAndPlay(); } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed");
    }
  };

  useEffect(() => {
    const id = setInterval(() => {
      const a = audioRef.current;
      if (a && a.duration) setProgress(a.currentTime / a.duration);
    }, 250);
    return () => clearInterval(id);
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, station]);

  const togglePlay = async () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) { try { await syncAndPlay(); } catch { /* noop */ } }
    else { a.pause(); setPlaying(false); }
  };

  const toggleMute = () => {
    const a = audioRef.current; if (!a) return;
    const next = !muted;
    setMuted(next);
    a.volume = next ? 0 : 0.9;
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="panel p-6 sm:p-8 max-w-md w-full text-center">
          <h2 className="font-display text-2xl mb-2">Signal lost</h2>
          <p className="text-muted-foreground text-sm mb-4 break-words">{error}</p>
          <Link to="/" className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground">
            ← Back to dial
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-3 sm:px-4 py-6 sm:py-8 max-w-3xl mx-auto">
      <nav className="flex items-center justify-between mb-6 sm:mb-8">
        <button onClick={() => navigate({ to: "/" })} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm">
          <ArrowLeft className="w-4 h-4" /> Dial
        </button>
        <div className="font-mono text-[10px] sm:text-xs text-muted-foreground">LIVE · WORLDWIDE</div>
      </nav>

      <div className="panel relative overflow-hidden p-4 sm:p-6 md:p-10">
        {tuning && <div className="absolute inset-0 tv-static z-10 pointer-events-none" />}

        <div className="text-center mb-6 sm:mb-8">
          <div className="font-mono text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground mb-2 truncate px-2">
            {station ? `${station.name}${station.tagline ? " · " + station.tagline : ""}` : "—"}
          </div>
          <div
            className="font-display text-6xl sm:text-7xl md:text-8xl dial-glow leading-none"
            style={{ color: station?.color ?? "var(--amber)" }}
          >
            {station ? Number(station.number).toFixed(1) : "···"}
          </div>
          <div className="font-mono text-sm text-muted-foreground mt-1">FM</div>
        </div>

        <div className="flex items-end justify-center gap-1 h-10 sm:h-12 mb-6 sm:mb-8">
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

        <div className="text-center min-h-[60px] px-2">
          {needsGesture ? (
            <button
              onClick={tuneIn}
              className="px-5 py-3 rounded-full bg-amber text-primary-foreground font-medium inline-flex items-center gap-2 shadow-lg"
            >
              <Radio className="w-4 h-4" /> Tune in
            </button>
          ) : tuning ? (
            <div className="font-mono text-sm text-muted-foreground animate-pulse">⟨ tuning in… ⟩</div>
          ) : current ? (
            <>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Now playing</div>
              <div className="text-lg sm:text-xl md:text-2xl font-medium mt-1 break-words">{current.title}</div>
              {current.artist && <div className="text-muted-foreground text-sm break-words">{current.artist}</div>}
            </>
          ) : (
            <div className="text-muted-foreground text-sm">No songs on this station yet.</div>
          )}
        </div>

        {current && !needsGesture && (
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

        {!needsGesture && (
          <div className="mt-6 sm:mt-8 flex items-center justify-center gap-3 sm:gap-4">
            <button onClick={toggleMute} className="p-3 rounded-full hover:bg-accent" aria-label="Mute">
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <button
              onClick={togglePlay}
              className="station-knob w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-amber"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
            </button>
            <button onClick={handleEnded} className="p-3 rounded-full hover:bg-accent" aria-label="Skip">
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
        )}
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
