import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Station, Song } from "@/lib/radio";
import { currentPlayhead, getPlayableUrl, fmtTime } from "@/lib/radio";
import { startStatic } from "@/lib/static-noise";
import { loadYouTubeAPI, isOffAir, msUntilOnAir, formatOffAirWindow } from "@/lib/youtube";
import { fetchCommercials, currentCommercial, type Commercial } from "@/lib/commercials";
import { ArrowLeft, Volume2, VolumeX, Radio, Moon, Megaphone } from "lucide-react";

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
  const [commercials, setCommercials] = useState<Commercial[]>([]);
  const [current, setCurrent] = useState<Song | null>(null);
  const [ad, setAd] = useState<Commercial | null>(null);
  const [tuning, setTuning] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needsGesture, setNeedsGesture] = useState(true);
  const [offAir, setOffAir] = useState(isOffAir());

  const audioRef = useRef<HTMLAudioElement>(null);
  const ytHolderRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YT.Player | null>(null);
  const staticRef = useRef<ReturnType<typeof startStatic> | null>(null);
  const offAirStaticRef = useRef<ReturnType<typeof startStatic> | null>(null);
  const stoppedRef = useRef(false);
  const activeSourceRef = useRef<"audio" | "yt" | null>(null);
  const currentYTIdRef = useRef<string | null>(null);
  const adIdRef = useRef<string | null>(null);

  useEffect(() => {
    stoppedRef.current = false;
    (async () => {
      const num = Number(number);
      const { data: st } = await supabase.from("stations").select("*").eq("number", num).maybeSingle();
      if (!st) { setError("Station not found"); return; }
      setStation(st);
      const { data: sg } = await supabase.from("songs").select("*").eq("station_id", st.id).order("position");
      setSongs(sg ?? []);
      setCommercials(await fetchCommercials());
    })();
    return () => {
      stoppedRef.current = true;
      staticRef.current?.stop();
      offAirStaticRef.current?.stop();
      staticRef.current = null;
      offAirStaticRef.current = null;
      const a = audioRef.current;
      if (a) { a.pause(); a.src = ""; }
      try { ytPlayerRef.current?.destroy(); } catch { /* noop */ }
      ytPlayerRef.current = null;
    };
  }, [number]);

  useEffect(() => {
    const id = setInterval(() => setOffAir(isOffAir()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Realtime songs + commercials
  useEffect(() => {
    if (!station) return;
    const chSongs = supabase
      .channel(`station-${station.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "songs", filter: `station_id=eq.${station.id}` },
        async () => {
          const { data: sg } = await supabase.from("songs").select("*").eq("station_id", station.id).order("position");
          setSongs(sg ?? []);
        })
      .subscribe();
    const chAds = supabase
      .channel(`commercials`)
      .on("postgres_changes", { event: "*", schema: "public", table: "commercials" },
        async () => setCommercials(await fetchCommercials()))
      .subscribe();
    return () => { supabase.removeChannel(chSongs); supabase.removeChannel(chAds); };
  }, [station]);

  const ensureYT = useCallback(async (): Promise<YT.Player> => {
    if (ytPlayerRef.current) return ytPlayerRef.current;
    const YT = await loadYouTubeAPI();
    const holder = ytHolderRef.current;
    if (!holder) throw new Error("YT holder missing");
    const inner = document.createElement("div");
    holder.appendChild(inner);
    const player = await new Promise<YT.Player>((resolve) => {
      const p = new YT.Player(inner, {
        height: "180",
        width: "320",
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, modestbranding: 1, rel: 0 },
        events: { onReady: () => resolve(p) },
      });
    });
    ytPlayerRef.current = player;
    return player;
  }, []);

  // Play a YouTube video at offset synchronously. Reuses player when videoId unchanged.
  const playYouTube = useCallback(async (videoId: string, offset: number) => {
    if (audioRef.current) audioRef.current.pause();
    activeSourceRef.current = "yt";
    const yt = await ensureYT();
    if (currentYTIdRef.current !== videoId) {
      yt.loadVideoById({ videoId, startSeconds: offset });
      currentYTIdRef.current = videoId;
    } else {
      try { yt.seekTo(offset, true); } catch { /* noop */ }
    }
    try { muted ? yt.mute() : yt.unMute(); } catch { /* noop */ }
    try { yt.setVolume(muted ? 0 : 90); } catch { /* noop */ }
    yt.playVideo();
    setPlaying(true);
  }, [ensureYT, muted]);

  const playAudioFile = useCallback(async (song: Song, offset: number) => {
    try { ytPlayerRef.current?.pauseVideo(); } catch { /* noop */ }
    currentYTIdRef.current = null;
    activeSourceRef.current = "audio";
    const audio = audioRef.current;
    if (!audio || !song.audio_url) return;
    const url = await getPlayableUrl(song.audio_url);
    if (stoppedRef.current) return;
    if (audio.src !== url) {
      audio.src = url;
      await new Promise<void>((res) => {
        const ok = () => { audio.removeEventListener("loadedmetadata", ok); res(); };
        if (audio.readyState >= 1) res();
        else audio.addEventListener("loadedmetadata", ok);
        setTimeout(res, 4000);
      });
    }
    try { audio.currentTime = offset; } catch { /* noop */ }
    audio.volume = muted ? 0 : 0.9;
    await audio.play();
    setPlaying(true);
  }, [muted]);

  const syncAndPlay = useCallback(async () => {
    if (stoppedRef.current) return;
    // Commercial break takes priority for global sync.
    const adNow = currentCommercial(commercials);
    if (adNow) {
      if (adIdRef.current !== adNow.commercial.id) {
        setAd(adNow.commercial);
        setCurrent(null);
        adIdRef.current = adNow.commercial.id;
      }
      await playYouTube(adNow.commercial.youtube_id, adNow.offset);
      return;
    }
    adIdRef.current = null;
    setAd(null);
    if (!songs.length) return;
    const head = currentPlayhead(songs);
    if (!head) return;
    setCurrent(head.song);
    if (head.song.youtube_id) {
      await playYouTube(head.song.youtube_id, head.offset);
    } else if (head.song.audio_url) {
      await playAudioFile(head.song, head.offset);
    }
  }, [songs, commercials, playYouTube, playAudioFile]);

  const stopSong = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); }
    try { ytPlayerRef.current?.pauseVideo(); } catch { /* noop */ }
    setPlaying(false);
  }, []);

  // Off-air enforcement
  useEffect(() => {
    if (needsGesture) return;
    if (offAir) {
      stopSong();
      if (!offAirStaticRef.current) {
        try { offAirStaticRef.current = startStatic(0.35); } catch { /* noop */ }
      }
    } else {
      offAirStaticRef.current?.stop();
      offAirStaticRef.current = null;
      if (!playing) syncAndPlay().catch((e) => console.error(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offAir, needsGesture, songs.length, commercials.length]);

  // Re-sync every 10s so all clients stay locked (and commercials cut in).
  useEffect(() => {
    if (needsGesture || offAir) return;
    const id = setInterval(() => {
      syncAndPlay().catch((e) => console.error("[resync]", e));
    }, 10_000);
    return () => clearInterval(id);
  }, [needsGesture, offAir, syncAndPlay]);

  const tuneIn = useCallback(async () => {
    if (!station) return;
    setNeedsGesture(false);
    setTuning(true);
    setError(null);
    try { staticRef.current = startStatic(0.5); } catch { staticRef.current = null; }

    await new Promise((r) => setTimeout(r, 2000));
    if (stoppedRef.current) return;

    if (isOffAir()) {
      setOffAir(true);
      staticRef.current?.stop();
      staticRef.current = null;
      try { offAirStaticRef.current = startStatic(0.35); } catch { /* noop */ }
      setTuning(false);
      return;
    }

    try { await syncAndPlay(); }
    catch (e) {
      console.error("playback error", e);
      setError(e instanceof Error ? e.message : "Playback failed");
    }
    staticRef.current?.fadeOut(0.8);
    setTuning(false);
  }, [station, syncAndPlay]);

  // Progress + YT ended detection (auto-advance)
  useEffect(() => {
    const id = setInterval(() => {
      if (activeSourceRef.current === "audio") {
        const a = audioRef.current;
        if (a && a.duration) setProgress(a.currentTime / a.duration);
      } else if (activeSourceRef.current === "yt") {
        const p = ytPlayerRef.current;
        if (!p) return;
        try {
          const cur = p.getCurrentTime();
          const dur = p.getDuration();
          if (dur > 0) {
            setProgress(cur / dur);
            if (cur >= dur - 0.3 && !offAir) {
              syncAndPlay().catch(() => {});
            }
          }
        } catch { /* noop */ }
      }
    }, 500);
    return () => clearInterval(id);
  }, [offAir, syncAndPlay]);

  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist ?? station?.name ?? "BCradio",
      album: `BCradio ${station ? Number(station.number).toFixed(1) : ""} FM`,
    });
  }, [current, station]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    const a = audioRef.current;
    if (a) a.volume = next ? 0 : 0.9;
    const p = ytPlayerRef.current;
    if (p) { try { next ? p.mute() : p.unMute(); p.setVolume(next ? 0 : 90); } catch { /* noop */ } }
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

  const resumeMinutes = Math.ceil(msUntilOnAir() / 60000);
  const displayDurationSec = ad ? Number(ad.duration_seconds) : (current ? Number(current.duration_seconds) : 0);

  return (
    <div className="min-h-screen px-3 sm:px-4 py-6 sm:py-8 max-w-3xl mx-auto">
      <nav className="flex items-center justify-between mb-6 sm:mb-8">
        <button onClick={() => navigate({ to: "/" })} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm">
          <ArrowLeft className="w-4 h-4" /> Dial
        </button>
        <div className="font-mono text-[10px] sm:text-xs text-muted-foreground">
          {offAir ? "OFF AIR · NIGHT" : ad ? "AD BREAK · SYNCED" : "LIVE · SYNCED WORLDWIDE"}
        </div>
      </nav>

      <div className="panel relative overflow-hidden p-4 sm:p-6 md:p-10">
        {(tuning || offAir) && <div className="absolute inset-0 tv-static z-10 pointer-events-none" />}

        <div className="text-center mb-6 sm:mb-8">
          <div className="font-mono text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground mb-2 truncate px-2">
            {station ? `${station.name}${station.tagline ? " · " + station.tagline : ""}` : "—"}
          </div>
          <div className="font-display text-6xl sm:text-7xl md:text-8xl dial-glow leading-none"
            style={{ color: station?.color ?? "var(--amber)" }}>
            {station ? Number(station.number).toFixed(1) : "···"}
          </div>
          <div className="font-mono text-sm text-muted-foreground mt-1">FM</div>
        </div>

        <div className="flex items-end justify-center gap-1 h-10 sm:h-12 mb-6 sm:mb-8">
          {Array.from({ length: 20 }).map((_, i) => (
            <span key={i} className={playing && !offAir ? "vu-bar" : ""}
              style={{
                width: 4, height: `${12 + (i % 5) * 6}px`,
                background: `linear-gradient(to top, ${station?.color ?? "#f59e0b"}, transparent)`,
                animationDelay: `${i * 0.05}s`,
                opacity: playing && !offAir ? undefined : 0.2,
              }} />
          ))}
        </div>

        <div className="text-center min-h-[60px] px-2">
          {needsGesture ? (
            <button onClick={tuneIn}
              className="px-5 py-3 rounded-full bg-amber text-primary-foreground font-medium inline-flex items-center gap-2 shadow-lg">
              <Radio className="w-4 h-4" /> Tune in
            </button>
          ) : offAir ? (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-amber">
                <Moon className="w-5 h-5" />
                <span className="font-display text-lg sm:text-xl">Off air · Night broadcast paused</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono">Silent hours: {formatOffAirWindow()}</div>
              <div className="text-xs text-muted-foreground">
                Resumes in ~{resumeMinutes} min. Songs pick back up automatically at 7:00 AM ET.
              </div>
            </div>
          ) : tuning ? (
            <div className="font-mono text-sm text-muted-foreground animate-pulse">⟨ tuning in… ⟩</div>
          ) : ad ? (
            <>
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-amber">
                <Megaphone className="w-3.5 h-3.5" /> Commercial break
              </div>
              <div className="text-lg sm:text-xl md:text-2xl font-medium mt-1 break-words">{ad.title}</div>
            </>
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

        {(current || ad) && !needsGesture && !offAir && (
          <div className="mt-6">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-amber transition-all"
                style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
            <div className="flex justify-between font-mono text-xs text-muted-foreground mt-1">
              <span>{fmtTime(progress * displayDurationSec)}</span>
              <span>{fmtTime(displayDurationSec)}</span>
            </div>
          </div>
        )}

        {!needsGesture && (
          <div className="mt-6 sm:mt-8 flex flex-col items-center gap-2">
            <button onClick={toggleMute}
              className="station-knob w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-amber"
              aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? <VolumeX className="w-7 h-7" /> : <Volume2 className="w-7 h-7" />}
            </button>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Synced worldwide · no pause · no skip
            </div>
          </div>
        )}
      </div>

      <footer className="mt-8 text-center text-xs font-mono text-muted-foreground opacity-70">
        Made by James Degenhardt
      </footer>

      <audio
        ref={audioRef}
        onPlay={() => { if (activeSourceRef.current === "audio") setPlaying(true); }}
        onPause={() => { if (activeSourceRef.current === "audio") setPlaying(false); }}
        onEnded={() => { if (!offAir) syncAndPlay().catch(() => {}); }}
        onError={() => setError("Audio failed to load")}
        playsInline
      />
      <div
        ref={ytHolderRef}
        aria-hidden
        style={{ position: "fixed", left: "-9999px", top: "-9999px", width: 1, height: 1, overflow: "hidden" }}
      />
    </div>
  );
}
