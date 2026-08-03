import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Station } from "@/lib/radio";
import { StudioModal } from "@/components/StudioModal";
import { WeatherSection } from "@/components/WeatherSection";
import { SignOffCountdown } from "@/components/SignOffCountdown";
import { isOffAir, formatOffAirWindow } from "@/lib/youtube";
import { onInstallAvailability, promptInstall, isStandalone } from "@/lib/pwa";
import {
  enableBroadcastNotifications, disableBroadcastNotifications,
  isSubscribed, notificationPermission,
} from "@/lib/push";
import { stationListenerCount, totalListeners } from "@/lib/listeners";
import { RequestsPanel } from "@/components/RequestsPanel";
import { Radio, Moon, Download, Users, Bell, BellOff, CloudSun, ListMusic } from "lucide-react";
import { toast } from "sonner";




export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BCradio — Synchronized Worldwide Radio" },
      { name: "description", content: "Tune into BCradio stations. Same song, same moment, anywhere on earth." },
      { property: "og:title", content: "BCradio" },
      { property: "og:description", content: "Synchronized worldwide radio stations by James Degenhardt." },
    ],
  }),
  component: Home,
});

function Home() {
  const [stations, setStations] = useState<Station[]>([]);
  const [studioOpen, setStudioOpen] = useState(false);
  const [titleTaps, setTitleTaps] = useState(0);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [, setTick] = useState(0);
  const [notifOn, setNotifOn] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [requestAdmin, setRequestAdmin] = useState(false);
  const [dialTaps, setDialTaps] = useState(0);


  useEffect(() => {
    supabase.from("stations").select("*").order("number")
      .then(({ data }) => setStations(data ?? []));
  }, [studioOpen]);

  useEffect(() => {
    setMounted(true);
    setInstalled(isStandalone());
    isSubscribed().then(setNotifOn);
    return onInstallAvailability(setCanInstall);
  }, []);


  const toggleNotifications = async () => {
    setNotifBusy(true);
    try {
      if (notifOn) {
        await disableBroadcastNotifications();
        setNotifOn(false);
        toast.success("Daily broadcast alerts turned off");
      } else {
        const res = await enableBroadcastNotifications();
        if (res.ok) {
          setNotifOn(true);
          toast.success("You'll get sign-on and sign-off alerts every day");
        } else {
          toast.error(res.reason);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update notifications");
    } finally {
      setNotifBusy(false);
    }
  };


  // Repaint listener counts every 2 seconds.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const handleTitleClick = () => {
    const next = titleTaps + 1;
    setTitleTaps(next);
    if (next >= 1) { setStudioOpen(true); setTitleTaps(0); }
    setTimeout(() => setTitleTaps(0), 1500);
  };


  const handleInstall = async () => {
    const result = await promptInstall();
    if (result === "unavailable") {
      alert(
        "To install BCradio:\n\n" +
        "• iPhone/iPad (Safari): tap the Share button, then 'Add to Home Screen'.\n" +
        "• Android (Chrome): tap the ⋮ menu, then 'Install app' or 'Add to Home screen'.\n" +
        "• Desktop (Chrome/Edge): click the install icon in the address bar."
      );
    }
  };

  return (
    <div className="min-h-screen px-4 py-10 md:py-16 max-w-6xl mx-auto">
      <header className="text-center mb-12 md:mb-16">
        <div className="inline-flex items-center gap-3 select-none">
          <Radio className="w-8 h-8 md:w-10 md:h-10 text-amber" />
          <h1 className="font-display text-5xl md:text-7xl tracking-tight dial-glow text-amber">
            BCradio
          </h1>
        </div>
        <div>
          <button
            onClick={handleTitleClick}
            className="mt-3 text-muted-foreground text-sm md:text-base font-mono tracking-wide cursor-pointer hover:text-amber transition-colors"
            aria-label="Broadcast status"
          >
            {isOffAir() ? "OFF AIR · SILENT HOURS" : "ON AIR · BROADCASTING WORLDWIDE"} · {new Date().getFullYear()}
          </button>
        </div>
        <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono border ${
          isOffAir() ? "border-amber/40 bg-amber/10 text-amber" : "border-border text-muted-foreground"
        }`}>
          <Moon className="w-3.5 h-3.5" />
          <span>Silent hours: {formatOffAirWindow()}</span>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono border border-amber/30 bg-amber/5 text-amber ml-2">
          <Users className="w-3.5 h-3.5" />
          <span>{totalListeners(stations).toLocaleString()} listeners across all stations</span>
        </div>

        <div className="mt-6 max-w-md mx-auto">
          <SignOffCountdown />
        </div>


        {!installed && (
          <div className="mt-5">
            <button
              onClick={handleInstall}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber text-primary-foreground text-sm font-medium shadow"
            >
              <Download className="w-4 h-4" />
              {canInstall ? "Install BCradio app" : "Add to Home Screen"}
            </button>
            <div className="mt-2 text-[11px] font-mono text-muted-foreground">
              Works offline once installed
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={toggleNotifications}
            disabled={notifBusy}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-amber/40 bg-amber/5 text-amber text-xs font-mono uppercase tracking-widest disabled:opacity-50"
          >
            {notifOn ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            {notifOn ? "Daily alerts on" : "Turn on daily alerts"}
          </button>
          <a
            href="#weather"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-border text-muted-foreground text-xs font-mono uppercase tracking-widest hover:text-amber hover:border-amber/50"
          >
            <CloudSun className="w-3.5 h-3.5" /> Weather desk
          </a>
        </div>
        <div className="mt-2 text-[11px] font-mono text-muted-foreground">
          Sign-on alert 7:30 AM ET · Sign-off warning 9:00 PM ET
          {notificationPermission() === "denied" && " · notifications blocked in browser settings"}
        </div>
      </header>


      <div className="panel p-6 md:p-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Stations</div>
            <h2 className="font-display text-2xl md:text-3xl">Turn the dial</h2>
          </div>
          <div className="hidden md:block text-xs font-mono text-muted-foreground">
            {stations.length} FREQUENCIES
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stations.map((st) => {
            const listeners = stationListenerCount(st);
            return (
              <div
                key={st.id}
                className="group relative panel p-5 hover:border-amber/50 transition overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${st.color}15, transparent 70%)` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <Link
                    to="/station/$number"
                    params={{ number: String(Number(st.number)) }}
                    className="block"
                  >
                    <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">FM</div>
                    <div className="font-display text-4xl dial-glow" style={{ color: st.color }}>
                      {Number(st.number).toFixed(1)}
                    </div>
                  </Link>
                  <div className="text-right">
                    <div className="station-knob w-12 h-12 rounded-full group-hover:rotate-45 transition-transform duration-500 ml-auto" />
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                      <Users className="w-3 h-3" /> {listeners.toLocaleString()}
                    </div>
                  </div>
                </div>
                <Link
                  to="/station/$number"
                  params={{ number: String(Number(st.number)) }}
                  className="block"
                >
                  <div className="font-medium text-lg">{st.name}</div>
                  {st.tagline && <div className="text-sm text-muted-foreground mt-1">{st.tagline}</div>}
                </Link>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <span
                        key={i}
                        className="w-1 h-4 rounded-sm"
                        style={{ background: st.color, opacity: 0.15 + (i / 10) * 0.6 }}
                      />
                    ))}
                  </div>
                  <Link
                    to="/station/$number"
                    params={{ number: String(Number(st.number)) }}
                    search={{ hd: "2" }}
                    className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border border-border text-muted-foreground hover:text-amber hover:border-amber/50"
                  >
                    HD-2
                  </Link>
                </div>
              </div>
            );
          })}
        </div>


        {stations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No stations yet.
          </div>
        )}
      </div>

      <WeatherSection />



      <footer className="mt-12 text-center text-xs font-mono text-muted-foreground opacity-70 space-y-1">
        <div>Made by James Degenhardt</div>
        <div className="opacity-60">© BCradio · {new Date().getFullYear()}</div>
      </footer>

      <StudioModal open={studioOpen} onClose={() => setStudioOpen(false)} />
    </div>
  );
}
