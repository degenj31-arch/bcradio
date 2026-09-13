import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Station, Song } from "@/lib/radio";
import { currentPlayhead, getPlayableUrl, fmtTime } from "@/lib/radio";
import { loadYouTubeAPI, isOffAir, msUntilOnAir, formatOffAirWindow, etParts } from "@/lib/youtube";
import {
  fetchCommercials, activeCommercial, nextCommercialInfo, type Commercial,
} from "@/lib/commercials";
import { hd2Playlist, stationListenerCount } from "@/lib/listeners";
import { SignOffCountdown } from "@/components/SignOffCountdown";
import { TuningDial } from "@/components/TuningDial";
import { ArrowLeft, Volume2, VolumeX, Radio, Moon, Megaphone, Users, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { SongRating } from "@/components/SongRating";


type StationSearch = { hd?: "2" };

export const Route = createFileRoute("/station/$number")({
  validateSearch: (raw: Record<string, unknown>): StationSearch => {
    const hd = raw.hd;
    return { hd: hd === "2" || hd === 2 ? "2" : undefined };
  },
  head: ({ params }) => ({
    meta: [
      { title: `BCradio ${params.number} FM` },
      { name: "description", content: `Live broadcast on BCradio ${params.number} FM.` },
      { property: "og:title", content: `BCradio ${params.number} FM` },
      { property: "og:description", content: `Live synchronized broadcast on BCradio ${params.number} FM.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StationPage,
});

function StationPage() {
  const { t, nf } = useI18n();
  const { number } = Route.useParams();
  const { hd } = Route.useSearch();
  const isHD2 = hd === "2";
  const navigate = useNavigate();


  const [station, setStation] = useState<Station | null>(null);
  const [rawSongs, setRawSongs] = useState<Song[]>([]);
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
  const [tick, setTick] = useState(0); // 1Hz repaint for clock/listeners
  const [etTimeStr, setEtTimeStr] = useState("--:--:-- ET");

  const audioRef = useRef<HTMLAudioElement>(null);
  const ytHolderRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YT.Player | null>(null);
  const activeAdKeyRef = useRef<string | null>(null);

  const stoppedRef = useRef(false);
  const activeSourceRef = useRef<"audio" | "yt" | null>(null);
  const currentYTIdRef = useRef<string | null>(null);
  const currentSongIdRef = useRef<string | null>(null);
  const adPlayingRef = useRef(false);
  const transitionRef = useRef(false);
  const fadeLevelRef = useRef(1);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  


  // Songs list (respecting HD-2 reshuffle).
  const songs = useMemo(
    () => (isHD2 && station ? hd2Playlist(station.id, rawSongs) : rawSongs),
    [isHD2, station, rawSongs]
  );

  useEffect(() => {
    stoppedRef.current = false;
    (async () => {
      const num = Number(number);
      const { data: st } = await supabase.from("stations").select("*").eq("number", num).maybeSingle();
      if (!st) { setError("Station not found"); return; }
      setStation(st);
      const { data: sg } = await supabase.from("songs").select("*").eq("station_id", st.id).order("position");
      setRawSongs(sg ?? []);
      setCommercials(await fetchCommercials());
    })();
    return () => {
      stoppedRef.current = true;
      activeAdKeyRef.current = null;

      const a = audioRef.current;
      if (a) { a.pause(); a.src = ""; }
      try { ytPlayerRef.current?.destroy(); } catch { /* noop */ }
      ytPlayerRef.current = null;
    };
  }, [number]);

  // 1Hz clock/listener repaint + off-air check.
  useEffect(() => {
    const updateClock = () => {
      const et = etParts();
      const period = et.hour >= 12 ? "PM" : "AM";
      const h12 = ((et.hour + 11) % 12) + 1;
      setEtTimeStr(`${h12}:${String(et.minute).padStart(2, "0")}:${String(et.second).padStart(2, "0")} ${period} ET`);
      setTick((t) => t + 1);
      setOffAir(isOffAir());
    };
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

  // Realtime songs + commercials + stations
  useEffect(() => {
    if (!station) return;
    const chSongs = supabase
      .channel(`station-${station.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "songs", filter: `station_id=eq.${station.id}` },
        async () => {
          const { data: sg } = await supabase.from("songs").select("*").eq("station_id", station.id).order("position");
          setRawSongs(sg ?? []);
        })
      .subscribe();
    const chAds = supabase
      .channel(`commercials-${station.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "commercials" },
        async () => setCommercials(await fetchCommercials()))
      .subscribe();
    const chStation = supabase
      .channel(`station-row-${station.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "stations", filter: `id=eq.${station.id}` },
        (payload) => setStation(payload.new as Station))
      .subscribe();
    return () => {
      supabase.removeChannel(chSongs);
      supabase.removeChannel(chAds);
      supabase.removeChannel(chStation);
    };
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
        height: "100%",
        width: "100%",
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, modestbranding: 1, rel: 0 },
        events: { onReady: () => resolve(p) },
      });
    });
    ytPlayerRef.current = player;
    return player;
  }, []);

  // Build the embedded player before the listener presses Tune in. Mobile
  // browsers only allow audible playback during the user's tap; creating the
  // iframe after that tap can consume the activation before playVideo runs.
  useEffect(() => {
    const hasYouTubeAudio = songs.some((song) => Boolean(song.youtube_id)) ||
      commercials.some((commercial) => Boolean(commercial.youtube_id));
    if (!hasYouTubeAudio || ytPlayerRef.current) return;
    ensureYT().catch((e) => console.error("[youtube-preload]", e));
  }, [songs, commercials, ensureYT]);

  // Apply the current fade level to whichever source is live.
  const applyVolume = useCallback((level = fadeLevelRef.current) => {
    fadeLevelRef.current = level;
    const a = audioRef.current;
    if (a) a.volume = muted ? 0 : 0.9 * level;
    const p = ytPlayerRef.current;
    if (p) { try { p.setVolume(muted ? 0 : Math.round(90 * level)); } catch { /* noop */ } }
  }, [muted]);

  const fadeTo = useCallback(
    (to: number, ms: number) =>
      new Promise<void>((resolve) => {
        if (fadeTimerRef.current) { clearInterval(fadeTimerRef.current); fadeTimerRef.current = null; }
        const from = fadeLevelRef.current;
        if (ms <= 0 || Math.abs(to - from) < 0.02) { applyVolume(to); resolve(); return; }
        const steps = 24;
        let i = 0;
        fadeTimerRef.current = setInterval(() => {
          i++;
          applyVolume(from + (to - from) * (i / steps));
          if (i >= steps) {
            if (fadeTimerRef.current) clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
            resolve();
          }
        }, ms / steps);
      }),
    [applyVolume]
  );

  const ytState = (p: YT.Player): number => {
    try { return p.getPlayerState(); } catch { return -1; }
  };

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
    applyVolume();
    yt.playVideo();
    // Autoplay can silently stall on first tune-in — nudge until it really starts.
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 400));
      if (stoppedRef.current) return;
      const st = ytState(yt);
      if (st === 1 || st === 3) {
        setPlaying(true);
        break;
      }
      try { if (!muted) yt.unMute(); yt.playVideo(); } catch { /* noop */ }
    }
    applyVolume();
    if (ytState(yt) !== 1 && ytState(yt) !== 3) {
      throw new Error("The station audio was blocked. Tap Tune in again to start it.");
    }
  }, [ensureYT, muted, applyVolume]);

  const playAudioPath = useCallback(async (path: string, offset: number) => {
    try { ytPlayerRef.current?.pauseVideo(); } catch { /* noop */ }
    currentYTIdRef.current = null;
    activeSourceRef.current = "audio";
    const audio = audioRef.current;
    if (!audio) return;
    const url = await getPlayableUrl(path);
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
    applyVolume();
    await audio.play();
    setPlaying(true);
  }, [applyVolume]);

  const playAudioFile = useCallback(async (song: Song, offset: number) => {
    if (!song.audio_url) return;
    await playAudioPath(song.audio_url, offset);
  }, [playAudioPath]);

  // Live position of the active source, or null when it isn't actually running.
  const livePosition = useCallback((): number | null => {
    if (activeSourceRef.current === "audio") {
      const a = audioRef.current;
      return a && !a.paused ? a.currentTime : null;
    }
    if (activeSourceRef.current === "yt") {
      const p = ytPlayerRef.current;
      if (!p) return null;
      const st = ytState(p);
      if (st !== 1 && st !== 3) return null;
      try { return p.getCurrentTime(); } catch { return null; }
    }
    return null;
  }, []);

  // Commercials are clock-driven like songs: everyone joins the break at the
  // same offset, so ad playback is synchronized worldwide.
  const playAd = useCallback(async (c: Commercial, offset: number) => {
    adPlayingRef.current = true;
    await fadeTo(0, 700);
    setAd(c);
    setCurrent(null);
    currentSongIdRef.current = null;
    if (c.youtube_id) await playYouTube(c.youtube_id, offset);
    else if (c.audio_url) await playAudioPath(c.audio_url, offset);
    await fadeTo(1, 700);
  }, [playYouTube, playAudioPath, fadeTo]);


  // Without `force`, this only nudges drift so steady playback never stutters.
  const syncAndPlay = useCallback(async (opts?: { force?: boolean; fadeIn?: boolean }) => {
    if (stoppedRef.current) return;
    if (!songs.length) return;
    const head = currentPlayhead(songs);
    if (!head) return;
    const sameSong = currentSongIdRef.current === head.song.id && !adPlayingRef.current;
    adPlayingRef.current = false;
    setAd(null);
    setCurrent(head.song);
    currentSongIdRef.current = head.song.id;

    if (sameSong && !opts?.force) {
      const pos = livePosition();
      if (pos != null) {
        // Within 3s of the world clock: leave it completely alone.
        if (Math.abs(pos - head.offset) < 3) return;
        if (activeSourceRef.current === "audio" && audioRef.current) {
          try { audioRef.current.currentTime = head.offset; } catch { /* noop */ }
          return;
        }
        if (activeSourceRef.current === "yt" && ytPlayerRef.current) {
          try { ytPlayerRef.current.seekTo(head.offset, true); } catch { /* noop */ }
          return;
        }
      }
      // pos == null → the source stalled, so fall through and reload it.
    }

    if (opts?.fadeIn) applyVolume(0);
    if (head.song.youtube_id) {
      await playYouTube(head.song.youtube_id, head.offset);
    } else if (head.song.audio_url) {
      await playAudioFile(head.song, head.offset);
    }
    if (opts?.fadeIn) await fadeTo(1, 900);
  }, [songs, playYouTube, playAudioFile, livePosition, fadeTo, applyVolume]);

  // After a song ends, advance to whatever the world clock says is next.
  const onSongEnded = useCallback(async () => {
    if (stoppedRef.current || offAir) return;
    if (transitionRef.current || adPlayingRef.current) return;
    transitionRef.current = true;
    try {
      await syncAndPlay({ force: true }).catch((e) => console.error("[advance]", e));
    } finally {
      transitionRef.current = false;
    }
  }, [offAir, syncAndPlay]);

  const stopSong = useCallback(() => {
    const a = audioRef.current;
    if (a) { a.pause(); }
    try { ytPlayerRef.current?.pauseVideo(); } catch { /* noop */ }
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (needsGesture) return;
    if (offAir) {
      stopSong();
      adPlayingRef.current = false;
      activeAdKeyRef.current = null;
      setAd(null);
      currentSongIdRef.current = null;
    } else if (!playing && !adPlayingRef.current) {
      syncAndPlay({ force: true }).catch((e) => console.error(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offAir, needsGesture, songs.length]);

  // Drift watchdog: checks every 10s but only intervenes when actually out of sync.
  useEffect(() => {
    if (needsGesture || offAir) return;
    const id = setInterval(() => {
      if (adPlayingRef.current || transitionRef.current) return;
      syncAndPlay().catch((e) => console.error("[resync]", e));
    }, 10_000);
    return () => clearInterval(id);
  }, [needsGesture, offAir, syncAndPlay]);


  const tuneIn = useCallback(async () => {
    if (!station) return;
    if (transitionRef.current) return;
    transitionRef.current = true;
    setNeedsGesture(false);
    setTuning(true);
    setError(null);

    if (isOffAir()) {
      setOffAir(true);
      setTuning(false);
      transitionRef.current = false;
      return;
    }

    // Start audibly inside the click gesture. Starting at zero and raising the
    // volume after the dial ceremony is treated as blocked autoplay on phones.
    applyVolume(1);
    const started = (async () => {
      const act = activeCommercial(commercials);
      if (act) {
        activeAdKeyRef.current = act.key;
        adPlayingRef.current = true;
        setAd(act.commercial);
        setCurrent(null);
        currentSongIdRef.current = null;
        if (act.commercial.youtube_id) await playYouTube(act.commercial.youtube_id, act.offset);
        else if (act.commercial.audio_url) await playAudioPath(act.commercial.audio_url, act.offset);
      } else {
        await syncAndPlay({ force: true });
      }
    })().catch((e) => {
      console.error("playback error", e);
      setError(e instanceof Error ? e.message : "Playback failed");
    });

    // Let the dial ceremony play out while the live audio is already running.
    await new Promise((r) => setTimeout(r, 2200));
    await started;
    if (stoppedRef.current) return;
    setTuning(false);
    transitionRef.current = false;
  }, [station, syncAndPlay, commercials, playYouTube, playAudioPath, applyVolume, fadeTo]);



  // Progress + end detection.
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
              onSongEnded().catch(() => {});
            }
          }
        } catch { /* noop */ }
      }
    }, 500);
    return () => clearInterval(id);
  }, [offAir, onSongEnded]);

  // Clock-driven commercial breaks. Every device enters and leaves the break at
  // the same instant, at the same offset into the ad — fully synchronized.
  useEffect(() => {
    if (needsGesture || offAir) return;
    const id = setInterval(() => {
      if (transitionRef.current) return;
      const act = activeCommercial(commercials);
      const running = activeAdKeyRef.current;

      if (act && act.key !== running) {
        activeAdKeyRef.current = act.key;
        transitionRef.current = true;
        playAd(act.commercial, act.offset)
          .catch((e) => console.error("[ad]", e))
          .finally(() => { transitionRef.current = false; });
        return;
      }

      if (!act && running) {
        activeAdKeyRef.current = null;
        adPlayingRef.current = false;
        transitionRef.current = true;
        (async () => {
          await fadeTo(0, 400);
          await syncAndPlay({ force: true, fadeIn: true });
        })()
          .catch((e) => console.error("[resume]", e))
          .finally(() => { transitionRef.current = false; });
        return;
      }

      // Keep the running ad locked to the global clock.
      if (act && act.key === running) {
        const pos = livePosition();
        if (pos != null && Math.abs(pos - act.offset) > 2.5) {
          if (activeSourceRef.current === "audio" && audioRef.current) {
            try { audioRef.current.currentTime = act.offset; } catch { /* noop */ }
          } else if (activeSourceRef.current === "yt" && ytPlayerRef.current) {
            try { ytPlayerRef.current.seekTo(act.offset, true); } catch { /* noop */ }
          }
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [needsGesture, offAir, commercials, playAd, syncAndPlay, fadeTo, livePosition]);


  // Rich lock-screen / CarPlay / Android Auto metadata.
  // The embedded YouTube player publishes its own media session (the raw video
  // title). We re-assert BCradio's metadata on a short interval so car head
  // units always show the station's song title, never the YouTube title.
  const progressRef = useRef(0);
  progressRef.current = progress;

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const freq = station ? Number(station.number).toFixed(1) : "";
    const ytId = ad ? ad.youtube_id : current?.youtube_id;
    const artwork = ytId
      ? [
          { src: `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`, sizes: "320x180", type: "image/jpeg" },
          { src: `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`, sizes: "1280x720", type: "image/jpeg" },
        ]
      : [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }];

    const title = ad ? `${ad.title} (${t("commercialBreak")})` : current?.title ?? "BCradio";
    const artist = ad ? "BCradio" : current?.artist || station?.name || "BCradio";
    const album = `BCradio ${freq}${isHD2 ? " HD-2" : ""} FM · Live`;

    const apply = () => {
      const md = navigator.mediaSession.metadata;
      if (!md || md.title !== title || md.artist !== artist || md.album !== album) {
        navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork });
      }
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
      try {
        const dur = ad ? Number(ad.duration_seconds) : Number(current?.duration_seconds ?? 0);
        if (dur > 0) {
          navigator.mediaSession.setPositionState({
            duration: dur,
            position: Math.min(dur, progressRef.current * dur),
            playbackRate: 1,
          });
        }
      } catch { /* unsupported */ }
    };

    apply();
    const id = setInterval(apply, 2000);

    // Live broadcast: no seeking, no skipping — advertise that to the car head unit.
    const noop = () => { /* live stream */ };
    for (const action of ["pause", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack", "stop"] as const) {
      try { navigator.mediaSession.setActionHandler(action, noop); } catch { /* unsupported */ }
    }
    try { navigator.mediaSession.setActionHandler("play", noop); } catch { /* unsupported */ }

    return () => clearInterval(id);
  }, [current, ad, station, isHD2, playing, t]);


  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    const level = fadeLevelRef.current;
    const a = audioRef.current;
    if (a) a.volume = next ? 0 : 0.9 * level;
    const p = ytPlayerRef.current;
    if (p) {
      try {
        if (next) p.mute(); else p.unMute();
        p.setVolume(next ? 0 : Math.round(90 * level));
      } catch { /* noop */ }
    }
  };


  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="panel p-6 sm:p-8 max-w-md w-full text-center">
          <h2 className="font-display text-2xl mb-2">{t("signalLost")}</h2>
          <p className="text-muted-foreground text-sm mb-4 break-words">{error}</p>
          <Link to="/" className="inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground">
            {t("backToDial")}
          </Link>
        </div>
      </div>
    );
  }

  const resumeMinutes = Math.ceil(msUntilOnAir() / 60000);
  const displayDurationSec = ad ? Number(ad.duration_seconds) : (current ? Number(current.duration_seconds) : 0);
  const showOnAirVideo = !!(
    !offAir && !needsGesture && !tuning &&
    ((ad?.show_video && ad.youtube_id) || (!ad && current?.show_video && current.youtube_id))
  );


  // Ticker data — recomputed each `tick`.
  void tick;
  const nextAd = nextCommercialInfo(commercials);
  const listeners = station ? stationListenerCount(station) : 0;

  return (
    <div className="min-h-screen px-3 sm:px-4 pt-16 pb-6 sm:pt-20 sm:pb-8 max-w-3xl mx-auto">
      <nav className="flex items-center justify-between mb-4 sm:mb-6">
        <button onClick={() => navigate({ to: "/" })} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm">
          <ArrowLeft className="w-4 h-4" /> {t("dial")}
        </button>
        <div className="font-mono text-[10px] sm:text-xs text-muted-foreground">
          {offAir ? t("offAirNight") : ad ? t("adBreak") : t("live")}
        </div>
      </nav>

      <div className="mb-4">
        <SignOffCountdown compact />
      </div>

      {/* On-air ticker */}
      <div className="panel px-3 py-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] sm:text-xs font-mono">
        <span suppressHydrationWarning className="inline-flex items-center gap-1.5 text-amber">
          <Clock className="w-3.5 h-3.5" /> {etTimeStr}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Users className="w-3.5 h-3.5" /> {nf(listeners)} {t("tunedIn")}
        </span>
        {nextAd && !offAir && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Megaphone className="w-3.5 h-3.5" />
            {t("nextBreak")}: {fmtCountdown(nextAd.msUntil)} · {nextAd.commercial.title}
          </span>
        )}
      </div>

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
          <div className="font-mono text-sm text-muted-foreground mt-1">
            FM{isHD2 && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber/20 text-amber text-[10px] tracking-widest">HD-2</span>}
          </div>
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
              <Radio className="w-4 h-4" /> {t("tuneIn")}
            </button>
          ) : offAir ? (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 text-amber">
                <Moon className="w-5 h-5" />
                <span className="font-display text-lg sm:text-xl">{t("offAirTitle")}</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono">{t("silentHours")}: {t("silentHoursValue")}</div>
              <div className="text-xs text-muted-foreground">
                {t("resumesIn", { n: nf(resumeMinutes) })}
              </div>
            </div>
          ) : tuning ? (
            <TuningDial
              frequency={station ? Number(station.number) : 88.1}
              color={station?.color ?? "#f59e0b"}
              label={station?.name}
            />

          ) : ad ? (
            <>
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-amber">
                <Megaphone className="w-3.5 h-3.5" /> {t("commercialBreak")}
              </div>
              <div className="text-lg sm:text-xl md:text-2xl font-medium mt-1 break-words">{ad.title}</div>
            </>
          ) : current ? (
            <>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{t("nowPlaying")}</div>
              <div className="text-lg sm:text-xl md:text-2xl font-medium mt-1 break-words">{current.title}</div>
              {current.artist && <div className="text-muted-foreground text-sm break-words">{current.artist}</div>}
              <SongRating
                key={current.id}
                songId={current.id}
                durationSeconds={Number(current.duration_seconds)}
              />
            </>
          ) : (
            <div className="text-muted-foreground text-sm">{t("noSongs")}</div>
          )}
        </div>

        {/* The YouTube player lives here permanently. It's parked off-screen for
            audio-only playback and expands into an on-air video screen when a
            commercial is flagged to show its clip. */}
        <div
          className={
             showOnAirVideo
              ? "mt-6 mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-amber/40 bg-black shadow-[0_0_40px_-10px_var(--amber,#f59e0b)] aspect-video [&_iframe]:h-full [&_iframe]:w-full [&>div]:h-full [&>div]:w-full"
              : "pointer-events-none fixed -left-[9999px] -top-[9999px] h-px w-px overflow-hidden"
          }
          aria-hidden={!showOnAirVideo}
        >
          <div ref={ytHolderRef} className="h-full w-full" />
        </div>
        {showOnAirVideo && (
          <div className="mt-2 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {ad ? t("commercialBreak") : t("nowPlaying")}
          </div>
        )}



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
              {t("syncedNote")}
            </div>
            {station && (
              <div className="mt-2 flex gap-2">
                {!isHD2 ? (
                  <Link
                    to="/station/$number"
                    params={{ number: String(Number(station.number)) }}
                    search={{ hd: "2" }}
                    className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border border-border text-muted-foreground hover:text-amber hover:border-amber/50"
                  >
                    {t("switchHD2")}
                  </Link>
                ) : (
                  <Link
                    to="/station/$number"
                    params={{ number: String(Number(station.number)) }}
                    search={{}}
                    className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border border-border text-muted-foreground hover:text-amber hover:border-amber/50"
                  >
                    {t("switchMain")}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="mt-8 text-center text-xs font-mono text-muted-foreground opacity-70">
        {t("madeBy")}
      </footer>

      <audio
        ref={audioRef}
        onPlay={() => { if (activeSourceRef.current === "audio") setPlaying(true); }}
        onPause={() => { if (activeSourceRef.current === "audio") setPlaying(false); }}
        onEnded={() => { if (!offAir) onSongEnded().catch(() => {}); }}
        onError={() => setError("Audio failed to load")}
        playsInline
      />
    </div>
  );
}

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
