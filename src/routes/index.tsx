import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Station } from "@/lib/radio";
import { StudioModal } from "@/components/StudioModal";
import { isOffAir, formatOffAirWindow } from "@/lib/youtube";
import { Radio, Moon } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BCradio — Synchronized Worldwide Radio" },
      { name: "description", content: "Tune into BCradio stations. Same song, same moment, anywhere on earth." },
      { property: "og:title", content: "BCradio" },
      { property: "og:description", content: "Synchronized worldwide radio stations." },
    ],
  }),
  component: Home,
});

function Home() {
  const [stations, setStations] = useState<Station[]>([]);
  const [studioOpen, setStudioOpen] = useState(false);
  const [titleTaps, setTitleTaps] = useState(0);

  useEffect(() => {
    supabase.from("stations").select("*").order("number")
      .then(({ data }) => setStations(data ?? []));
  }, [studioOpen]);

  // Title acts as the "secret" gesture — open studio on click.
  const handleTitleClick = () => {
    const next = titleTaps + 1;
    setTitleTaps(next);
    if (next >= 1) {
      setStudioOpen(true);
      setTitleTaps(0);
    }
    setTimeout(() => setTitleTaps(0), 1500);
  };

  return (
    <div className="min-h-screen px-4 py-10 md:py-16 max-w-6xl mx-auto">
      <header className="text-center mb-12 md:mb-16">
        <button
          onClick={handleTitleClick}
          className="inline-flex items-center gap-3 cursor-pointer select-none"
          aria-label="BCradio"
          title="The studio is closer than you think…"
        >
          <Radio className="w-8 h-8 md:w-10 md:h-10 text-amber" />
          <h1 className="font-display text-5xl md:text-7xl tracking-tight dial-glow text-amber">
            BCradio
          </h1>
        </button>
        <p className="mt-3 text-muted-foreground text-sm md:text-base font-mono tracking-wide">
          {isOffAir() ? "OFF AIR · SILENT HOURS" : "ON AIR · BROADCASTING WORLDWIDE"} · {new Date().getFullYear()}
        </p>
        <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono border ${
          isOffAir() ? "border-amber/40 bg-amber/10 text-amber" : "border-border text-muted-foreground"
        }`}>
          <Moon className="w-3.5 h-3.5" />
          <span>Silent hours: {formatOffAirWindow()}</span>
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
          {stations.map((st) => (
            <Link
              key={st.id}
              to="/station/$number"
              params={{ number: String(Number(st.number)) }}
              className="group relative panel p-5 hover:border-amber/50 transition overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${st.color}15, transparent 70%)` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">FM</div>
                  <div className="font-display text-4xl dial-glow" style={{ color: st.color }}>
                    {Number(st.number).toFixed(1)}
                  </div>
                </div>
                <div className="station-knob w-12 h-12 rounded-full group-hover:rotate-45 transition-transform duration-500" />
              </div>
              <div className="font-medium text-lg">{st.name}</div>
              {st.tagline && <div className="text-sm text-muted-foreground mt-1">{st.tagline}</div>}
              <div className="mt-4 flex items-center gap-1">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-1 h-4 rounded-sm"
                    style={{
                      background: st.color,
                      opacity: 0.15 + (i / 14) * 0.6,
                    }}
                  />
                ))}
              </div>
            </Link>
          ))}
        </div>

        {stations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No stations yet. Tap the title to open the studio.
          </div>
        )}
      </div>

      <footer className="mt-12 text-center text-xs font-mono text-muted-foreground opacity-60">
        © BCradio · {new Date().getFullYear()}
      </footer>

      <StudioModal open={studioOpen} onClose={() => setStudioOpen(false)} />
    </div>
  );
}
